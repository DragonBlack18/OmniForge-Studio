/** Real Electron → utility process → native SQLite → exclusive filesystem copy. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { _electron as electron } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lab = await fs.mkdtemp(path.join(os.tmpdir(), 'omni-database-e2e-'));
const workspace = path.join(lab, 'workspace'), profile = path.join(lab, 'profile');
const artifacts = path.join(root, 'smoke-artifacts');
await Promise.all([fs.mkdir(workspace), fs.mkdir(profile), fs.mkdir(artifacts, { recursive: true })]);
const seed = new DatabaseSync(':memory:');
seed.exec("CREATE TABLE people(id INTEGER PRIMARY KEY, name TEXT UNIQUE); INSERT INTO people VALUES(1,'Ana');");
const original = Buffer.from(seed.serialize()); seed.close();
await fs.writeFile(path.join(workspace, 'source.sqlite'), original);
await fs.writeFile(path.join(workspace, 'main.js'), 'console.log("SQLite workspace");\n');

let app, page, stage = 'boot';
const pageErrors = [], checks = [];
const watchdog = setTimeout(() => { console.error('[SQLITE E2E] timeout at ' + stage); process.exit(1); }, 170_000);
watchdog.unref();
async function stateWhen(predicate, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  let state;
  while (Date.now() < deadline) {
    state = await page.evaluate(() => window.omni.databaseState());
    if (predicate(state)) return state;
    await new Promise(resolve => setTimeout(resolve, 70));
  }
  throw new Error('Estado SQLite não atingido: ' + JSON.stringify(state));
}
async function navigate() {
  await page.getByTestId('primary-sidebar').getByRole('button', { name: 'Banco SQLite', exact: true }).click();
  await page.getByTestId('database-workbench').waitFor();
}
async function approval(response) {
  await app.evaluate(({ dialog }, accepted) => {
    dialog.showMessageBox = async (_window, options) => {
      if (String(options.title).includes('SQLite') || String(options.title).includes('rascunho')) {
        if (options.defaultId !== 0 || options.cancelId !== 0 || !String(options.detail).includes('Revisão da sessão:')) {
          throw new Error('Consentimento SQLite não identifica a revisão ou não inicia em Cancelar.');
        }
      }
      return { response: accepted };
    };
  }, response);
}
async function query(sql) {
  await page.getByTestId('database-sql').fill(sql);
  await page.getByTestId('database-query').click();
  await page.getByTestId('database-query').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('[data-testid="database-query"]').disabled);
  const error = page.getByTestId('database-workbench').getByRole('alert');
  assert.equal(await error.count(), 0, await error.allTextContents());
}
async function apply(sql) {
  const before = await page.evaluate(() => window.omni.databaseState());
  await page.getByTestId('database-sql').fill(sql);
  await page.getByTestId('database-apply').click();
  return stateWhen(state => state?.revision === before.revision + 1 && !state.running);
}
async function assertVisibleAction(testId) {
  const control = page.getByTestId(testId); await control.scrollIntoViewIfNeeded();
  const box = await control.boundingBox(), size = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  assert.ok(box && box.x >= 0 && box.x + box.width <= size.width && box.y >= 0 && box.y + box.height <= size.height);
}

try {
  app = await electron.launch({ args: ['.'], cwd: root, timeout: 45_000,
    env: { ...process.env, ELECTRON_RENDERER_URL: '', OMNIFORGE_E2E: '1', OMNIFORGE_E2E_USER_DATA: profile } });
  page = await app.firstWindow({ timeout: 45_000 }); page.setDefaultTimeout(15_000);
  page.on('pageerror', error => pageErrors.push(error.message));
  await app.evaluate(({ BrowserWindow, dialog }, workspace) => {
    BrowserWindow.getAllWindows()[0].setSize(1440, 900);
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [workspace] });
    dialog.showMessageBox = async () => ({ response: 0 });
  }, workspace);
  await page.getByRole('button', { name: 'Abrir projeto', exact: true }).click();
  await page.getByText('Projeto aberto:', { exact: false }).waitFor();
  await navigate();
  await page.getByTestId('database-file').filter({ hasText: 'source.sqlite' }).waitFor();
  await page.screenshot({ path: path.join(artifacts, 'database-opening-1440.png') });

  stage = 'offline snapshot and read-only query';
  await page.getByTestId('database-file').filter({ hasText: 'source.sqlite' }).click();
  const opened = await stateWhen(state => state?.sourcePath === 'source.sqlite');
  assert.equal(opened.dirty, false); assert.match(opened.sqliteVersion, /^3\./);
  await query('SELECT name, 9223372036854775807 AS integer64, NULL AS empty, x\'00ff\' AS bytes FROM people;');
  await page.getByTestId('database-results').getByText('9223372036854775807', { exact: true }).waitFor();
  await page.getByTestId('database-results').getByText('0x00ff', { exact: true }).waitFor();
  await page.getByTestId('database-results').getByRole('button', { name: 'Copiar JSON', exact: true }).click();
  await page.getByText('Resultado exibido copiado em JSON', { exact: false }).waitFor();
  const copied = JSON.parse(await app.evaluate(({ clipboard }) => clipboard.readText()));
  assert.equal(copied.rows[0][0].value, 'Ana'); assert.equal(copied.rows[0][1].value, '9223372036854775807');
  assert.equal(copied.rows[0][3].type, 'blob');
  checks.push('utility-process-real-sqlite-snapshot-query-integer64-blob-native-clipboard');

  stage = 'native denial';
  await approval(0);
  await page.getByTestId('database-sql').fill('CREATE TABLE declined(x);');
  await page.getByTestId('database-apply').click();
  await page.getByTestId('database-feedback').filter({ hasText: 'cancelada antes de aplicar' }).waitFor();
  assert.equal((await page.evaluate(() => window.omni.databaseState())).revision, 0);
  assert.deepEqual(await fs.readFile(path.join(workspace, 'source.sqlite')), original);
  checks.push('native-decline-no-session-or-file-mutation');

  stage = 'transaction, schema and bound parameters';
  await approval(1);
  await apply('CREATE TABLE orders(id INTEGER PRIMARY KEY, person_id INTEGER REFERENCES people(id), total REAL); CREATE INDEX orders_person ON orders(person_id); INSERT INTO orders VALUES(1,1,12.5);');
  await page.getByTestId('database-object').filter({ hasText: 'orders_person' }).waitFor();
  await page.locator('.database-editor__parameters > summary').click();
  await page.getByTestId('database-parameters').fill(JSON.stringify({ id: 2, name: "Bia'); DROP TABLE people; --" }));
  await apply('INSERT INTO people(id,name) VALUES(:id,:name);');
  await page.getByTestId('database-parameters').fill('');
  await page.locator('.database-editor__parameters > summary').click();
  await query('SELECT people.name, orders.total FROM people JOIN orders ON orders.person_id=people.id;');
  await page.getByTestId('database-results').getByText('12.5', { exact: true }).waitFor();
  assert.deepEqual(await fs.readFile(path.join(workspace, 'source.sqlite')), original);
  checks.push('real-ddl-index-insert-foreign-key-join-bound-literal');

  stage = 'module navigation preserves SQL buffer';
  const buffer = 'SELECT name FROM people ORDER BY id; -- kept while navigating';
  await page.getByTestId('database-sql').fill(buffer);
  await page.getByTestId('primary-sidebar').getByRole('button', { name: 'Arquitetura visual', exact: true }).click();
  await navigate(); assert.equal(await page.getByTestId('database-sql').inputValue(), buffer);
  checks.push('sql-buffer-and-native-session-survive-module-navigation');

  stage = 'renderer reload preserves accepted in-memory image';
  const beforeReload = await page.evaluate(() => window.omni.databaseState());
  await page.reload();
  await page.waitForFunction(() => window.omni?.activeWorkspace);
  await navigate();
  await page.getByTestId('database-session').filter({ hasText: 'source.sqlite' }).waitFor();
  const restored = await page.evaluate(() => window.omni.databaseState());
  assert.equal(restored.sessionId, beforeReload.sessionId); assert.equal(restored.revision, beforeReload.revision); assert.equal(restored.dirty, true);
  await query('SELECT count(*) AS people_count FROM people;');
  await page.getByTestId('database-results').getByText('2', { exact: true }).waitFor();
  checks.push('same-main-process-renderer-reload-restores-dirty-image');

  stage = 'failed script rollback and read-only enforcement';
  const beforeFail = await page.evaluate(() => window.omni.databaseState());
  await page.getByTestId('database-sql').fill("INSERT INTO people VALUES(3,'Temporary'); INSERT INTO people VALUES(1,'Duplicate');");
  await page.getByTestId('database-apply').click();
  await page.getByTestId('database-workbench').getByRole('alert').filter({ hasText: 'UNIQUE' }).waitFor();
  assert.equal((await page.evaluate(() => window.omni.databaseState())).revision, beforeFail.revision);
  await query('SELECT count(*) AS people_count FROM people;');
  await page.getByTestId('database-results').getByText('2', { exact: true }).waitFor();
  await page.getByTestId('database-sql').fill('DELETE FROM people RETURNING id;');
  await page.getByTestId('database-query').click();
  await page.getByTestId('database-workbench').getByRole('alert').filter({ hasText: 'somente leitura' }).waitFor();
  checks.push('atomic-script-error-rolls-back-prior-statements-read-mode-blocks-write');

  stage = 'native cancellation and row limits';
  await page.getByTestId('database-sql').fill('WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<1000000000) SELECT sum(x) FROM n;');
  await page.getByTestId('database-query').click(); await stateWhen(state => state?.running);
  await page.getByTestId('database-cancel').click();
  await page.getByTestId('database-workbench').getByRole('alert').filter({ hasText: 'interrompida' }).waitFor();
  assert.equal((await page.evaluate(() => window.omni.databaseState())).revision, beforeFail.revision);
  await query('WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<1100) SELECT x FROM n;');
  await page.getByTestId('database-results').getByText('Resultado parcial:', { exact: false }).waitFor();
  assert.equal(await page.getByTestId('database-results').locator('tbody tr').count(), 1000);
  checks.push('cancel-native-computation-preserves-image-bounded-1000-row-result');

  stage = 'preview and keyboard query at desktop sizes';
  await page.getByTestId('database-object').filter({ hasText: 'people' }).click();
  await page.getByTestId('database-preview').click();
  await page.getByTestId('database-results').getByText("Bia'); DROP TABLE people; --", { exact: true }).waitFor();
  await page.getByTestId('database-sql').fill('SELECT name FROM people ORDER BY id;');
  await page.getByTestId('database-sql').press('Control+Enter');
  await page.waitForFunction(() => !document.querySelector('[data-testid="database-query"]').disabled);
  await page.getByTestId('database-workbench').evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: path.join(artifacts, 'database-query-1440.png') });
  for (const width of [1280, 1040]) {
    await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setSize(width, 900), width);
    await assertVisibleAction('database-query'); await assertVisibleAction('database-save');
    assert.equal(await page.getByTestId('database-workbench').evaluate(element => element.scrollWidth > element.clientWidth + 1), false);
    await page.screenshot({ path: path.join(artifacts, 'database-query-' + width + '.png') });
  }
  checks.push('schema-table-preview-keyboard-query-no-horizontal-overflow-1040-1280-1440');

  stage = 'minimum native window 1040x680';
  const minimumSize = await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.setSize(1040, 680);
    return window.getSize();
  });
  assert.deepEqual(minimumSize, [1040, 680]);
  await query('SELECT name FROM people ORDER BY id;');
  await assertVisibleAction('database-query');
  await assertVisibleAction('database-save');
  assert.equal(await page.getByTestId('database-workbench').evaluate(element => element.scrollWidth > element.clientWidth + 1), false);
  await page.screenshot({ path: path.join(artifacts, 'database-minimum.png') });
  checks.push('native-minimum-1040x680-query-and-save-accessible-with-internal-scroll');

  stage = 'save-copy denial, successful export and collision';
  await page.getByTestId('database-destination').fill('edited.sqlite');
  await approval(0); await page.getByTestId('database-save').click();
  await page.getByTestId('database-feedback').filter({ hasText: 'Cópia não salva' }).waitFor();
  await assert.rejects(fs.stat(path.join(workspace, 'edited.sqlite')), { code: 'ENOENT' });
  await approval(1); await page.getByTestId('database-save').click(); await stateWhen(state => state?.lastSavedCopy === 'edited.sqlite' && !state.dirty);
  assert.deepEqual(await fs.readFile(path.join(workspace, 'source.sqlite')), original);
  const copy = new DatabaseSync(path.join(workspace, 'edited.sqlite'), { readOnly: true });
  try { assert.equal(copy.prepare('SELECT count(*) AS n FROM people').get().n, 2); assert.equal(copy.prepare('SELECT total FROM orders').get().total, 12.5); }
  finally { copy.close(); }
  await page.getByTestId('database-save').click();
  await page.getByTestId('database-workbench').getByRole('alert').filter({ hasText: 'destino já existe' }).waitFor();
  checks.push('native-export-consent-exclusive-copy-real-file-verification-source-unchanged');

  stage = 'reopen, refuse WAL sidecar, create and dirty-close consent';
  await page.getByTestId('database-close').click(); await stateWhen(state => state === null);
  await page.getByTestId('database-file').filter({ hasText: 'edited.sqlite' }).click();
  await stateWhen(state => state?.sourcePath === 'edited.sqlite');
  await query('SELECT name FROM people ORDER BY id;');
  await page.getByTestId('database-results').getByText("Bia'); DROP TABLE people; --", { exact: true }).waitFor();
  await page.getByTestId('database-close').click(); await stateWhen(state => state === null);
  await fs.writeFile(path.join(workspace, 'source.sqlite-wal'), 'sidecar');
  await page.getByTestId('database-file').filter({ hasText: 'source.sqlite' }).click();
  await page.getByTestId('database-workbench').getByRole('alert').filter({ hasText: 'arquivo auxiliar' }).waitFor();
  assert.equal(await fs.readFile(path.join(workspace, 'source.sqlite-wal'), 'utf8'), 'sidecar');
  await fs.unlink(path.join(workspace, 'source.sqlite-wal'));
  await page.getByTestId('database-create').click(); await stateWhen(state => state?.sourcePath === null && state.dirty);
  assert.equal((await page.evaluate(() => window.omni.databaseState())).schema.objects.length, 0);
  await approval(0); await page.getByTestId('database-close').click();
  await page.waitForFunction(() => !document.querySelector('[data-testid="database-close"]').disabled);
  assert.equal((await page.evaluate(() => window.omni.databaseState())).dirty, true);
  await approval(1); await page.getByTestId('database-close').click(); await stateWhen(state => state === null);
  checks.push('reopen-real-export-refuse-sidecar-blank-create-dirty-close-decline-and-accept');
  assert.deepEqual(pageErrors, []);
  await fs.writeFile(path.join(artifacts, 'database-results.json'), JSON.stringify({ schemaVersion: 1,
    result: 'PASS', checks, environment: process.platform, runtimeNode: process.version,
    scope: 'Synthetic workspace; real Electron utility process and native SQLite. Native dialogs answered only by the E2E fixture.'
  }, null, 2) + '\n');
  console.log('PASS SQLite Electron E2E: ' + checks.join(', '));
} catch (error) {
  console.error('[SQLITE E2E] stage=' + stage, error); process.exitCode = 1;
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(artifacts, 'database-failure.png') }).catch(() => {});
} finally {
  if (app) {
    try { const child = app.process(); if (child && child.exitCode === null) child.kill();
      await Promise.race([app.close().catch(() => {}), new Promise(resolve => setTimeout(resolve, 3000))]); }
    catch { /* Final process cleanup. */ }
  }
  await fs.rm(lab, { recursive: true, force: true }).catch(() => {});
  clearTimeout(watchdog); process.exit(process.exitCode || 0);
}
