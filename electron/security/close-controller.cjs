'use strict';
const { commitInProgress } = require('./boundary.cjs');

/** One close decision per native window. Never force-exit an active commit. */
function createCloseController({ getState, isAlive, prompt, quit, cancelFlow,
  cancelTask, record = () => {}, defer = setImmediate }) {
  let phase = 'idle', disposed = false, queued = false;
  const active = state => Boolean(state.execution || state.task);
  const reset = code => { phase = 'idle'; if (code) record(code); };
  function workFinished() {
    if (disposed || phase !== 'draining' || !isAlive()) return;
    const state = getState();
    if (commitInProgress(state) || active(state)) return;
    phase = 'approved';
    if (queued) return;
    queued = true;
    // Leave the native close callback/promise microtask before calling app.quit.
    defer(() => {
      queued = false;
      if (disposed || phase !== 'approved' || !isAlive()) return;
      const current = getState();
      if (commitInProgress(current) || active(current)) {
        phase = 'draining';
        return;
      }
      record('close-approved');
      quit();
    });
  }
  function handleClose(event) {
    if (disposed || !isAlive()) return;
    const state = getState();
    if (phase === 'approved' && !commitInProgress(state) && !active(state)) return;
    if (phase === 'prompt' || phase === 'draining') { event.preventDefault(); return; }
    if (!commitInProgress(state) && !active(state) && !state.unsaved) {
      phase = 'approved'; // Block new IPC work between native close and closed.
      return;
    }
    event.preventDefault();
    phase = 'prompt';
    const blocked = commitInProgress(state);
    if (blocked) record('close-blocked');
    Promise.resolve().then(() => prompt(blocked ? {
      type: 'info', title: 'Operação em andamento',
      message: 'Conclua a gravação ou a operação aberta antes de fechar.',
      detail: 'O fechamento foi bloqueado para preservar os dados.',
      buttons: ['Voltar'], defaultId: 0, cancelId: 0, noLink: true
    } : {
      type: 'warning', title: 'Fechar OmniForge Studio',
      message: active(state) ? 'Há uma operação em andamento.' : 'Existem alterações não salvas.',
      detail: 'Ao sair, as alterações não salvas serão descartadas. Operações ativas serão canceladas antes do encerramento. Os dados gravados serão preservados.',
      buttons: ['Continuar no programa', 'Sair sem salvar'], defaultId: 0, cancelId: 0, noLink: true
    })).then(answer => {
      if (disposed || !isAlive()) return;
      if (blocked || answer?.response !== 1) { reset('close-cancelled'); return; }
      // A write started before the dialog must not be interrupted by late consent.
      if (commitInProgress(getState())) { reset('close-blocked'); return; }
      phase = 'draining';
      const current = getState();
      if (current.execution) cancelFlow();
      if (current.task) cancelTask();
      workFinished();
    }).catch(() => { if (!disposed) reset('close-error'); });
  }
  return {
    handleClose, workFinished,
    isBusy: () => !disposed && phase !== 'idle',
    dispose() { disposed = true; phase = 'idle'; }
  };
}
module.exports = { createCloseController };
