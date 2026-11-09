/**
 * Complete Monaco's command before React replaces its editor view.
 * Calling activate inside registerEditorOpener can dispose the source while
 * Go to Definition still owns a cancellable command (Monaco issue #5135).
 * A single next-task handoff is not a delay/retry loop: it acknowledges the
 * opener synchronously, then validates the original project and active tab.
 * Only an already-open model can be selected; no disk, network or native API.
 */
export function createEditorNavigation({
  getSnapshot, activate, isVisible, onError,
  schedule = callback => setTimeout(callback, 0), cancel = clearTimeout
}) {
  for (const fn of [getSnapshot, activate, isVisible, onError, schedule, cancel]) {
    if (typeof fn !== 'function') throw new TypeError('Contrato de navegação inválido.');
  }
  let pending = null, disposed = false;
  const clear = () => {
    if (pending) cancel(pending.timer);
    pending = null;
  };
  const coordinate = value => Number.isSafeInteger(value) && value > 0 ? value : 1;
  return {
    open(uri, selection) {
      if (disposed || !isVisible() || typeof uri !== 'string') return false;
      const snapshot = getSnapshot();
      const document = snapshot.documents.find(item => item.uri === uri);
      if (!document) return false;
      clear();
      const request = {
        scope: snapshot.scope, source: snapshot.active, key: document.key,
        uri, path: document.path, timer: null,
        position: {
          line: coordinate(selection?.startLineNumber ?? selection?.lineNumber),
          column: coordinate(selection?.startColumn ?? selection?.column)
        }
      };
      pending = request;
      request.timer = schedule(() => {
        if (disposed || pending !== request) return;
        pending = null;
        try {
          const current = getSnapshot();
          if (!isVisible() || current.scope !== request.scope || current.active !== request.source ||
              !current.documents.some(item => item.key === request.key && item.uri === request.uri)) return;
          activate(request.path, request.position);
        } catch (error) { onError(error); }
      });
      return true;
    },
    dispose() { if (!disposed) { disposed = true; clear(); } }
  };
}
