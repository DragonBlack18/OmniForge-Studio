'use strict';

/** Native consent and host-operation coordination for the development runner. */
function installDevelopmentIpc({ register, dialog, core, getWorkspace, getWindow,
  isHostBusy, onFinished }) {
  let runner = null;
  let pending = false;
  let pendingCancelled = false;
  const snapshot = () => runner?.snapshot() || null;
  const isActive = () => pending || Boolean(runner?.isRunning);

  function notify(event) {
    const target = getWindow();
    try {
      if (target && !target.isDestroyed() && !target.webContents.isDestroyed()) {
        target.webContents.send('omni:developmentEvent', event);
      }
    } catch { /* The runner must remain supervised if the window disappeared. */ }
    if (event.type === 'finished') onFinished?.(event.task);
  }

  register('listDevelopmentTargets', () => core.listDevelopmentTargets(getWorkspace()));
  register('developmentState', () => snapshot());
  register('cancelDevelopmentTask', id => {
    if (typeof id !== 'string' || snapshot()?.id !== id) return false;
    return Boolean(runner?.cancel('cancelled'));
  });
  register('runDevelopmentTask', async request => {
    if (isActive() || isHostBusy()) throw new Error('Conclua a operação atual antes de executar ou testar código.');
    pending = true;
    pendingCancelled = false;
    try {
      const workspace = getWorkspace();
      const plan = await core.prepareDevelopmentTask(workspace, request);
      if (pendingCancelled) return null;
      // Copy only validated primitives. Renderer-owned objects cannot change
      // the approved selection while the native dialog remains open.
      const selected = { path: plan.path, revision: plan.revision, action: plan.action, args: [...plan.args] };
      const action = { run: 'Executar arquivo', check: 'Verificar sintaxe', test: 'Executar testes' }[plan.action];
      const answer = await dialog.showMessageBox(getWindow(), {
        type: plan.action === 'check' ? 'question' : 'warning',
        title: action,
        message: action + ': ' + plan.path + '?',
        detail: 'Workspace: ' + workspace + '\nAmbiente: ' + plan.executable +
          '\nArquivo salvo: ' + plan.path + '\nRevisão: ' + plan.revision +
          (plan.args.length ? '\nArgumentos separados: ' + JSON.stringify(plan.args) : '') +
          (plan.action === 'check' ? '\n\nA verificação analisa a sintaxe do arquivo salvo sem executar seu conteúdo.' :
            '\n\nO código será executado com as permissões da sua conta. Pode alterar arquivos, iniciar processos e acessar a rede. Execute somente projetos confiáveis.'),
        buttons: ['Cancelar', action], defaultId: 0, cancelId: 0, noLink: true
      });
      if (pendingCancelled || answer.response !== 1) return null;
      if (workspace !== getWorkspace() || isHostBusy()) {
        throw new Error('O workspace mudou ou outra operação foi iniciada. Confirme novamente.');
      }
      if (!runner) runner = new core.LocalDevelopmentRunner();
      return await runner.start({ workspace, request: selected,
        approvedExecutable: plan.executable,
        approvedCanonicalExecutable: plan.canonicalExecutable,
        onEvent: notify });
    } finally { pending = false; onFinished?.(); }
  });
  return { isActive, snapshot, isPending: () => pending,
    cancel: () => {
      // Renderer/window loss can precede runner creation. Invalidating the
      // pending attempt prevents late native consent from starting a process.
      if (pending) pendingCancelled = true;
      const stopped = Boolean(runner?.cancel('cancelled'));
      return pending || stopped;
    } };
}

module.exports = { installDevelopmentIpc };
