'use strict';
// One native trust boundary for every named IPC method; no raw URLs are logged.
const MAX_BYTES = 2_200_000, MAX_ITEMS = 80_000, MAX_DEPTH = 64;
const CONTROL = new Set(['cancelFlow','cancelProjectTask','cancelDevelopmentTask','cancelScheduleRun','requestExit','setUnsavedChanges','runtimeDiagnostics']);

function developmentUrl(packaged, value) {
  if (packaged || !value) return null;
  const url = new URL(value);
  if (url.origin !== 'http://127.0.0.1:5173' || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) throw Error('Servidor de desenvolvimento não autorizado.');
  return url.href;
}
function trustedDocument(value, devUrl = null) {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search) return false;
    if (devUrl) return url.origin === new URL(devUrl).origin && url.pathname === '/';
    return url.protocol === 'omni:' && url.host === 'app' &&
      (url.pathname === '/' || url.pathname === '/index.html');
  } catch { return false; }
}
function assertSender(event, window, devUrl = null) {
  try {
    if (!window || window.isDestroyed() || window.webContents.isDestroyed() ||
        event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame ||
        !trustedDocument(event.senderFrame.url, devUrl)) throw Error();
  } catch { throw Error('Origem de IPC não autorizada.'); }
}
function assertPayload(args) {
  if (!Array.isArray(args) || args.length > 6) throw Error('Argumentos de IPC inválidos.');
  const stack = args.map(value => ({ value, depth: 0 }));
  let bytes = 0, items = 0;
  while (stack.length) {
    const { value, depth } = stack.pop();
    if (++items > MAX_ITEMS || depth > MAX_DEPTH) throw Error('Payload de IPC excede os limites de estrutura.');
    if (value == null) { bytes += 4; continue; }
    if (typeof value === 'string') bytes += Buffer.byteLength(value, 'utf8');
    else if (typeof value === 'boolean') bytes += 5;
    else if (typeof value === 'number' && Number.isFinite(value)) bytes += 24;
    else if (typeof value === 'object') {
      if (Array.isArray(value) && value.length > MAX_ITEMS) throw Error('Payload de IPC excede os limites de estrutura.');
      const proto = Object.getPrototypeOf(value);
      if (!Array.isArray(value) && proto !== Object.prototype && proto !== null)
        throw Error('Tipo de IPC não suportado.');
      const keys = Object.keys(value);
      if (keys.length + stack.length + items > MAX_ITEMS) throw Error('Payload de IPC excede os limites de estrutura.');
      for (const key of keys) {
        const field = Object.getOwnPropertyDescriptor(value, key);
        if (!field || !Object.hasOwn(field, 'value')) throw Error('Campo de IPC inválido.');
        bytes += Buffer.byteLength(key, 'utf8') + 4;
        if (bytes > MAX_BYTES) throw Error('Payload de IPC maior que o permitido.');
        stack.push({ value: field.value, depth: depth + 1 });
      }
    } else throw Error('Tipo de IPC não suportado.');
    if (bytes > MAX_BYTES) throw Error('Payload de IPC maior que o permitido.');
  }
  return true;
}
function createBoundary({ getWindow, devUrl = null, record = () => {}, isClosing = () => false }) {
  let dataPending = 0, controlPending = 0;
  return async function invoke(name, action, event, args) {
    try { assertSender(event, getWindow(), devUrl); }
    catch (e) { record('ipc-denied'); throw e; }
    try { assertPayload(args); }
    catch (e) { record('payload-denied'); throw e; }
    const control = CONTROL.has(name);
    if (!control && isClosing()) throw Error('Fechamento em andamento. Cancele a saída antes de iniciar outra operação.');
    if ((control ? controlPending >= 12 : dataPending >= 32)) {
      record('ipc-busy'); throw Error('Muitas operações simultâneas. Tente novamente após a conclusão.');
    }
    if (control) controlPending++; else dataPending++;
    try { return await action(...args); }
    finally { if (control) controlPending--; else dataPending--; }
  };
}
function installSessionPolicy(ses, record = () => {}) {
  ses.setPermissionRequestHandler((_wc, _permission, answer) => { record('permission-denied'); answer(false); });
  ses.setPermissionCheckHandler(() => false);
  ses.setDevicePermissionHandler(() => false);
  ses.on('will-download', event => { event.preventDefault(); record('download-denied'); });
}
function commitInProgress(state) { return Boolean(state.save || state.cad || state.registry || state.taskPrompt || state.schedulePrompt || state.diagnosticExport); }
function assertCanExecute(state) {
  if (commitInProgress(state) || state.execution || state.task || state.schedulePrompt)
    throw Error('Conclua a operação atual antes de executar um fluxo.');
}
module.exports = { developmentUrl, trustedDocument, assertSender, assertPayload,
  createBoundary, installSessionPolicy, commitInProgress, assertCanExecute };
