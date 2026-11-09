/** Self-contained so the installed executable can evaluate this function.
 * All application/native modules resolve inside its own app.asar/unpacked tree.
 * Requires a disposable workspace supplied by the distribution test harness.
 */
export async function runPackagedNativeToolsChecks(coreRoot, workspace) {
  const { default: assert } = await import('node:assert/strict');
  const { default: fs } = await import('node:fs/promises');
  const { default: path } = await import('node:path');
  const { fork } = await import('node:child_process');
  const { pathToFileURL } = await import('node:url');
  assert.ok(path.isAbsolute(coreRoot) && path.isAbsolute(workspace));
  const load = file => import(pathToFileURL(path.join(coreRoot, 'modules', 'ide', file)).href);
  const { prepareTerminalOpen } = await load('terminal-contract.mjs');
  const { TerminalSession } = await load('terminal-session.mjs');
  const nativePackage = JSON.parse(await fs.readFile(path.join(path.dirname(coreRoot), 'node_modules', 'node-pty', 'package.json'), 'utf8'));
  assert.equal(nativePackage.version, '1.1.0');
  const plan = await prepareTerminalOpen(workspace, { shellId: process.platform === 'win32' ? 'cmd' : 'sh', cols: 92, rows: 29 });
  const session = new TerminalSession({ createWorker: (entry, options) => {
    assert.ok(entry.startsWith(coreRoot), 'O worker deve vir do aplicativo instalado.');
    const child = fork(entry, [], { cwd: options.cwd,
      env: { ...options.env, ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}) },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    child.postMessage = message => child.send(message);
    return child;
  } });
  const wait = async predicate => {
    const until = Date.now() + 15_000;
    while (Date.now() < until) {
      if (await predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    throw new Error('O terminal do aplicativo instalado não concluiu a operação: ' + JSON.stringify(session.snapshot()));
  };
  try {
    const state = await session.start(plan);
    assert.equal(state.status, 'running'); assert.ok(Number.isInteger(state.pid) && state.pid > 0);
    assert.equal(session.resize(107, 33), true);
    const filename = path.join(workspace, 'packaged-terminal-proof.txt');
    session.write(process.platform === 'win32' ? 'echo PACKAGED_PTY_OK> packaged-terminal-proof.txt\r' :
      "printf 'PACKAGED_PTY_OK' > packaged-terminal-proof.txt\r");
    await wait(async () => { try { return (await fs.readFile(filename, 'utf8')).trim() === 'PACKAGED_PTY_OK'; } catch { return false; } });
    session.close(); await wait(() => !session.isRunning);
    assert.equal(session.snapshot().status, 'closed', session.snapshot().message);
    return { terminal: 'PASS', nodePty: nativePackage.version,
      checks: ['installed-module', 'real-pty', 'fixed-shell', 'resize', 'real-file', 'confirmed-worker-exit'] };
  } finally {
    session.close(); await wait(() => !session.isRunning).catch(() => {});
  }
}
