/** Windows gate: boots the production renderer in a real Electron process. */
import { _electron as electron } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'omniforge-electron-smoke-'));
let client;

async function bootAndOpen() {
  client = await electron.launch({
    args: ['.'], cwd: projectRoot, timeout: 45_000,
    env: { ...process.env, ELECTRON_RENDERER_URL: '' }
  });
  const page = await client.firstWindow({ timeout: 45_000 });
  page.setDefaultTimeout(25_000);
  page.on('pageerror', error => process.stderr.write(`[renderer] ${error.message}\n`));
  await page.getByText('OMNIFORGE', { exact: false }).first().waitFor();
  await client.evaluate(({ dialog }, directory) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
  }, workspace);
  await page.getByRole('button', { name: 'Abrir projeto' }).click();
  await page.getByText('Projeto aberto:', { exact: false }).waitFor();
  return page;
}

try {
  await fs.writeFile(path.join(workspace, 'exemplo.py'), 'print("real")\n', 'utf8');
  let page = await bootAndOpen();
  await page.getByRole('button', { name: 'Salvar fluxo' }).click();
  await page.getByText('Fluxo gravado em', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Simular' }).click();
  await page.getByText('Simulação concluída', { exact: false }).waitFor();
  await assert.rejects(fs.stat(path.join(workspace, '.omniforge', 'output', 'venda.json')), { code: 'ENOENT' });
  await page.getByRole('button', { name: '▶ Executar' }).click();
  await page.getByText('Execução real concluída', { exact: false }).waitFor();
  const result = JSON.parse(await fs.readFile(path.join(workspace, '.omniforge', 'output', 'venda.json'), 'utf8'));
  assert.equal(result.id, 1001);
  await page.getByRole('button', { name: 'ARQUIVOS', exact: true }).click();
  await page.getByText('exemplo.py').click();
  await page.getByText('exemplo.py', { exact: false }).first().waitFor();
  const loaded = await page.evaluate(async () => window.omni.readFile('exemplo.py'));
  assert.equal(loaded.content, 'print("real")\n');
  await client.close();
  client = null;

  // Real application restart: flow and the user's code must still be there.
  page = await bootAndOpen();
  const document = JSON.parse(await fs.readFile(path.join(workspace, '.omniforge', 'flows', 'principal.json'), 'utf8'));
  assert.equal(document.nodes.length, 3);
  assert.equal(await page.getByRole('button', { name: 'Salvar fluxo' }).isDisabled(), true);
  await page.getByRole('button', { name: 'Validar' }).click();
  await page.getByText('Estrutura válida', { exact: false }).waitFor();
  console.log('PASS Electron E2E: startup, workspace, save, dry-run, real run, file, restart, validation');
} catch (error) {
  if (client) {
    try {
      const pages = client.windows();
      if (pages.length) await pages[0].screenshot({ path: path.join(process.cwd(), 'smoke-failure.png') });
    } catch { /* never hide the original error */ }
  }
  console.error(error);
  process.exitCode = 1;
} finally {
  if (client) await client.close().catch(() => {});
  await fs.rm(workspace, { recursive: true, force: true });
}
