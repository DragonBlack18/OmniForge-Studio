/**
 * Production renderer performance gate.
 * Measures static startup JS, excluding dynamically imported Monaco/CAD tools.
 * Fails the build if future changes silently re-bundle every editor on Home.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('dist');
const manifestPath = path.join(root, '.vite', 'manifest.json');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const entry = Object.entries(manifest).find(([,record]) => record.isEntry);
if (!entry) throw new Error('FAIL: manifest Vite não possui entrypoint.');
const visited = new Set();
const js = new Set();
const css = new Set();
function visit(key) {
  if (visited.has(key)) return;
  const record = manifest[key];
  if (!record) throw new Error('FAIL: dependência estática ausente no manifesto: ' + key);
  visited.add(key);
  if (record.file?.endsWith('.js')) js.add(record.file);
  for (const file of record.css || []) css.add(file);
  for (const imported of record.imports || []) visit(imported);
  // Dynamic imports are deliberately excluded from initial startup bytes.
}
visit(entry[0]);
async function total(files) {
  let n = 0;
  for (const file of files) n += (await fs.stat(path.join(root,file))).size;
  return n;
}
const initialJs = await total(js);
const initialCss = await total(css);
const MAX_INITIAL_JS = 1_900_000;
const MAX_INITIAL_CSS = 300_000;
const chunks = Object.entries(manifest)
  .filter(([,row]) => row.file?.endsWith('.js'))
  .map(([key,row]) => ({ key, file:row.file }));
const deferredEditor = chunks.some(x => /src\/modules\/ide\/CodeEditor\.jsx/.test(x.key) && !js.has(x.file));
const deferredCad = chunks.some(x => /src\/modules\/cad\/CadWorkbench\.jsx/.test(x.key) && !js.has(x.file));
const deferredCanvas = chunks.some(x => /src\/modules\/automation\/FlowCanvas\.jsx/.test(x.key) && !js.has(x.file));
const report = {
  version: 1, staticEntrypoint: entry[0],
  initialJsBytes: initialJs, initialCssBytes: initialCss,
  initialJsChunks: [...js].sort(),
  lazy: { monaco: deferredEditor, cad:deferredCad, flow:deferredCanvas },
  budget: { initialJsBytes:MAX_INITIAL_JS, initialCssBytes:MAX_INITIAL_CSS },
  baselineV060: { initialJsBytes:4251260, initialCssBytes:232630 }
};
console.log('OmniForge production bundle:\n' + JSON.stringify(report,null,2));
if (initialJs > MAX_INITIAL_JS || initialCss > MAX_INITIAL_CSS ||
    !deferredEditor || !deferredCad || !deferredCanvas) {
  throw new Error('FAIL: startup bundle excessivo ou módulo pesado carregado sem demanda.');
}
console.log('PASS: limite de entrada estática e isolamento de Monaco/CAD/automações.');
