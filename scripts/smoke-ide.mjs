/** Windows E2E: real workspace files, global text search and Monaco navigation. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lab = await fs.mkdtemp(path.join(os.tmpdir(), 'omni-ide-e2e-'));
const workspace = path.join(lab, 'workspace');
const profile = path.join(lab, 'profile');
await Promise.all([fs.mkdir(workspace), fs.mkdir(profile)]);
await fs.mkdir(path.join(workspace, 'src'));
const source = ['// editor real', 'const a = 1;', 'const b = 2;',
  'export const needle = "IDE-CANARY-123";', 'console.log(needle);', ''].join('\n');
await fs.writeFile(path.join(workspace, 'src', 'entry.js'), source);
await fs.writeFile(path.join(workspace, '.env.local'), 'IDE-SECRET-998=do-not-display');
await fs.mkdir(path.join(workspace, '.omniforge'));
await fs.writeFile(path.join(workspace, '.omniforge', 'hidden.txt'), 'IDE-SECRET-998');
let client, phase = 'boot';
const watchdog = setTimeout(() => {
  console.error('[IDE E2E] Global timeout phase=' + phase);
  process.exit(1);
}, 145000);
watchdog.unref();
try {
  client = await electron.launch({
    args: ['.'], cwd: root, timeout: 45000,
    env: { ...process.env, OMNIFORGE_E2E: '1',
      OMNIFORGE_E2E_USER_DATA: profile, ELECTRON_RENDERER_URL: '' }
  });
  const page = await client.firstWindow({ timeout: 45000 });
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => console.error('[IDE renderer]', error.message));
  await client.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
    dialog.showMessageBox = async () => ({ response: 0 });
  }, workspace);
  phase = 'open workspace';
  await page.getByRole('button', { name: 'Abrir projeto' }).click();
  await page.getByText('Projeto aberto:', { exact: false }).waitFor();
  phase = 'search real source';
  await page.getByRole('button', { name: 'Buscar no projeto' }).click();
  await page.getByTestId('workspace-search').waitFor();
  await page.getByTestId('workspace-search-input').fill('IDE-CANARY-123');
  await page.getByTestId('workspace-search-submit').click();
  await page.getByTestId('workspace-search-hit').first().waitFor();
  const real = await page.evaluate(() =>
    window.omni.searchWorkspaceText({ query: 'IDE-CANARY-123', caseSensitive: true }));
  assert.equal(real.results.length, 1);
  assert.equal(real.results[0].path, 'src/entry.js');
  assert.equal(real.results[0].line, 4);
  assert.ok(real.results[0].column > 1);
  const sensitive = await page.evaluate(() =>
    window.omni.searchWorkspaceText({ query: 'IDE-SECRET-998', caseSensitive: false }));
  assert.deepEqual(sensitive.results, [], 'Nunca buscar .env ou metadados privados.');
  phase = 'navigate real Monaco cursor';
  await page.getByTestId('workspace-search-hit').first().click();
  await page.getByTestId('editor-position').getByText(/Ln 4/).waitFor();
  const position = await page.getByTestId('editor-position').textContent();
  assert.match(position, /Ln 4 · Col [1-9]\d*/);
  assert.equal(await fs.readFile(path.join(workspace, 'src', 'entry.js'), 'utf8'), source);
  phase = 'create folder from UI';
  await page.getByRole('button', { name: /Nova pasta/ }).click();
  await page.getByLabel('Caminho do novo item').fill('novo-modulo');
  await page.getByTestId('workspace-create-confirm').click();
  await page.waitForFunction(async () =>
    (await window.omni.listFiles()).some(file => file.path === 'novo-modulo' && file.kind === 'directory'));
  assert.ok((await fs.stat(path.join(workspace, 'novo-modulo'))).isDirectory());
  phase = 'create new file from UI and save in Monaco';
  await page.getByRole('button', { name: /Novo arquivo/ }).click();
  await page.getByLabel('Caminho do novo item').fill('novo-modulo/exemplo.py');
  await page.getByTestId('workspace-create-confirm').click();
  await page.waitForFunction(async () =>
    (await window.omni.listFiles()).some(file => file.path === 'novo-modulo/exemplo.py' && file.kind === 'file'));
  await page.getByText('novo-modulo/exemplo.py', { exact: false }).first().waitFor();
  assert.equal(await fs.readFile(path.join(workspace, 'novo-modulo', 'exemplo.py'), 'utf8'), '');
  const before = await page.evaluate(() => window.omni.readFile('novo-modulo/exemplo.py'));
  assert.match(before.revision, /^[a-f0-9]{64}$/);
  // Exercise the actual Monaco renderer, not a fake backend save or mock.
  await page.locator('.monaco-editor').first().click();
  await page.keyboard.insertText('print("IDE OK")');
  await page.getByRole('button', { name: 'Salvar arquivo' }).click();
  await page.waitForFunction(async () =>
    (await window.omni.readFile('novo-modulo/exemplo.py')).content.includes('IDE OK'));
  assert.match(await fs.readFile(path.join(workspace, 'novo-modulo', 'exemplo.py'), 'utf8'), /IDE OK/);
  phase = 'reject overwrite and traversal';
  const errors = await page.evaluate(async () => {
    const captures = [];
    for (const file of ['novo-modulo/exemplo.py', '../outside.py', '.git/config']) {
      try { await window.omni.createWorkspaceFile(file); captures.push(null); }
      catch (err) { captures.push(err.message); }
    }
    return captures;
  });
  assert.ok(errors.every(x => typeof x === 'string' && x.length > 0));
  assert.match(await fs.readFile(path.join(workspace, 'src', 'entry.js'), 'utf8'), /IDE-CANARY-123/);
  console.log('PASS Workspace IDE Electron E2E: real global search, exclusions, Monaco line, create file/folder, editor save and safety.');
  phase = 'pass';
} catch (error) {
  console.error('[IDE E2E] phase=' + phase, error);
  process.exitCode = 1;
} finally {
  if (client) {
    try {
      const child = client.process();
      if (child && child.exitCode === null) child.kill();
      await Promise.race([client.close().catch(() => {}),
        new Promise(resolve => setTimeout(resolve, 3000))]);
    } catch {}
  }
  await fs.rm(lab, { recursive: true, force: true }).catch(() => {});
  clearTimeout(watchdog);
  process.exit(process.exitCode || 0);
}
