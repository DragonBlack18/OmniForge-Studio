// One owner for app-level confirmations. Native execution consent stays native.
const listeners = new Set();
let current = null;
let resolveCurrent = null;
let sequence = 0;
export const getConfirmation = () => current;
export const subscribeConfirmation = listener => { listeners.add(listener); return () => listeners.delete(listener); };
const notify = () => { for (const listener of listeners) listener(); };
export function confirmAction({title, message, confirmLabel = 'Continuar'}) {
  if (current) return Promise.resolve(false);
  if (![title,message,confirmLabel].every(value => typeof value === 'string' && value.trim()))
    return Promise.reject(new TypeError('Confirmação inválida.'));
  current = Object.freeze({id:++sequence,title,message,confirmLabel});
  const result = new Promise(resolve => { resolveCurrent = resolve; });
  notify();
  return result;
}
export function finishConfirmation(id, accepted = false) {
  if (!current || id !== current.id) return false;
  const resolve = resolveCurrent;
  current = null; resolveCurrent = null;
  notify(); resolve(accepted === true);
  return true;
}
