import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import React from 'react';

self.MonacoEnvironment = {
  getWorker(_moduleId, label) {
    if (label === 'json') return new JsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker();
    if (label === 'typescript' || label === 'javascript') return new TsWorker();
    return new EditorWorker();
  }
};
monaco.editor.defineTheme('omniforge-studio', {
  base:'vs-dark', inherit:true, rules:[],
  colors:{'editor.background':'#101012','editor.foreground':'#e5e3e4',
    'editorLineNumber.foreground':'#6f6870','editorLineNumber.activeForeground':'#c8515e',
    'editor.selectionBackground':'#58303b','editor.inactiveSelectionBackground':'#33252c',
    'editorCursor.foreground':'#e4a4ad','editor.lineHighlightBackground':'#1b181d',
    'editorWidget.background':'#1b1b1f','editorWidget.border':'#444047',
    'minimap.background':'#141416','scrollbarSlider.background':'#51424a77'}
});
loader.config({ monaco });

// Monaco, language workers, themes and language services load on the first
// actual editor visit, never while the user is on Home, CAD or Automations.
export default function CodeEditor(props) {
  return <Editor {...props} theme="omniforge-studio"/>;
}
