import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Source contract only. Actual viewport visibility is checked by the Windows
// Electron smoke; this test does not pretend to render CSS in Node.
test('compact code layout wraps controls instead of hiding cursor coordinates',async()=>{
  const css=await fs.readFile(new URL('../src/modules/ide/CodeWorkspace.css',import.meta.url),'utf8');
  assert.doesNotMatch(css,/\.workspace-editor-position\s*\{[^}]*\bdisplay\s*:\s*none\b/);
  assert.doesNotMatch(css,/\.workspace-editor-position\s*\{[^}]*\bvisibility\s*:\s*hidden\b/);
  assert.match(css,/\.code-workspace\s+\.workspace-editor-position\s*\{[^}]*display:inline-flex/);
  assert.match(css,/\.code-workspace\s*>\s*\.main-toolbar\s*\{[^}]*flex-wrap:wrap/);
  assert.match(css,/\.toolbar-heading\s*\{[^}]*min-width:0/);
});
