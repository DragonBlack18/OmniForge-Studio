// Stable Monaco option objects avoid reconfiguring the editor per keystroke.
// Large files skip expensive minimap and wrapping; file bytes are unchanged.
export const STANDARD_EDITOR_OPTIONS = Object.freeze({
  automaticLayout:true, fontSize:14, minimap:{enabled:true},
  scrollBeyondLastLine:false, wordWrap:'on'
});
export const LARGE_EDITOR_OPTIONS = Object.freeze({
  automaticLayout:true, fontSize:14, minimap:{enabled:false},
  scrollBeyondLastLine:false, wordWrap:'off'
});
export const LARGE_EDITOR_THRESHOLD_BYTES = 180_000;
export function editorOptionsForSize(size) {
  return Number.isFinite(size) && size >= LARGE_EDITOR_THRESHOLD_BYTES
    ? LARGE_EDITOR_OPTIONS : STANDARD_EDITOR_OPTIONS;
}
