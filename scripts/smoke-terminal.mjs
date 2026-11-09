/** Real xterm → preload → native consent → utility process → PTY. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lab = await fs.mkdtemp(path.join(os.tmpdir(), 'omni-terminal-e2e-'));
const workspace = path.join(lab, 'workspace'), profile = path.join(lab, 'profile');
const artifacts = path.join(root, 'smoke-artifacts');
await Promise.all([fs.mkdir(workspace), fs.mkdir(profile), fs.mkdir(artifacts, { recursive: true })]);
await fs.rm(path.join(artifacts, 'terminal-results.json'), { force: true });
await fs.writeFile(path.join(workspace, 'editable.txt'), 'ORIGINAL');
await fs.writeFile(path.join(workspace, 'coexist.cjs'), "console.log('COEXIST_REAL');");
await fs.writeFile(path.join(workspace, 'hold.cjs'), "console.log('HOLD'+'_READY');setInterval(()=>{},500);");
await fs.writeFile(path.join(workspace, 'delayed.cjs'), "console.log('DELAY'+'_READY');setTimeout(()=>require('node:fs').writeFileSync('orphan.txt','BAD'),2500);setInterval(()=>{},500);");
let app, appProcess, page, stage = 'boot';
const checks = [], pageErrors = [];
const watchdog = setTimeout(() => { console.error('[TERMINAL E2E] timeout at ' + stage); process.exit(1); }, 180_000);
watchdog.unref();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, label, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await predicate()) return; await pause(50); }
  throw new Error('Timeout: ' + label);
}
const state = () => page.evaluate(() => window.omni.terminalState());
async function command(text) {
  await page.getByTestId('terminal-input').focus();
  await page.keyboard.insertText(text); await page.keyboard.press('Enter');
}
const output = () => page.getByTestId('terminal-surface').innerText();
async function shown(text) { await until(async () => (await output()).includes(text), 'output ' + text); }
const promptCount = text => (text.match(process.platform === 'win32' ? /^PS [^\r\n]*?>/gm : /^bash-[\d.]+[#$]/gm) || []).length;
try {
  app = await electron.launch({ args: ['.'], cwd: root, timeout: 45_000,
    env: { ...process.env, ELECTRON_RENDERER_URL: '', OMNIFORGE_E2E: '1', OMNIFORGE_E2E_USER_DATA: profile } });
  appProcess = app.process();
  page = await app.firstWindow({ timeout: 45_000 }); page.setDefaultTimeout(15_000);
  page.on('pageerror', error => pageErrors.push(error.message));
  await app.evaluate(({ BrowserWindow, dialog }, workspace) => {
    BrowserWindow.getAllWindows()[0].setSize(1440, 900);
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [workspace] });
    dialog.showMessageBox = async () => ({ response: 0 });
  }, workspace);
  await page.getByRole('button', { name: 'Abrir projeto', exact: true }).click();
  await page.getByText('Projeto aberto:', { exact: false }).waitFor();
  await page.getByTestId('primary-sidebar').getByRole('button', { name: 'Terminal interativo', exact: true }).click();
  await page.getByTestId('terminal-workbench').waitFor();
  await until(async () => !(await page.getByTestId('terminal-open').isDisabled()), 'available shell');
  assert.equal(await page.getByTestId('terminal-shell').inputValue(), process.platform === 'win32' ? 'powershell' : 'bash');
  stage = 'native deny';
  await page.getByTestId('terminal-open').click();
  await page.getByText('Abertura do terminal cancelada.', { exact: false }).waitFor();
  assert.equal(await state(), null); checks.push('native-denial-no-session');
  await app.evaluate(({ dialog, clipboard, shell }) => {
    dialog.showMessageBox = async (_window, options) => {
      if (options.title === 'Abrir terminal interativo' && (!options.detail.includes('Workspace:') || !options.detail.includes('Shell:'))) throw Error('Missing precise terminal consent');
      return { response: 1 };
    };
    clipboard.writeText('TERMINAL_CLIPBOARD_SENTINEL');
    globalThis.terminalUnexpectedLinks = [];
    shell.openExternal = async url => { globalThis.terminalUnexpectedLinks.push(url); };
  });
  stage = 'real PTY through keyboard';
  await page.getByTestId('terminal-open').click();
  await until(async () => (await state())?.status === 'running', 'real PTY running');
  await page.getByText('Terminal aberto:', { exact: false }).waitFor();
  await command("node -e \"require('node:fs').writeFileSync('terminal-live.json',JSON.stringify({tty:process.stdout.isTTY,args:process.argv.slice(1)}));console.log('TERMINAL'+'_READY_ação')\" \"two words\"");
  await shown('TERMINAL_READY_ação');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(workspace, 'terminal-live.json'), 'utf8')), { tty: true, args: ['two words'] });
  checks.push('default-shell-real-pty-keyboard-unicode-arguments');

  stage = 'concurrent editor and development runner';
  await page.evaluate(async () => {
    const file = await window.omni.readFile('editable.txt');
    await window.omni.saveFile('editable.txt', 'EDITED_WITH_TERMINAL_OPEN', file.revision);
    const files = await window.omni.listDevelopmentTargets();
    const target = files.targets.find(item => item.path === 'coexist.cjs');
    await window.omni.runDevelopmentTask({ path: target.path, revision: target.revision, action: 'run', args: [] });
  });
  await until(async () => (await page.evaluate(() => window.omni.developmentState()))?.status === 'completed', 'coexisting supervised task');
  assert.equal(await fs.readFile(path.join(workspace, 'editable.txt'), 'utf8'), 'EDITED_WITH_TERMINAL_OPEN');
  assert.equal((await state()).status, 'running');
  const switchError = await page.evaluate(async () => { try { await window.omni.selectWorkspace(); return ''; } catch (error) { return error.message; } });
  assert.match(switchError, /Encerre a sessão/);
  checks.push('save-and-run-concurrently-workspace-switch-blocked');

  stage = 'terminal survives navigation and resize';
  const oldId = (await state()).id;
  await page.getByTestId('primary-sidebar').getByRole('button', { name: 'Editor de código', exact: true }).click();
  await page.getByTestId('primary-sidebar').getByRole('button', { name: 'Terminal interativo', exact: true }).click();
  assert.equal((await state()).id, oldId); await shown('TERMINAL_READY_ação');
  const sidebar = page.getByTestId('primary-sidebar');
  const sidebarClass = await sidebar.getAttribute('class'), sidebarWidth = (await sidebar.boundingBox()).width;
  const promptsBeforeShortcut = promptCount(await output());
  await page.getByTestId('terminal-input').focus(); await page.keyboard.press('Control+b');
  assert.equal(await page.getByTestId('terminal-workbench').isVisible(), true);
  assert.equal(await sidebar.getAttribute('class'), sidebarClass, 'Ctrl+B must not toggle the application sidebar');
  assert.equal((await sidebar.boundingBox()).width, sidebarWidth, 'Ctrl+B must not resize the application sidebar');
  // Ctrl+B is deliberately forwarded to the shell. Unlike Bash's Emacs mode,
  // Windows PSReadLine may insert that unbound control character into the line.
  // Cancel this edit and observe a fresh prompt before testing another command.
  await page.keyboard.press('Control+c');
  await until(async () => promptCount(await output()) > promptsBeforeShortcut, 'fresh shell prompt after shortcut');
  assert.equal((await state()).id, oldId);
  const previousColumns = (await state()).cols;
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 800));
  await until(async () => (await state()).cols < previousColumns, 'PTY resize after navigation');
  await command("node -e \"require('node:fs').writeFileSync('terminal-size.json',JSON.stringify([process.stdout.columns,process.stdout.rows]));console.log('RESIZE'+'_DONE')\"");
  await shown('RESIZE_DONE');
  const resized = await state();
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(workspace, 'terminal-size.json'), 'utf8')), [resized.cols, resized.rows]);
  await page.screenshot({ path: path.join(artifacts, 'terminal-compact.png') });
  checks.push('persistent-session-navigation-shortcuts-resize');

  stage = 'minimum native window';
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1040, 680));
  await until(async () => (await state()).cols < resized.cols, 'PTY fits native minimum');
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight,
    overflow: document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth }));
  assert.equal(viewport.overflow, false);
  for (const id of ['terminal-open', 'terminal-close', 'terminal-interrupt', 'terminal-surface']) {
    const box = await page.getByTestId(id).boundingBox();
    assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 &&
      box.y + box.height <= viewport.height + 1, id + ' must remain visible at 1040 × 680');
  }
  await page.screenshot({ path: path.join(artifacts, 'terminal-minimum.png') });
  checks.push('minimum-1040x680-fit-actions-no-overflow');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 800));

  stage = 'renderer reload reattaches workspace and terminal';
  await page.reload();
  await page.getByTestId('primary-sidebar').getByRole('button', { name: 'Terminal interativo', exact: true }).click();
  await until(async () => (await page.getByTestId('terminal-status').innerText()).includes('Sessão ativa'), 'reattached session after reload');
  assert.equal((await state()).id, oldId);
  await command("node -e \"console.log('RELOAD'+'_REATTACHED')\""); await shown('RELOAD_REATTACHED');
  checks.push('renderer-reload-reattaches-current-workspace-and-session');

  stage = 'untrusted terminal escape output';
  await command("node -e \"process.stdout.write('\\x1b]52;c;'+Buffer.from('UNEXPECTED').toString('base64')+'\\x07');process.stdout.write('\\x1b]8;;https://example.com\\x07LINK_TEXT\\x1b]8;;\\x07');console.log('OSC'+'_DONE')\"");
  await shown('OSC_DONE');
  assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), 'TERMINAL_CLIPBOARD_SENTINEL');
  assert.deepEqual(await app.evaluate(() => globalThis.terminalUnexpectedLinks), []);
  checks.push('osc52-no-clipboard-write-osc8-no-navigation');

  stage = 'explicit copy selection';
  await command("node -e \"console.clear();console.log('COPY'+'_TERMINAL_SELECTED')\"");
  await shown('COPY_TERMINAL_SELECTED');
  const row = page.locator('.xterm-rows > div').filter({ hasText: 'COPY_TERMINAL_SELECTED' }).first();
  const rowBox = await row.boundingBox(), columns = (await state()).cols;
  assert.ok(rowBox);
  await page.mouse.move(rowBox.x + 1, rowBox.y + rowBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(rowBox.x + rowBox.width / columns * 22, rowBox.y + rowBox.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Copiar seleção', exact: true }).click();
  await page.getByText('Seleção copiada.', { exact: false }).waitFor();
  assert.equal((await app.evaluate(({ clipboard }) => clipboard.readText())).trim(), 'COPY_TERMINAL_SELECTED');
  checks.push('explicit-user-selection-copy');

  stage = 'Ctrl+C and continued shell';
  await command('node hold.cjs'); await shown('HOLD_READY');
  await page.getByTestId('terminal-interrupt').click(); await pause(150);
  await command("node -e \"console.log('AFTER'+'_CTRL_C')\""); await shown('AFTER_CTRL_C');
  checks.push('ctrl-c-keeps-shell-usable');
  stage = 'shared close confirmation and descendant cleanup';
  await command('node delayed.cjs'); await shown('DELAY_READY');
  await page.getByTestId('terminal-close').click();
  await page.getByRole('dialog').waitFor(); await page.keyboard.press('Escape');
  assert.equal((await state()).status, 'running');
  await page.getByTestId('terminal-close').click();
  await page.getByRole('button', { name: 'Encerrar sessão', exact: true }).click();
  await until(async () => (await state())?.status === 'closed', 'confirmed terminal shutdown');
  await pause(2700); await assert.rejects(fs.stat(path.join(workspace, 'orphan.txt')), { code: 'ENOENT' });
  checks.push('close-confirmation-cancel-accept-no-orphan-artifact');
  await page.screenshot({ path: path.join(artifacts, 'terminal-closed.png') });

  stage = 'native application close drains active terminal';
  await page.getByTestId('terminal-open').click();
  await until(async () => (await state())?.status === 'running', 'second terminal session');
  assert.deepEqual(pageErrors, []);
  const closed = app.waitForEvent('close', { timeout: 15_000 });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await closed;
  checks.push('native-close-drains-terminal-before-exit');
  await fs.rm(path.join(artifacts, 'terminal-failure.png'), { force: true });
  await fs.rm(path.join(artifacts, 'terminal-failure.json'), { force: true });
  await fs.writeFile(path.join(artifacts, 'terminal-results.json'), JSON.stringify({ schemaVersion: 1,
    result: 'PASS', checks, platform: process.platform, shell: process.platform === 'win32' ? 'Windows PowerShell' : 'Bash',
    scope: 'Real PTY and utility process. Disposable workspace/profile; native approval mocked only by E2E harness.' }, null, 2) + '\n');
  console.log('PASS Terminal Electron E2E: ' + checks.join(', '));
} catch (error) {
  console.error('[TERMINAL E2E] stage=' + stage, error); process.exitCode = 1;
  const diagnostic = { stage, error: error.message, platform: process.platform, checks, pageErrors };
  // Only this disposable fixture's output is recorded, never application logs.
  if (page && !page.isClosed()) {
    diagnostic.terminal = await state().catch(() => null);
    diagnostic.output = await output().then(text => text.slice(-8192)).catch(() => null);
  }
  diagnostic.resizeProof = await fs.readFile(path.join(workspace, 'terminal-size.json'), 'utf8').catch(() => null);
  await fs.writeFile(path.join(artifacts, 'terminal-failure.json'), JSON.stringify(diagnostic, null, 2) + '\n').catch(() => {});
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(artifacts, 'terminal-failure.png') }).catch(() => {});
} finally {
  if (app && appProcess?.exitCode === null && !appProcess.signalCode) {
    appProcess.kill();
    await Promise.race([app.close().catch(() => {}), pause(3000)]);
  }
  await fs.rm(lab, { recursive: true, force: true }).catch(() => {});
  clearTimeout(watchdog); process.exit(process.exitCode || 0);
}
