'use strict';

function installTerminalIpc({ register, dialog, getWorkspace, getWindow, isHostBusy,
  onFinished, createWorker, loadContract, loadSession, writeClipboard }) {
  let pending = false, pendingCancelled = false, terminal = null;
  const contract = loadContract || (() => import('../../core/modules/ide/terminal-contract.mjs'));
  const sessionModule = loadSession || (() => import('../../core/modules/ide/terminal-session.mjs'));
  const spawnWorker = createWorker || ((entry, options) => require('electron').utilityProcess.fork(entry, [], options));
  const snapshot = () => terminal?.snapshot() || null;
  const isActive = () => pending || Boolean(terminal?.isRunning);
  const send = event => {
    try {
      const window = getWindow();
      if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('omni:terminalEvent', event);
    } catch { /* Main lifecycle cancellation owns renderer loss. */ }
  };
  const selected = id => {
    if (typeof id !== 'string' || snapshot()?.id !== id || snapshot()?.workspace !== getWorkspace()) {
      throw new Error('Sessão de terminal inválida ou pertencente a outro workspace.');
    }
    return terminal;
  };

  register('terminalAvailability', async () => {
    const policy = await contract();
    return policy.listTerminalShells();
  });
  register('terminalState', () => snapshot());
  register('attachTerminal', id => selected(id).attach());
  register('detachTerminal', id => selected(id).detach());
  register('writeTerminal', (id, data) => selected(id).write(data));
  register('resizeTerminal', (id, cols, rows) => selected(id).resize(cols, rows));
  register('acknowledgeTerminal', (id, sequence) => selected(id).ack(sequence));
  register('closeTerminal', id => selected(id).close());
  register('copyTerminalSelection', (id, text) => {
    selected(id);
    if (typeof text !== 'string' || !text.length || text.includes('\0') || Buffer.byteLength(text) > 65_536) {
      throw new Error('Selecione até 64 KB de texto do terminal para copiar.');
    }
    // Only the explicit selection button calls this named capability. OSC
    // clipboard escapes are consumed in xterm and have no route to this IPC.
    if (writeClipboard) writeClipboard(text);
    else require('electron').clipboard.writeText(text);
    return true;
  });
  register('openTerminal', async request => {
    if (isActive() || isHostBusy()) throw new Error('Conclua a operação atual antes de abrir outra sessão de terminal.');
    pending = true; pendingCancelled = false;
    try {
      const workspace = getWorkspace();
      const policy = await contract();
      const plan = await policy.prepareTerminalOpen(workspace, request);
      if (pendingCancelled) return null;
      const window = getWindow();
      const answer = await dialog.showMessageBox(window, {
        type: 'warning', title: 'Abrir terminal interativo', message: 'Abrir ' + plan.shell.label + ' neste projeto?',
        detail: 'Workspace: ' + plan.workspace + '\nShell: ' + plan.shell.executable +
          '\n\nVocê autoriza uma sessão interativa real. Os comandos digitados poderão alterar ou apagar arquivos, iniciar programas e acessar a rede com as permissões da sua conta. A sessão pode trabalhar ao mesmo tempo que o editor e outras ferramentas. Não há sandbox nem rollback. Perfis de inicialização do shell ficam desativados.',
        buttons: ['Cancelar', 'Abrir terminal'], defaultId: 0, cancelId: 0, noLink: true
      });
      if (answer.response !== 1 || pendingCancelled) return null;
      if (workspace !== getWorkspace() || isHostBusy()) throw new Error('O workspace mudou ou outra operação foi iniciada. Confirme novamente.');
      const approved = { shellId: plan.shellId, cols: plan.cols, rows: plan.rows };
      const checked = await policy.prepareTerminalOpen(workspace, approved);
      if (checked.workspace !== plan.workspace || checked.shell.executable !== plan.shell.executable || checked.shell.canonical !== plan.shell.canonical) {
        throw new Error('O ambiente do terminal mudou após a confirmação. Confirme novamente.');
      }
      const { TerminalSession } = await sessionModule();
      if (pendingCancelled || workspace !== getWorkspace() || isHostBusy()) return null;
      terminal = new TerminalSession({ createWorker: spawnWorker, onEvent: send,
        onFinished: () => onFinished?.() });
      return await terminal.start(checked);
    } finally { pending = false; onFinished?.(); }
  });
  return { isActive, isPending: () => pending, snapshot,
    cancel: () => { if (pending) pendingCancelled = true; const stopped = terminal?.close() || false; return pending || stopped; } };
}
module.exports = { installTerminalIpc };
