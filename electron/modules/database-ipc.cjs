'use strict';

/** Named IPC, native consent and late workspace/revision checks for SQLite snapshots. */
function installDatabaseIpc({ register, dialog, getWorkspace, getWindow, isHostBusy = () => false,
  onFinished, spawnProcess, clipboard }) {
  let modulePromise, session = null, working = false, pending = false, pendingCancelled = false, generation = 0;
  const load = () => modulePromise ||= import('../../core/modules/database/database-session.mjs');
  const isActive = () => working || pending || Boolean(session?.isActive) || Boolean(session?.isSaving);
  const snapshot = () => session?.snapshot() || null;

  function notify(event) {
    try {
      const target = getWindow();
      if (target && !target.isDestroyed() && !target.webContents.isDestroyed()) target.webContents.send('omni:databaseEvent', event);
    } catch { /* The accepted image stays owned by main if the renderer disappears. */ }
  }
  async function ensureSession() {
    if (session) return session;
    const core = await load();
    session ||= new core.DatabaseSession({ onEvent: notify, spawnProcess: spawnProcess || (() => {
      const { utilityProcess } = require('electron');
      return utilityProcess.fork(core.databaseWorkerPath, [], { stdio: 'ignore', serviceName: 'OmniForge SQLite' });
    }) });
    return session;
  }
  function ready() {
    if (isActive() || isHostBusy()) throw new Error('Conclua a operação atual antes de usar o Banco SQLite.');
  }
  function checkWorkspace(workspace) {
    if (workspace !== getWorkspace()) throw new Error('O workspace mudou. Reabra a sessão SQLite.');
    if (session?.hasSession && session.snapshot().workspace !== workspace) throw new Error('A sessão SQLite pertence a outro workspace. Feche a sessão antes de continuar.');
  }
  async function guarded(action) {
    ready();
    working = true;
    const token = generation;
    try {
      const workspace = getWorkspace(), manager = await ensureSession();
      if (token !== generation) return null;
      checkWorkspace(workspace);
      return await action(manager, workspace, token);
    } finally { working = false; onFinished?.(); }
  }
  async function consent(options, workspace, token) {
    pending = true; pendingCancelled = false;
    try {
      const answer = await dialog.showMessageBox(getWindow(), {
        type: 'warning', buttons: ['Cancelar', 'Confirmar'], defaultId: 0, cancelId: 0, noLink: true, ...options
      });
      if (pendingCancelled || token !== generation || answer.response !== 1) return false;
      checkWorkspace(workspace);
      if (isHostBusy()) throw new Error('Outra operação foi iniciada. Revise e confirme novamente.');
      return true;
    } finally { pending = false; }
  }

  register('listDatabaseFiles', async () => {
    const workspace = getWorkspace();
    const core = await load(), result = await core.listDatabaseFiles(workspace);
    if (workspace !== getWorkspace()) throw new Error('O workspace mudou durante a leitura.');
    return result;
  });
  register('databaseState', () => snapshot());
  register('copyDatabaseResult', (sessionId, text) => {
    const state = snapshot();
    if (!state || typeof sessionId !== 'string' || sessionId !== state.sessionId) throw new Error('A sessão SQLite mudou. Consulte novamente antes de copiar.');
    checkWorkspace(getWorkspace());
    if (typeof text !== 'string' || text.includes('\0') || Buffer.byteLength(text, 'utf8') > 2 * 1024 * 1024) {
      throw new Error('Resultado de cópia inválido ou maior que 2 MiB.');
    }
    (clipboard || require('electron').clipboard).writeText(text, 'clipboard');
    return true;
  });
  register('createDatabase', () => guarded((manager, workspace) => manager.create(workspace)));
  register('openDatabase', relativePath => {
    const relative = relativePath;
    return guarded((manager, workspace) => manager.open(workspace, relative));
  });
  register('queryDatabase', request => guarded(async (manager, _workspace, token) => {
    const core = await load(), accepted = core.databaseRequest(request);
    if (token !== generation) return null;
    return manager.execute(accepted, 'query');
  }));
  register('applyDatabaseSql', request => guarded(async (manager, workspace, token) => {
    const core = await load(), accepted = core.databaseRequest(request);
    manager.assertRevision(accepted);
    if (token !== generation) return null;
    const source = manager.snapshot().sourcePath || 'Novo banco';
    const excerpt = accepted.sql.slice(0, 6000);
    const approved = await consent({ title: 'Aplicar SQL no rascunho', message: 'Aplicar alterações no rascunho SQLite?',
      buttons: ['Cancelar', 'Aplicar alterações'],
      detail: 'Workspace: ' + workspace + '\nOrigem: ' + source + '\nRevisão da sessão: ' + accepted.revision +
        '\n\nO script inteiro será aplicado em uma transação. Em caso de erro ou interrupção, a versão anterior da sessão será preservada. O arquivo de origem não será alterado.' +
        '\n\nSQL (' + Buffer.byteLength(accepted.sql, 'utf8') + ' bytes):\n' + excerpt +
        (excerpt.length < accepted.sql.length ? '\n… SQL completo no editor, bloqueado durante esta confirmação.' : '') +
        '\n\nParâmetros vinculados: ' + Object.keys(accepted.params).length
    }, workspace, token);
    if (!approved) return null;
    manager.assertRevision(accepted);
    return manager.execute(accepted, 'apply');
  }));
  register('cancelDatabaseQuery', request => {
    if (!request || typeof request.sessionId !== 'string' || typeof request.requestId !== 'string') return false;
    return Boolean(session?.cancel({ sessionId: request.sessionId, requestId: request.requestId }));
  });
  register('saveDatabaseCopy', request => guarded(async (manager, workspace, token) => {
    const accepted = { sessionId: request?.sessionId, revision: request?.revision, relativePath: request?.relativePath };
    const plan = await manager.prepareSave(accepted);
    if (token !== generation) return null;
    const approved = await consent({ title: 'Salvar cópia SQLite', message: 'Criar uma nova cópia SQLite?',
      buttons: ['Cancelar', 'Salvar cópia'],
      detail: 'Workspace: ' + workspace + '\nNovo arquivo: ' + plan.relativePath +
        '\nRevisão da sessão: ' + plan.revision + '\nTamanho: ' + plan.bytes + ' bytes' +
        '\n\nO destino deve ser novo. Nenhum arquivo existente será substituído. A cópia contém a versão atual do rascunho, não alterações posteriores feitas na origem por outros aplicativos.'
    }, workspace, token);
    if (!approved) return null;
    manager.assertRevision(accepted);
    return manager.saveCopy(accepted);
  }));
  register('closeDatabase', sessionId => guarded(async (manager, workspace, token) => {
    const state = manager.snapshot();
    if (!state) return true;
    if (typeof sessionId !== 'string' || state.sessionId !== sessionId) throw new Error('A sessão SQLite mudou. Atualize antes de fechar.');
    if (state.dirty) {
      const approved = await consent({ title: 'Fechar rascunho SQLite', message: 'Descartar alterações SQLite sem cópia salva?',
        buttons: ['Cancelar', 'Descartar e fechar'],
        detail: 'Workspace: ' + workspace + '\nOrigem: ' + (state.sourcePath || 'Novo banco') +
          '\nRevisão da sessão: ' + state.revision + '\n\nAs alterações estão somente em memória. Salve uma cópia antes de fechar para mantê-las.'
      }, workspace, token);
      if (!approved) return false;
      manager.assertRevision(state);
    }
    manager.reset({ discard: true }); return true;
  }));

  return { isActive, isPending: () => pending, isSaving: () => Boolean(session?.isSaving),
    hasUnsavedChanges: () => Boolean(session?.hasUnsavedChanges), hasSession: () => Boolean(session?.hasSession), snapshot,
    reset: options => { generation++; pendingCancelled = true; return session?.reset(options) ?? true; },
    cancel: () => { generation++; if (pending) pendingCancelled = true; const stopped = session?.cancel() || false; return pending || working || stopped; },
    dispose: () => { generation++; pendingCancelled = true; session?.dispose(); } };
}

module.exports = { installDatabaseIpc };
