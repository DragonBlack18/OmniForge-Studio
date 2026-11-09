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
  let disposed = false, untitledSequence = 0;
  const closedPaths = [];
  const pendingCreates=new Map();
  const reservedSlots=()=>[...pendingCreates.values()].filter(r=>r.copy).length;
  const reservedBytes=()=>[...pendingCreates.values()].reduce((n,r)=>n+(r.copy?r.bytes:0),0);
  const isDirty = d => Boolean(d.untitled) || d.content !== d.baseline;
  const documents = new Map(), listeners = new Set(), resources = new Map(), openings = new Map();
  let snapshot;
  const keyOf = path => caseInsensitive ? path.toLowerCase() : path;
  const valid = (document, generation) => !disposed && epoch === generation && documents.get(document.key) === document;
  const publish = () => {
    const docs = [...documents.values()].map(d => Object.freeze({
      key:d.key, path:d.path, content:d.content, baseline:d.baseline, revision:d.revision,
      dirty:isDirty(d), untitled:Boolean(d.untitled), label:d.label || d.path.split('/').at(-1), version:d.version, edit:d.edit,
      draft:d.draft, protection:d.protection, error:d.error, blocked:d.blocked, saving:d.saving,
      uri:d.uri, view:d.view
    }));
    snapshot = Object.freeze({scope, root, active, jump, documents:Object.freeze(docs),
      dirty:docs.some(d=>d.dirty), pending:docs.filter(d=>d.dirty).length, recentClosed:Object.freeze([...closedPaths])});
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
    if (disposed || d.untitled || d.saving || d.draft || d.blocked || (d.content === d.baseline && !d.draftToken)) return;
    d.protection = 'pending';
    const generation = epoch;
    d.timer = setTimer(() => {
      d.timer = null;
      if (valid(d,generation)) checkpoint(d).catch(()=>{});
    }, delay);
  };
  const checkpoint = d => {
    cancelTimer(d);
    if (d.untitled) return Promise.resolve(false);
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
    documents.clear(); openings.clear(); pendingCreates.clear(); closedPaths.length = 0; publish();
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
    if (!ownPath(path) || path.startsWith('@untitled/')) throw new Error('Caminho relativo inválido.');
    const key = keyOf(path), generation = epoch, capturedRoot = root;
    if(pendingCreates.has(key))throw Error('Aguarde a criação deste arquivo antes de abri-lo.');
    if (documents.has(key)) return activate(path,position);
    if (openings.has(key)) { await openings.get(key); if (epoch === generation && documents.has(key)) return activate(path,position); return null; }
    if (documents.size + openings.size + reservedSlots() >= DOCUMENT_LIMIT) throw new Error('Limite de 16 arquivos abertos. Feche uma aba antes de continuar.');
    const opening = (async () => {
      const loaded = await api.readFile(path);
      if (epoch !== generation || disposed) return null;
      if (typeof loaded?.content !== 'string' || !goodRevision(loaded.revision)) throw new Error('Resposta inválida ao abrir arquivo.');
      if ([...documents.values()].reduce((sum,d)=>sum+bytes(d.content),bytes(loaded.content)+reservedBytes()) > OPEN_TEXT_BUDGET)
        throw new Error('Limite de texto das abas atingido. Feche arquivos antes de abrir outro.');
      let draft = null, error = '', blocked = false;
      try {
        draft = await api.readEditorDraft(capturedRoot,path);
        if (draft && (typeof draft.content !== 'string' || !goodRevision(draft.baseRevision) || !goodRevision(draft.draftRevision)))
          throw new Error('Contrato do rascunho inválido.');
      } catch (cause) { blocked = true; error = 'Recuperação indisponível: ' + (cause?.message || 'erro local'); }
      if (epoch !== generation || disposed) return null;
      if ([...documents.values()].reduce((sum,d)=>sum+bytes(d.content),bytes(loaded.content)+reservedBytes()) > OPEN_TEXT_BUDGET)
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
    if (d.untitled) throw new Error('Defina o destino em Salvar como antes de gravar este documento.');
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
    const pending = [...documents.values()].filter(isDirty);
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
    if (isDirty(d)) {
      if (choice === 'save') {
        await save(path);
        if (!valid(d,generation) || isDirty(d)) return false;
      } else if (choice !== 'discard') return false;
    }
    cancelTimer(d); await d.queue;
    if (!valid(d,generation)) return false;
    if (choice === 'discard' && d.edit !== editVersion) return false;
    if (choice !== 'discard' && isDirty(d)) return false;
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
    if (choice !== 'discard' && isDirty(d)) return false;
    const keys = [...documents.keys()], index = keys.indexOf(d.key);
    if (!d.untitled) { const prior=closedPaths.indexOf(d.path); if(prior>=0)closedPaths.splice(prior,1); closedPaths.unshift(d.path); closedPaths.splice(10); }
    documents.delete(d.key); disposeResource(d.key);
    if (active === d.key) active = keys[index+1] || keys[index-1] || null;
    jump = null; publish(); return true;
  };
  const flush = async ({allowUntitled=false} = {}) => {
    const generation = epoch;
    const docs = [...documents.values()];
    await Promise.all(docs.map(d=>checkpoint(d)));
    if (epoch !== generation) return false;
    return docs.every(d=>d.untitled ? allowUntitled : d.content===d.baseline || d.draft ||
      (d.lastProtected===d.content && d.protectedBase===d.revision));
  };
  const newDocument = ({content='',extension='txt'}={}) => {
    if(disposed)throw Error('Sessão encerrada.');
    if(typeof content!=='string'||!/^[a-z][a-z0-9.]{0,14}$/i.test(extension))throw Error('Documento novo inválido.');
    if(documents.size+openings.size+reservedSlots()>=DOCUMENT_LIMIT)throw Error('Limite de 16 arquivos abertos.');
    if([...documents.values()].reduce((sum,d)=>sum+bytes(d.content),bytes(content)+reservedBytes())>OPEN_TEXT_BUDGET)throw Error('Limite de texto das abas atingido.');
    const path='@untitled/'+makeId()+'.'+extension,key=keyOf(path);
    const d={key,path,label:'Sem título '+(++untitledSequence)+'.'+extension,untitled:true,
      content,baseline:'',revision:null,version:1,edit:0,draft:null,draftToken:null,blocked:false,error:'',
      protection:'memory',saving:false,timer:null,queue:Promise.resolve(),lastProtected:null,protectedBase:null,view:null,
      uri:'file:///omniforge/'+scope+'/__unsaved__/'+encodeURIComponent(path.split('/').at(-1))};
    documents.set(key,d);activate(path);return path;
  };
  const attachInitialWorkspace = nextRoot => {
    if(root || typeof nextRoot!=='string'||!nextRoot||[...documents.values()].some(d=>!d.untitled))throw Error('Somente documentos novos podem acompanhar a primeira pasta.');
    epoch++;root=nextRoot;publish();
  };
  const saveAs = async (path,destination,{parents=false}={}) => {
    if(!root)throw Error('Escolha uma pasta de projeto antes de salvar.');
    if(typeof api.createAuthoredFile!=='function')throw Error('Criação de arquivos indisponível.');
    if(!ownPath(destination)||destination.startsWith('@untitled/'))throw Error('Destino relativo inválido.');
    const d=ensure(path),generation=epoch,capturedRoot=root,targetKey=keyOf(destination),content=d.content;
    if(d.saving||d.draft)throw Error('Resolva o salvamento ou rascunho pendente.');
    if(documents.has(targetKey)||openings.has(targetKey)||pendingCreates.has(targetKey))throw Error('O destino já está aberto. Use outro nome.');
    if(!d.untitled && documents.size+openings.size+reservedSlots()>=DOCUMENT_LIMIT)throw Error('Feche uma aba antes de criar uma cópia.');
    if(!d.untitled&&[...documents.values()].reduce((n,item)=>n+bytes(item.content),bytes(content)+reservedBytes())>OPEN_TEXT_BUDGET)throw Error('Limite de texto para abrir uma cópia.');
    const reservation={copy:!d.untitled,bytes:bytes(content)};pendingCreates.set(targetKey,reservation);
    d.saving=true;cancelTimer(d);publish();
    try {
      await d.queue;if(!valid(d,generation))throw Error('Projeto alterado antes de criar o arquivo.');
      const result=await api.createAuthoredFile(capturedRoot,destination,content,parents);
      if(!valid(d,generation))return {...result,stale:true};
      if(!goodRevision(result?.revision))throw Error('Resposta de criação inválida.');
      if(pendingCreates.get(targetKey)===reservation)pendingCreates.delete(targetKey);
      if(!d.untitled){
        try{await open(destination);}catch(error){throw Error('Cópia criada em '+destination+', mas não foi possível abrir a aba: '+error.message);}
        return {...result,copy:true};
      }
      const oldKey=d.key;documents.delete(oldKey);disposeResource(oldKey);
      Object.assign(d,{path:destination,key:targetKey,label:destination.split('/').at(-1),untitled:false,
        baseline:content,revision:result.revision,version:d.version+1,error:'',protection:'idle',
        uri:'file:///omniforge/'+scope+'/'+destination.split('/').map(encodeURIComponent).join('/')});
      documents.set(targetKey,d);active=targetKey;jump=null;publish();return {...result,unchanged:d.content===content};
    }finally{if(pendingCreates.get(targetKey)===reservation)pendingCreates.delete(targetKey);if(valid(d,generation)){d.saving=false;schedule(d);publish();}}
  };
  const reopenClosed = async () => {
    const path=closedPaths[0];if(!path)throw Error('Não há aba fechada nesta sessão.');
    const generation=epoch;await open(path);
    if(epoch===generation){closedPaths.splice(closedPaths.indexOf(path),1);publish();}
  };
  const closeSaved = async ({exceptActive=false}={}) => {
    const generation=epoch,current=active,targets=[...documents.values()].filter(d=>!isDirty(d)&&(!exceptActive||d.key!==current));let count=0;
    for(const d of targets){if(!valid(d,generation))break;if(await close(d.path,'cancel'))count++;}return count;
  };
  publish();
  return {
    getSnapshot:()=>snapshot,
    subscribe(listener) { listeners.add(listener); return ()=>listeners.delete(listener); },
    reset, open, activate, edit, save, saveAll, restore, discardDraft, close, flush,
    newDocument, attachInitialWorkspace, saveAs, reopenClosed, closeSaved,
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
