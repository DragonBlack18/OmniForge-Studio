/** Windows E2E: real git.exe, renderer, controlled staging and native commit. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'omni-git-e2e-'));
const workspace = path.join(sandbox, 'workspace');
const profile = path.join(sandbox, 'profile');
await Promise.all([fs.mkdir(workspace), fs.mkdir(profile)]);
const git = (...args) => execFileSync('git', args, {
  cwd: workspace, windowsHide: true, encoding: 'utf8'
}).trim();
git('init', '-q');
git('config', 'user.name', 'OmniForge E2E');
git('config', 'user.email', 'e2e@example.invalid');
await fs.writeFile(path.join(workspace, 'tracked.txt'), 'versão anterior\n');
git('add', '--', 'tracked.txt');
git('commit', '--no-gpg-sign', '-qm', 'base commit');
await fs.writeFile(path.join(workspace, 'tracked.txt'), 'versão alterada\n');
await fs.writeFile(path.join(workspace, 'nova.txt'), 'conteúdo real\n');
let client;
let phase = 'boot';
const watchdog = setTimeout(() => {
  console.error('[GIT E2E] Global watchdog exceeded: ' + phase);
  process.exit(1);
}, 130_000);
watchdog.unref();
try {
  client = await electron.launch({
    args: ['.'], cwd: root, timeout: 45_000,
    env: {
      ...process.env, OMNIFORGE_E2E: '1', OMNIFORGE_E2E_USER_DATA: profile,
      ELECTRON_RENDERER_URL: ''
    }
  });
  const page = await client.firstWindow({ timeout: 45_000 });
  page.setDefaultTimeout(18_000);
  page.on('pageerror', error => console.error('[GIT renderer]', error.message));
  const actualProfile = await client.evaluate(({ app }) => app.getPath('userData'));
  assert.equal(path.normalize(actualProfile).toLowerCase(), path.normalize(profile).toLowerCase());
  await client.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    // Deny the first commit. The UI must honor an explicit native refusal.
    dialog.showMessageBox = async () => ({ response: 0 });
  }, workspace);
  phase = 'open real Git workspace';
  await page.getByRole('button', { name: 'Abrir projeto' }).click();
  await page.getByText('Projeto aberto:', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Controle de versão Git' }).click();
  await page.getByTestId('git-source-control').waitFor();
  await page.getByText('Arquivos modificados', { exact: true }).waitFor();
  const original = await page.evaluate(() => window.omni.gitStatus());
  assert.equal(original.available, true);
  assert.equal(original.files.length, 2);
  assert.ok(original.files.some(file => file.path === 'tracked.txt' && file.unstaged));
  assert.ok(original.files.some(file => file.path === 'nova.txt' && file.untracked));
  phase = 'real stage and unstage';
  await page.getByRole('checkbox', { name: 'Selecionar nova.txt' }).check();
  await page.getByTestId('git-stage').click();
  await page.waitForFunction(async () =>
    (await window.omni.gitStatus()).files.some(file => file.path === 'nova.txt' && file.staged));
  // A completed Git index write can be observed before React has committed
  // the refreshed list and reset its previous selection. Wait for the real UI.
  await page.waitForFunction(() => {
    const box = document.querySelector('input[aria-label="Selecionar nova.txt"]');
    return box && !box.checked && !box.disabled &&
      document.querySelector('[data-testid="git-stage"]')?.textContent?.includes('Preparar (0)');
  });
  await page.getByRole('checkbox', { name: 'Selecionar nova.txt' }).check();
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="git-unstage"]')?.textContent?.includes('Despreparar (1)'));
  await page.getByTestId('git-unstage').click();
  await page.waitForFunction(async () =>
    (await window.omni.gitStatus()).files.some(file => file.path === 'nova.txt' && file.untracked));
  await page.waitForFunction(() => {
    const box = document.querySelector('input[aria-label="Selecionar nova.txt"]');
    return box && !box.checked && !box.disabled &&
      document.querySelector('[data-testid="git-unstage"]')?.textContent?.includes('Despreparar (0)');
  });
  assert.equal(await fs.readFile(path.join(workspace, 'nova.txt'), 'utf8'), 'conteúdo real\n');
  phase = 'explicit native Git commit';
  await page.getByRole('checkbox', { name: 'Selecionar nova.txt' }).check();
  await page.getByTestId('git-stage').click();
  await page.waitForFunction(async () =>
    (await window.omni.gitStatus()).files.some(file => file.path === 'nova.txt' && file.staged));
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="git-commit"]')?.textContent?.includes('Confirmar commit (1)'));
  await page.getByPlaceholder('feat: implementar novo recurso').fill('feat: commit Git de verdade');
  phase = 'native cancel must preserve staged files';
  await page.getByTestId('git-commit').click();
  await page.getByText('Commit cancelado: nenhum arquivo alterado.', { exact: false }).waitFor();
  assert.equal(git('log', '-1', '--format=%s'), 'base commit', 'Cancelar não pode criar commit.');
  assert.ok((await page.evaluate(() => window.omni.gitStatus())).files
    .some(file => file.path === 'nova.txt' && file.staged),
  'Cancelar não pode descartar o índice.');
  phase = 'explicit native Git approval and commit';
  await client.evaluate(({ dialog }) => {
    dialog.showMessageBox = async (_window, options) => {
      if (options?.title !== 'Criar commit Git local' ||
          !String(options?.detail || '').includes('nova.txt')) {
        throw new Error('O commit exige um diálogo nativo com os arquivos preparados.');
      }
      return { response: 1 };
    };
  });
  await page.getByTestId('git-commit').click();
  await page.waitForFunction(async () =>
    (await window.omni.gitStatus()).commits[0]?.subject === 'feat: commit Git de verdade');
  assert.equal(git('log', '-1', '--format=%s'), 'feat: commit Git de verdade');
  const final = await page.evaluate(() => window.omni.gitStatus());
  assert.ok(final.files.some(file => file.path === 'tracked.txt' && file.unstaged));
  assert.ok(!final.files.some(file => file.path === 'nova.txt'));
  assert.equal(await fs.readFile(path.join(workspace, 'tracked.txt'), 'utf8'), 'versão alterada\n');
  phase = 'pass';
  console.log('PASS Git Source Control E2E: real status, stage, unstage, native approval, commit, untouched unrelated file.');
} catch (error) {
  console.error('[GIT E2E] phase=' + phase, error);
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
  await fs.rm(sandbox, { recursive: true, force: true }).catch(() => {});
  clearTimeout(watchdog);
  if (process.exitCode) process.exit(process.exitCode);
}
