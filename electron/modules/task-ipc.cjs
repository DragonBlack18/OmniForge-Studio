'use strict';

/**
 * Native Electron adapter for one supervised project task at a time.
 * This is the only bridge between scripts in an explicitly trusted workspace
 * and the renderer; only three static IPC commands are exposed to the UI.
 */
function installProjectTaskIpc({ register, dialog, core, getWorkspace,
  getUserData, getWindow, isHostBusy, onFinished }) {
  let runner = null;
  let pending = false;
  const isActive = () => pending || Boolean(runner?.isRunning);
  const snapshot = () => runner?.snapshot() || null;
  function sendEvent(event) {
    const target = getWindow();
    if (target && !target.isDestroyed() && !target.webContents.isDestroyed()) {
      target.webContents.send('omni:projectTaskEvent', event);
    }
  }
  function notify(event) {
    if (event.type !== 'finished') return sendEvent(event);
    // Persist ONLY final metadata before broadcasting completion or exiting.
    // A write failure never changes the real task result; the UI is informed.
    void core.recordProjectTaskHistory(getUserData(), event.task)
      .then(() => sendEvent({ ...event, historySaved:true }))
      .catch(() => sendEvent({ ...event, historySaved:false }))
      .finally(() => onFinished?.(event.task));
  }

  register('listProjectTasks', async () => {
    const workspace = getWorkspace();
    const tasks = await core.listProjectTasks(workspace);
    if (!tasks.available) return tasks;
    let toolchain = { available:true, message:'' };
    try { await core.findNpmToolchain(); }
    catch (error) { toolchain = { available:false, message:error.message }; }
    return { ...tasks, toolchain };
  });
  register('projectTaskState', () => snapshot());
  register('listProjectTaskHistory', () =>
    core.listProjectTaskHistory(getUserData(), getWorkspace()));
  register('cancelProjectTask', id => {
    if (typeof id !== 'string' || snapshot()?.id !== id) return false;
    return runner.cancel('cancelled');
  });
  register('runProjectTask', async (id, revision) => {
    if (isActive() || isHostBusy()) throw new Error('Conclua a operação atual antes de executar uma tarefa.');
    pending = true;
    try {
      const workspace = getWorkspace();
      const script = await core.assertTaskSelection(workspace, id, revision);
      const answer = await dialog.showMessageBox(getWindow(), {
        type:'warning',
        title:'Executar tarefa do projeto',
        message:'Executar este script real do workspace local?',
        detail:'Projeto: ' + workspace +
          '\nTarefa: npm --ignore-scripts run ' + script.id +
          '\n\nComando definido no package.json:\n' + script.command +
          '\n\nScripts de projeto podem alterar arquivos, instalar dependências, ' +
          'iniciar subprocessos e acessar a rede. Não existe sandbox nesta ferramenta. ' +
          'Execute somente scripts de projetos confiáveis.',
        buttons:['Cancelar','Executar tarefa'], defaultId:0, cancelId:0, noLink:true
      });
      if (answer.response !== 1) return null;
      if (workspace !== getWorkspace() || isHostBusy())
        throw new Error('O workspace mudou ou outra operação foi iniciada. Execução bloqueada.');
      // The manifest revision is rechecked after consent by the core runner.
      if (!runner) {
        const module = await import('../../core/modules/ide/project-tasks.mjs');
        runner = new module.LocalProjectTaskRunner();
      }
      return runner.start({workspace,id,revision,onEvent:notify});
    } finally { pending = false; }
  });
  return {
    isActive, snapshot,
    cancel:() => Boolean(runner?.cancel('cancelled'))
  };
}

module.exports = { installProjectTaskIpc };
