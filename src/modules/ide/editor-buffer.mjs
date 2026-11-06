/**
 * Own the Monaco model separately from React's render/effect scheduling.
 * Parent renders echo an observed value; only a newer explicit document
 * version (open, reload, restore) may replace live text. No disk/IPC access.
 */
export function bindEditorBuffer(editor, {version, content, onChange}) {
  if (!Number.isSafeInteger(version) || version < 0 || typeof content !== 'string' ||
      typeof onChange !== 'function') throw new TypeError('Contrato do buffer inválido.');
  let currentVersion = version, applying = false, disposed = false;
  const apply = text => {
    if (editor.getValue() === text) return;
    const model = editor.getModel();
    if (!model) throw new Error('Modelo do editor indisponível.');
    const view = editor.saveViewState();
    applying = true;
    try {
      editor.pushUndoStop();
      editor.executeEdits('omniforge.document', [{
        range:model.getFullModelRange(), text, forceMoveMarkers:true
      }]);
      editor.pushUndoStop();
      if (view) editor.restoreViewState(view);
    } finally { applying = false; }
  };
  // This subscription is created once, before notifying the owner on mount.
  // Cursor updates, layout changes and recovery feedback never resubscribe.
  const listener = editor.onDidChangeModelContent(event => {
    if (!disposed && !applying) onChange(editor.getValue(), event);
  });
  try { apply(content); }
  catch (error) { listener.dispose(); throw error; }
  return {
    replace(nextVersion, text) {
      if (disposed || nextVersion <= currentVersion) return false;
      if (!Number.isSafeInteger(nextVersion) || typeof text !== 'string')
        throw new TypeError('Revisão explícita do editor inválida.');
      apply(text);
      currentVersion = nextVersion;
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      listener.dispose();
    }
  };
}
