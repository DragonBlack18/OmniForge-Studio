/**
 * Project-scoped document ownership. No Monaco/DOM/native imports.
 * Per-document queues pin draft CAS tokens; original writes are explicit.
 * A cancelled/stale open cannot join a different workspace session.
 */
export const DOCUMENT_LIMIT = 16;
export const OPEN_TEXT_BUDGET = 8 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/;
const bytes = text => new TextEncoder().encode(text).byteLength;
const ownPath = value => typeof value === 'string' && value.length > 0 && value.length <= 300 &&
  !/[\\\x00-\x1f:]/.test(value) && !value.startsWith('/') &&
  value.split('/').every(segment => segment && segment !== '.' && segment !== '..');
const goodRevision = value => typeof value === 'string' && HASH.test(value);

export function createDocumentSession(api, {
  delay = 700, setTimer = setTimeout, clearTimer = clearTimeout,
  makeId = () => globalThis.crypto.randomUUID(), caseInsensitive = true
} = {}) {
  for (const name of ['readFile','saveFile','readEditorDraft','writeEditorDraft','discardEditorDraft'])
    if (typeof api?.[name] !== 'function') throw new TypeError('API de documentos incompleta: ' + name);
  let root = '', epoch = 0, scope = makeId(), active = null, jump = null, sequence = 0;
  let disposed = false;
  const documents = new Map(), listeners = new Set(), resources = new Map(), openings = new Map();
  let snapshot;
  const keyOf = path => caseInsensitive ? path.toLowerCase() : path;
  const valid = (document, generation) => !disposed && epoch === generation && documents.get(document.key) === document;
  const publish = () => {
    const docs = [...documents.values()].map(d => Object.freeze({
      key:d.key, path:d.path, content:d.content, baseline:d.baseline, revision:d.revision,
      dirty:d.content !== d.baseline, version:d.version, edit:d.edit,
      draft:d.draft, protection:d.protection, error:d.error, blocked:d.blocked, saving:d.saving,
      uri:d.uri, view:d.view
    }));
    snapshot = Object.freeze({scope, root, active, jump, documents:Object.freeze(docs),
      dirty:docs.some(d=>d.dirty), pending:docs.filter(d=>d.dirty).length});
    for (const listener of listeners) listener();
  };
  const cancelTimer = d => { if (d.timer !== null) clearTimer(d.timer); d.timer = null; };
  const queue = (d, operation) => {
    const next = d.queue.catch(()=>{}).then(operation);
    d.queue = next.catch(()=>{});
    return next;
  };
  const ensure = path => {
    const d = documents.get(keyOf(path));
    if (!d) throw new Error('Documento não está aberto.');
    return d;
  };
  const schedule = d => {
    cancelTimer(d);
    if (disposed || d.saving || d.draft || d.blocked || (d.content === d.baseline && !d.draftToken)) return;
    d.protection = 'pending';
    const generation = epoch;
    d.timer = setTimer(() => {
      d.timer = null;
      if (valid(d,generation)) checkpoint(d).catch(()=>{});
    }, delay);
  };
  const checkpoint = d => {
    cancelTimer(d);
    const generation = epoch, capturedRoot = root;
    return queue(d, async () => {
      if (!valid(d,generation) || d.saving || d.draft || d.blocked) return false;
      if (d.content === d.baseline) {
        if (!d.draftToken) return true;
        const edit = d.edit, token = d.draftToken;
        try {
          const current = await api.readFile(d.path);
          if (!valid(d,generation) || d.edit !== edit || current.revision !== d.revision) return false;
          await api.discardEditorDraft(capturedRoot,d.path,token);
          if (valid(d,generation)) {
            d.draftToken = null; d.lastProtected = null; d.protectedBase = null;
            d.protection = d.content === d.baseline ? 'idle' : 'pending'; d.error = '';
            if (d.content !== d.baseline) schedule(d);
            publish();
          }
          return true;
        } catch (error) {
          if (valid(d,generation)) { d.error = 'Cópia de recuperação preservada: ' + error.message; d.protection = 'failed'; publish(); }
          return false;
        }
      }
      const text = d.content, revision = d.revision;
      if (d.lastProtected === text && d.protectedBase === revision) return true;
      try {
        const result = await api.writeEditorDraft(capturedRoot,d.path,text,revision,d.draftToken);
        if (!valid(d,generation)) return false;
        d.draftToken = result.draftRevision;
        d.lastProtected = text; d.protectedBase = revision;
        d.protection = d.content === text ? 'saved' : 'pending'; d.error = '';
        if (d.content !== text) schedule(d);
        publish();
        return true;
      } catch (error) {
        if (valid(d,generation)) {
          d.protection = 'failed'; d.error = 'Rascunho não atualizado: ' + (error?.message || 'erro local');
          publish();
        }
        return false;
      }
    });
  };
  const disposeResource = key => {
    const resource = resources.get(key);
    resources.delete(key);
    try { resource?.dispose(); } catch { /* Original document remains in the session. */ }
  };
  const reset = nextRoot => {
    if (typeof nextRoot !== 'string') throw new TypeError('Workspace inválido.');
    epoch++; root = nextRoot; scope = makeId(); active = null; jump = null;
    for (const d of documents.values()) cancelTimer(d);
    for (const key of resources.keys()) disposeResource(key);
    documents.clear(); openings.clear(); publish();
  };
  const activate = (path, position) => {
    const d = ensure(path); active = d.key;
    if (position && Number.isSafeInteger(position.line) && position.line > 0 &&
        Number.isSafeInteger(position.column) && position.column > 0)
      jump = {key:d.key,line:position.line,column:position.column,sequence:++sequence};
    else jump = null;
    publish(); return d.key;
  };
  const open = async (path, position) => {
    if (disposed || !root) throw new Error('Abra um projeto antes de abrir arquivos.');
    if (!ownPath(path)) throw new Error('Caminho relativo inválido.');
    const key = keyOf(path), generation = epoch, capturedRoot = root;
    if (documents.has(key)) return activate(path,position);
    if (openings.has(key)) { await openings.get(key); if (epoch === generation && documents.has(key)) return activate(path,position); return null; }
    if (documents.size + openings.size >= DOCUMENT_LIMIT) throw new Error('Limite de 16 arquivos abertos. Feche uma aba antes de continuar.');
    const opening = (async () => {
      const loaded = await api.readFile(path);
      if (epoch !== generation || disposed) return null;
      if (typeof loaded?.content !== 'string' || !goodRevision(loaded.revision)) throw new Error('Resposta inválida ao abrir arquivo.');
      if ([...documents.values()].reduce((sum,d)=>sum+bytes(d.content),bytes(loaded.content)) > OPEN_TEXT_BUDGET)
        throw new Error('Limite de texto das abas atingido. Feche arquivos antes de abrir outro.');
      let draft = null, error = '', blocked = false;
      try {
        draft = await api.readEditorDraft(capturedRoot,path);
        if (draft && (typeof draft.content !== 'string' || !goodRevision(draft.baseRevision) || !goodRevision(draft.draftRevision)))
          throw new Error('Contrato do rascunho inválido.');
      } catch (cause) { blocked = true; error = 'Recuperação indisponível: ' + (cause?.message || 'erro local'); }
      if (epoch !== generation || disposed) return null;
      if ([...documents.values()].reduce((sum,d)=>sum+bytes(d.content),bytes(loaded.content)) > OPEN_TEXT_BUDGET)
        throw new Error('Limite de texto das abas atingido. Feche arquivos antes de abrir outro.');
      const d = {key,path,content:loaded.content,baseline:loaded.content,revision:loaded.revision,
        version:1,edit:0,draft,draftToken:draft?.draftRevision ?? null,blocked,error,
        protection:draft?'available':blocked?'failed':'idle',saving:false,timer:null,queue:Promise.resolve(),
        lastProtected:null,protectedBase:null,view:null,
        uri:'file:///omniforge/' + scope + '/' + path.split('/').map(encodeURIComponent).join('/')};
      documents.set(key,d); activate(path,position); return key;
    })();
    openings.set(key,opening);
    try { return await opening; }
    finally { if (openings.get(key) === opening) openings.delete(key); }
  };
  const edit = (path,text) => {
    const d = ensure(path);
    if (typeof text !== 'string') throw new TypeError('Texto do documento inválido.');
    if (d.draft) throw new Error('Resolva o rascunho pendente antes de editar.');
    if (d.content === text) return false;
    d.content = text; d.edit++; schedule(d); publish(); return true;
  };
  const save = async path => {
    const d = ensure(path), generation = epoch, capturedRoot = root;
    if (d.draft) throw new Error('Resolva o rascunho recuperável antes de salvar.');
    if (d.saving) throw new Error('Este documento já está sendo salvo.');
    if (d.content === d.baseline) return {path:d.path,unchanged:true};
    const content = d.content, revision = d.revision;
    cancelTimer(d); d.saving = true; publish();
    try {
      await d.queue;
      if (!valid(d,generation)) throw new Error('Projeto alterado durante o salvamento.');
      const result = await api.saveFile(d.path,content,revision);
      if (!valid(d,generation)) return {path:d.path,stale:true};
      if (!goodRevision(result?.revision)) throw new Error('Revisão de salvamento inválida.');
      d.revision = result.revision; d.baseline = content; d.error = '';
      if (d.content === content && d.draftToken) {
        try {
          await api.discardEditorDraft(capturedRoot,d.path,d.draftToken);
          if (valid(d,generation)) { d.draftToken = null; d.lastProtected = null; d.protectedBase = null; }
        } catch (error) {
          if (valid(d,generation)) d.error = 'Arquivo salvo; cópia anterior preservada: ' + (error?.message || 'erro local');
        }
      }
      if (valid(d,generation)) {
        d.protection = d.error ? 'failed' : d.content === content ? 'idle' : 'pending';
        publish();
      }
      return {path:d.path,unchanged:d.content === content,revision:result.revision};
    } catch (error) {
      if (valid(d,generation)) { d.error = 'Salvamento recusado: ' + (error?.message || 'erro local'); publish(); }
      throw error;
    } finally {
      if (valid(d,generation)) { d.saving = false; schedule(d); publish(); }
    }
  };
  const saveAll = async () => {
    // Pin document identities, not just relative names. A late response from
    // project A must never cause the next write to a same-named tab in B.
    const generation = epoch;
    const pending = [...documents.values()].filter(d=>d.content !== d.baseline);
    const saved = [];
    for (const document of pending) {
      if (!valid(document,generation)) throw new Error('Projeto alterado durante Salvar todos. A sequência foi interrompida.');
      try {
        const result = await save(document.path);
        if (!valid(document,generation) || result.stale)
          throw new Error('Projeto alterado durante Salvar todos. Confira o resultado da gravação em andamento.');
        saved.push(result);
      } catch (cause) {
        if (epoch !== generation || disposed) throw new Error('Projeto alterado durante Salvar todos. Nenhum próximo documento será salvo.');
        throw new Error(`${saved.length}/${pending.length} arquivo(s) salvos. Interrompido em ${document.path}: ${cause.message}`);
      }
    }
    return saved;
  };
  const restore = async path => {
    const d = ensure(path), generation = epoch, draft = d.draft;
    if (!draft) return false;
    const current = await api.readFile(d.path);
    if (!valid(d,generation) || d.draft !== draft) return false;
    if (current.revision !== draft.baseRevision || current.revision !== d.revision)
      throw new Error('O arquivo original mudou. Compare ou copie o rascunho antes de descartar.');
    d.content = draft.content; d.version++; d.edit++; d.draft = null;
    d.lastProtected = draft.content; d.protectedBase = draft.baseRevision;
    d.protection = 'saved'; d.error = ''; publish(); return true;
  };
  const discardDraft = async path => {
    const d = ensure(path), generation = epoch, capturedRoot = root;
    if (!d.draft) return false;
    const token = d.draft.draftRevision;
    await d.queue;
    if (!valid(d,generation)) return false;
    await api.discardEditorDraft(capturedRoot,d.path,token);
    if (!valid(d,generation)) return false;
    d.draft = null; d.draftToken = null; d.protection = 'idle'; d.error = ''; publish(); return true;
  };
  const close = async (path, choice = 'cancel') => {
    const d = ensure(path), generation = epoch, capturedRoot = root, editVersion = d.edit;
    if (d.saving) throw new Error('Aguarde o salvamento antes de fechar esta aba.');
    if (d.content !== d.baseline) {
      if (choice === 'save') {
        await save(path);
        if (!valid(d,generation) || d.content !== d.baseline) return false;
      } else if (choice !== 'discard') return false;
    }
    cancelTimer(d); await d.queue;
    if (!valid(d,generation)) return false;
    if (choice === 'discard' && d.edit !== editVersion) return false;
    if (choice !== 'discard' && d.content !== d.baseline) return false;
    if (choice === 'discard' && d.draftToken && !d.draft) {
      await api.discardEditorDraft(capturedRoot,d.path,d.draftToken);
      if (!valid(d,generation)) return false;
      // Native deletion can yield to a new keystroke. Retire only the token
      // actually deleted, keep that edit/model, and checkpoint it afresh.
      d.draftToken = null; d.lastProtected = null; d.protectedBase = null;
      d.protection = d.content === d.baseline ? 'idle' : 'pending';
      if (d.edit !== editVersion) { schedule(d); publish(); return false; }
    }
    // There is no await between this decision and model removal.
    if (choice !== 'discard' && d.content !== d.baseline) return false;
    const keys = [...documents.keys()], index = keys.indexOf(d.key);
    documents.delete(d.key); disposeResource(d.key);
    if (active === d.key) active = keys[index+1] || keys[index-1] || null;
    jump = null; publish(); return true;
  };
  const flush = async () => {
    const generation = epoch;
    const docs = [...documents.values()];
    await Promise.all(docs.map(d=>checkpoint(d)));
    if (epoch !== generation) return false;
    return docs.every(d=>d.content===d.baseline || d.draft ||
      (d.lastProtected===d.content && d.protectedBase===d.revision));
  };
  publish();
  return {
    getSnapshot:()=>snapshot,
    subscribe(listener) { listeners.add(listener); return ()=>listeners.delete(listener); },
    reset, open, activate, edit, save, saveAll, restore, discardDraft, close, flush,
    cycle(direction=1) {
      const keys=[...documents.keys()]; if(!keys.length)return;
      active=keys[(Math.max(0,keys.indexOf(active))+(direction<0?-1:1)+keys.length)%keys.length]; jump=null; publish();
    },
    setView(path,view) { const d=documents.get(keyOf(path)); if(d)d.view=view; },
    retain(path,resource) {
      const d=ensure(path), old=resources.get(d.key);
      if(old===resource)return;
      if(old)disposeResource(d.key);
      resources.set(d.key,resource);
    },
    dispose() { if(disposed)return; reset(''); disposed=true; listeners.clear(); }
  };
}
