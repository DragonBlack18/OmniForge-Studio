import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { listTerminalShells, prepareTerminalOpen, terminalDimensions, terminalEnvironment,
  terminalInput, validateTerminalOpen, TERMINAL_HISTORY_CHARS } from '../core/modules/ide/terminal-contract.mjs';
import { TerminalSession } from '../core/modules/ide/terminal-session.mjs';

async function until(predicate, timeout = 12_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Terminal state did not settle within ' + timeout + ' ms.');
}
function createWorker(entry, options) {
  const child = fork(entry, [], { cwd: options.cwd, env: options.env, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  child.postMessage = message => child.send(message);
  return child;
}
async function fixture(t, { onEvent = () => {} } = {}) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'omni-pty-test-'));
  const plan = await prepareTerminalOpen(workspace, { shellId: process.platform === 'win32' ? 'cmd' : 'sh', cols: 90, rows: 28 });
  const session = new TerminalSession({ createWorker, onEvent });
  t.after(async () => {
    session.close(); await until(() => !session.isRunning).catch(() => {});
    await fs.rm(workspace, { recursive: true, force: true });
  });
  await session.start(plan);
  return { workspace, session, plan };
}

test('terminal contract rejects arbitrary launcher, cwd, startup command, input overflow and invalid dimensions', () => {
  const input = { shellId: 'sh', cols: 80, rows: 24 };
  assert.deepEqual(validateTerminalOpen(input), input);
  for (const property of ['executable', 'command', 'cwd', 'env', 'args']) {
    assert.throws(() => validateTerminalOpen({ ...input, [property]: 'unexpected' }), /inválida/);
  }
  assert.throws(() => validateTerminalOpen({ ...input, shellId: '../shell' }), /inválida/);
  for (const pair of [[0, 24], [80, 0], [501, 24], [80, 201], [80.1, 24]]) assert.throws(() => terminalDimensions(...pair));
  for (const value of ['', 'a'.repeat(16385), '\0', null]) assert.throws(() => terminalInput(value));
  assert.equal(terminalInput('\x03'), '\x03');
});

test('terminal environment strips inherited credentials and startup injection while preserving Windows basics', () => {
  const env = terminalEnvironment({ PATH: '/bin', SystemRoot: 'C:\\Windows', NODE_OPTIONS: '--require evil',
    PYTHONPATH: '/evil', BASH_ENV: '/evil', ENV: '/evil', SECRET_TOKEN: 'credential' });
  assert.equal(env.PATH, '/bin'); assert.equal(env.SystemRoot, 'C:\\Windows');
  for (const key of ['NODE_OPTIONS', 'PYTHONPATH', 'BASH_ENV', 'ENV', 'SECRET_TOKEN']) assert.equal(env[key], undefined);
  assert.equal(env.TERM, 'xterm-256color');
});

test('shell discovery is metadata-only, Windows paths are fixed, and unsupported ConPTY is unavailable', async () => {
  const visited = [];
  const options = { platform: 'win32', release: '10.0.22631', environment: { SystemRoot: 'C:\\Windows', PATH: 'C:\\untrusted' },
    realpath: async file => file, stat: async file => { visited.push(file); return { isFile: () => true }; } };
  const result = await listTerminalShells(options);
  assert.deepEqual(result.shells.map(shell => shell.id), ['powershell', 'cmd']);
  assert.ok(visited.every(file => file.startsWith('C:\\Windows\\System32\\')));
  assert.deepEqual(result.shells[0].args, ['-NoLogo', '-NoProfile']);
  assert.deepEqual(result.shells[1].args, ['/D']);
  assert.deepEqual((await listTerminalShells({ ...options, release: '10.0.17763' })).shells, []);
});

test('a utility-process crash before readiness fails startup and releases supervision', async () => {
  const worker = new EventEmitter(); worker.postMessage = () => {}; worker.kill = () => {};
  const session = new TerminalSession({ createWorker: () => { queueMicrotask(() => worker.emit('exit', 1)); return worker; } });
  await assert.rejects(session.start({ workspace: os.tmpdir(), shell: { id: 'sh', label: 'sh', executable: '/bin/sh' }, cols: 80, rows: 24 }), /inesperadamente/);
  assert.equal(session.snapshot().status, 'failed'); assert.equal(session.isRunning, false);
});

test('cancellation before worker readiness never dispatches the shell startup plan', async () => {
  const messages = [], worker = new EventEmitter();
  worker.postMessage = message => messages.push(message); worker.kill = () => {};
  const session = new TerminalSession({ createWorker: () => worker });
  const starting = session.start({ workspace: os.tmpdir(), shell: { id: 'sh', label: 'sh', executable: '/bin/sh' }, cols: 80, rows: 24 });
  const rejected = assert.rejects(starting, /encerrada/);
  assert.equal(session.close(), true); worker.emit('message', { type: 'ready' }); worker.emit('exit', 0);
  await rejected;
  assert.equal(messages.some(message => message.type === 'start'), false);
  assert.equal(session.isRunning, false);
});

test('a worker that ignores shutdown reports forced failure instead of confirmed success', async () => {
  const worker = new EventEmitter();
  worker.postMessage = message => {
    if (message.type === 'start') queueMicrotask(() => worker.emit('message', { type: 'started', pid: 12345 }));
  };
  worker.kill = () => worker.emit('exit', 0);
  const session = new TerminalSession({ createWorker: () => {
    queueMicrotask(() => worker.emit('message', { type: 'ready' })); return worker;
  }, shutdownMs: 20 });
  await session.start({ workspace: os.tmpdir(), shell: { id: 'sh', label: 'sh', executable: '/bin/sh' }, cols: 80, rows: 24 });
  session.close(); await until(() => !session.isRunning);
  assert.equal(session.snapshot().status, 'failed');
  assert.match(session.snapshot().message, /não confirmou.*forçado/);
});

test('real PTY reports interactive stdin/stdout, supports Unicode and writes a real artifact', async t => {
  const { workspace, session, plan } = await fixture(t);
  assert.equal(session.snapshot().status, 'running');
  await assert.rejects(session.start(plan), /sessão/);
  session.write("node -e \"require('node:fs').writeFileSync('pty-proof.json',JSON.stringify({input:process.stdin.isTTY,output:process.stdout.isTTY}));console.log('PTY'+'_REAL_ação')\"\r");
  await until(async () => { try { await fs.stat(path.join(workspace, 'pty-proof.json')); return true; } catch { return false; } });
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(workspace, 'pty-proof.json'), 'utf8')), { input: true, output: true });
  await until(() => session.history.includes('PTY_REAL_ação'));
  assert.equal(session.ack(session.snapshot().sequence + 100), false);
});

test('real PTY resizes the underlying console and preserves the session after Ctrl+C', async t => {
  const { workspace, session } = await fixture(t);
  session.resize(113, 37);
  session.write("node -e \"require('node:fs').writeFileSync('size.json',JSON.stringify([process.stdout.columns,process.stdout.rows]));console.log('SIZE'+'_READY');setInterval(()=>{},1000)\"\r");
  await until(() => session.history.includes('SIZE_READY'));
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(workspace, 'size.json'), 'utf8')), [113, 37]);
  session.write('\x03');
  // cmd asks whether to terminate a batch file only for batch scripts; this is
  // a direct executable and should return to its interactive prompt.
  session.write("node -e \"require('node:fs').writeFileSync('after-interrupt.txt','OK')\"\r");
  await until(async () => { try { return (await fs.readFile(path.join(workspace, 'after-interrupt.txt'), 'utf8')) === 'OK'; } catch { return false; } });
  assert.equal(session.snapshot().status, 'running');
});

test('real PTY backpressure pauses a fast producer until acknowledgements and bounds retained output', async t => {
  const { session } = await fixture(t);
  session.attach();
  session.write("node -e \"process.stdout.write('x'.repeat(400000));console.log('FLOW'+'_DRAINED')\"\r");
  await until(() => session.snapshot().sequence >= 25);
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal(session.history.includes('FLOW_DRAINED'), false);
  assert.ok(session.history.length <= TERMINAL_HISTORY_CHARS);
  await until(() => { session.ack(session.snapshot().sequence); return session.history.includes('FLOW_DRAINED'); });
  assert.equal(session.historyTruncated, true);
  assert.equal(session.snapshot().status, 'running');
  session.detach();
});

test('closing a real interactive session terminates an ordinary foreground child and its delayed write', async t => {
  const { workspace, session } = await fixture(t);
  session.write("node -e \"console.log('CHILD'+'_READY');setTimeout(()=>require('node:fs').writeFileSync('orphan.txt','BAD'),1600);setInterval(()=>{},1000)\"\r");
  await until(() => session.history.includes('CHILD_READY'));
  assert.equal(session.close(), true);
  await until(() => !session.isRunning);
  await new Promise(resolve => setTimeout(resolve, 1750));
  await assert.rejects(fs.stat(path.join(workspace, 'orphan.txt')), { code: 'ENOENT' });
  assert.equal(session.snapshot().status, 'closed');
});

test('shell exit is reported with its actual exit code', async t => {
  const { session } = await fixture(t);
  session.write(process.platform === 'win32' ? 'exit 7\r' : 'exit 7\r');
  await until(() => !session.isRunning);
  assert.equal(session.snapshot().status, 'exited'); assert.equal(session.snapshot().exitCode, 7);
});
