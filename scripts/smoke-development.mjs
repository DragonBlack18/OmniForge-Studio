/** Real Electron UI → native approval → Node/Python → filesystem verification. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lab = await fs.mkdtemp(path.join(os.tmpdir(), 'omni-development-e2e-'));
const workspace = path.join(lab, 'workspace'), profile = path.join(lab, 'profile');
const artifacts = path.join(root, 'smoke-artifacts');
await Promise.all([fs.mkdir(workspace), fs.mkdir(profile), fs.mkdir(artifacts, { recursive: true })]);
const files = {
  'main.cjs': "require('node:fs').writeFileSync('argv.json',JSON.stringify(process.argv.slice(2)));console.log('NODE_REAL_SUCCESS');",
  'hold.cjs': "console.log('HOLD_READY');setInterval(()=>{},500);",
  'pass.test.cjs': "require('node:test')('sum',()=>require('node:assert/strict').equal(2+2,4));",
  'fail.test.cjs': "require('node:test')('sum',()=>require('node:assert/strict').equal(2+2,5));",
  'python_main.py': 'import sys\nprint("PYTHON_REAL_SUCCESS", sys.argv[1:])\n',
  'test_python.py': 'import unittest\nclass Example(unittest.TestCase):\n    def test_sum(self):\n        self.assertEqual(2+2,4)\n',
  'package.json': JSON.stringify({ name: 'development-e2e', scripts: { verify: 'node main.cjs' } })
};
for (const [filename, content] of Object.entries(files)) await fs.writeFile(path.join(workspace, filename), content);

let app, page, stage = 'boot';
const pageErrors = [];
const checks = [];
const watchdog = setTimeout(() => { console.error('[DEVELOPMENT E2E] timeout at ' + stage); process.exit(1); }, 150_000);
watchdog.unref();

async function stateWhen(predicate, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() < deadline) {
    latest = await page.evaluate(() => window.omni.developmentState());
    if (predicate(latest)) return latest;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Estado esperado não atingido: ' + JSON.stringify(latest));
}
async function pick(filename, action = 'run') {
  await page.getByTestId('development-file').filter({ hasText: filename }).click();
  await page.getByTestId('development-action-' + action).click();
}
async function execute(filename, action, expected) {
  await pick(filename, action);
  const previous = await page.evaluate(() => window.omni.developmentState());
  await page.getByTestId('development-run').click();
  return stateWhen(task => task && task.id !== previous?.id && task.path === filename && task.action === action && task.status === expected);
}

try {
  app = await electron.launch({ args: ['.'], cwd: root, timeout: 45_000,
    env: { ...process.env, ELECTRON_RENDERER_URL: '', OMNIFORGE_E2E: '1', OMNIFORGE_E2E_USER_DATA: profile } });
  page = await app.firstWindow({ timeout: 45_000 });
  page.setDefaultTimeout(15_000);
  page.on('pageerror', error => pageErrors.push(error.message));
  await app.evaluate(({ BrowserWindow, dialog }, workspace) => {
    BrowserWindow.getAllWindows()[0].setSize(1440, 900);
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [workspace] });
    dialog.showMessageBox = async () => ({ response: 0 });
  }, workspace);
  await page.getByRole('button', { name: 'Abrir projeto', exact: true }).click();
  await page.getByText('Projeto aberto:', { exact: false }).waitFor();
  await page.getByTestId('primary-sidebar').getByRole('button', { name: 'Executar e testar', exact: true }).click();
  await page.getByTestId('development-tools').waitFor();
  await page.getByTestId('development-file').filter({ hasText: 'main.cjs' }).waitFor();
  const catalog = await page.evaluate(() => window.omni.listDevelopmentTargets());
  assert.equal(catalog.runtimes.node.available, true);
  assert.equal(catalog.runtimes.python.available, true, 'O gate exige um Python real instalado.');
  checks.push('real-source-discovery-node-python');

  stage = 'native rejection';
  await pick('main.cjs');
  await page.getByTestId('development-run').click();
  await page.getByText('Execução cancelada antes de iniciar.', { exact: false }).waitFor();
  assert.equal(await page.evaluate(() => window.omni.developmentState()), null);
  await assert.rejects(fs.stat(path.join(workspace, 'argv.json')), { code: 'ENOENT' });
  checks.push('native-deny-no-side-effects');

  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async (_window, options) => {
      if (!String(options.detail).includes('Revisão:') || !String(options.detail).includes('Arquivo salvo:')) {
        throw new Error('Native consent must name exact saved source and revision.');
      }
      return { response: 1 };
    };
  });
  stage = 'syntax check without executing source';
  assert.equal((await execute('main.cjs', 'check', 'completed')).exitCode, 0);
  await assert.rejects(fs.stat(path.join(workspace, 'argv.json')), { code: 'ENOENT' });
  checks.push('node-syntax-check-no-code-execution');

  stage = 'real argv and output';
  await pick('main.cjs');
  await page.getByTestId('development-args').fill('texto com espaços\n; touch injection\nação');
  const beforeRun = await page.evaluate(() => window.omni.developmentState());
  await page.getByTestId('development-run').click();
  const nodeResult = await stateWhen(task => task?.id !== beforeRun?.id && task?.status === 'completed');
  assert.match(nodeResult.output, /NODE_REAL_SUCCESS/);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(workspace, 'argv.json'), 'utf8')), ['texto com espaços', '; touch injection', 'ação']);
  await page.getByTestId('development-output').filter({ hasText: 'NODE_REAL_SUCCESS' }).waitFor();
  await assert.rejects(fs.stat(path.join(workspace, 'injection')), { code: 'ENOENT' });
  checks.push('node-argv-literal-real-artifact-live-output');

  stage = 'Node test success and failure';
  assert.equal((await execute('pass.test.cjs', 'test', 'completed')).exitCode, 0);
  assert.notEqual((await execute('fail.test.cjs', 'test', 'failed')).exitCode, 0);
  await page.getByTestId('development-status').filter({ hasText: 'Falhou' }).waitFor();
  await page.screenshot({ path: path.join(artifacts, 'development-failing-test.png') });
  checks.push('node-assertion-pass-and-fail');

  stage = 'Python run and unittest';
  const pythonResult = await execute('python_main.py', 'run', 'completed');
  assert.match(pythonResult.output, /PYTHON_REAL_SUCCESS/);
  assert.equal((await execute('test_python.py', 'test', 'completed')).exitCode, 0);
  checks.push('real-python-execution-and-unittest');

  stage = 'stale file revision';
  await pick('main.cjs', 'check');
  await fs.appendFile(path.join(workspace, 'main.cjs'), '\n// changed outside editor\n');
  await page.getByTestId('development-run').click();
  await page.getByRole('alert').filter({ hasText: 'mudou no disco' }).waitFor();
  await page.getByTestId('development-refresh').click();
  await execute('main.cjs', 'check', 'completed');
  checks.push('stale-revision-block-and-explicit-refresh');

  stage = 'cancellation and cross-runner lock';
  await pick('hold.cjs');
  await page.getByTestId('development-run').click();
  await stateWhen(task => task?.path === 'hold.cjs' && task.status === 'running' && task.output.includes('HOLD_READY'));
  const lockMessage = await page.evaluate(async () => {
    const catalog = await window.omni.listProjectTasks();
    try { await window.omni.runProjectTask('verify', catalog.revision); return ''; }
    catch (error) { return error.message; }
  });
  assert.match(lockMessage, /Conclua a operação/);
  await page.getByTestId('development-cancel').click();
  assert.equal((await stateWhen(task => task?.path === 'hold.cjs' && task.status === 'cancelled')).status, 'cancelled');
  checks.push('cancel-process-and-shared-operation-lock');

  stage = 'keyboard filter and compact layout';
  const search = page.getByLabel('Filtrar arquivos', { exact: true });
  await search.fill('not-found');
  await page.getByText('Nenhum arquivo corresponde ao filtro.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Limpar filtro de arquivos', exact: true }).click();
  assert.equal(await search.inputValue(), '');
  assert.equal(await search.evaluate(element => element === document.activeElement), true);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 800));
  await pick('main.cjs', 'check');
  assert.match(await page.getByTestId('development-output-source').innerText(), /hold\.cjs.*Executar arquivo/);
  await page.getByTestId('development-run').scrollIntoViewIfNeeded();
  const box = await page.getByTestId('development-run').boundingBox();
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  assert.ok(box && box.x >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height);
  await page.screenshot({ path: path.join(artifacts, 'development-compact.png') });
  checks.push('empty-filter-clear-restores-focus-compact-actions-output-provenance');
  assert.deepEqual(pageErrors, []);
  await fs.writeFile(path.join(artifacts, 'development-results.json'), JSON.stringify({
    schemaVersion: 1, result: 'PASS', checks,
    environment: process.platform, runtimeNode: process.version,
    scope: 'Synthetic workspace. Real installed Node/Python, native approval mocked in the E2E process only.'
  }, null, 2) + '\n');
  console.log('PASS Development Electron E2E: ' + checks.join(', '));
} catch (error) {
  console.error('[DEVELOPMENT E2E] stage=' + stage, error);
  process.exitCode = 1;
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(artifacts, 'development-failure.png') }).catch(() => {});
} finally {
  if (app) {
    try {
      const child = app.process();
      if (child && child.exitCode === null) child.kill();
      await Promise.race([app.close().catch(() => {}), new Promise(resolve => setTimeout(resolve, 3000))]);
    } catch { /* final process cleanup */ }
  }
  await fs.rm(lab, { recursive: true, force: true }).catch(() => {});
  clearTimeout(watchdog);
  process.exit(process.exitCode || 0);
}
