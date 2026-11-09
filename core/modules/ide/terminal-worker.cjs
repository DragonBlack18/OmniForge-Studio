'use strict';
// Own process, never a renderer or worker_threads host. No user command is
// accepted before the main process explicitly authorizes one shell session.
const { execFile, spawn } = require('node:child_process');
const path = require('node:path');
const port = process.parentPort;
// node-pty's Windows console-list helper uses child_process.fork. It must
// reopen the Electron executable as Node, not launch another application.
// The user shell receives a separate filtered environment from the host.
if (process.versions.electron) process.env.ELECTRON_RUN_AS_NODE = '1';
const send = value => { try { if (port) port.postMessage(value); else process.send?.(value); } catch {} };
let terminal = null, started = false, stopping = false, finished = false;
let sequence = 0, acknowledged = 0, outstanding = 0, paused = false, lastHeartbeat = Date.now();
const chunks = new Map();
const HIGH = 131_072, LOW = 32_768, HARD_LIMIT = 1_048_576;
let finishTimer, killTimer;

function finish(exitCode = null, signal = null, error = '') {
  if (finished) return;
  finished = true;
  clearTimeout(killTimer);
  send({ type: 'exit', exitCode, signal, error });
  // Let the message port and native ConPTY disposal finish before exiting.
  finishTimer = setTimeout(() => process.exit(error ? 1 : 0), 150);
}

async function killTree(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return;
  if (process.platform === 'win32') {
    const root = process.env.SystemRoot || process.env.SYSTEMROOT || 'C:\\Windows';
    await new Promise(resolve => {
      const child = spawn(path.join(root, 'System32', 'taskkill.exe'), ['/PID', String(pid), '/T', '/F'],
        { windowsHide: true, shell: false, stdio: 'ignore' });
      const timer = setTimeout(() => { try { child.kill(); } catch {} resolve(); }, 2000);
      const done = () => { clearTimeout(timer); resolve(); };
      child.once('error', done); child.once('close', done);
    });
  } else {
    // Interactive job control gives children their own process groups. Walk
    // descendants before killing the shell instead of killing only its group.
    const descendants = await new Promise(resolve => execFile('/bin/ps', ['-eo', 'pid=,ppid='],
      { timeout: 1500, maxBuffer: 256_000, encoding: 'utf8' }, (error, stdout) => {
        if (error) return resolve([]);
        const parents = new Map();
        for (const line of stdout.split('\n')) {
          const [child, parent] = line.trim().split(/\s+/).map(Number);
          if (Number.isInteger(child) && child > 0 && Number.isInteger(parent)) {
            const values = parents.get(parent) || []; values.push(child); parents.set(parent, values);
          }
        }
        const list = [], seen = new Set([pid]), queue = [pid];
        while (queue.length && list.length < 4000) {
          for (const child of parents.get(queue.shift()) || []) {
            if (!seen.has(child)) { seen.add(child); list.push(child); queue.push(child); }
          }
        }
        resolve(list.reverse());
      }));
    for (const child of descendants) { try { process.kill(child, 'SIGKILL'); } catch {} }
    try { process.kill(-pid, 'SIGKILL'); } catch {}
  }
}

async function stop() {
  if (stopping || finished) return;
  stopping = true;
  killTimer = setTimeout(() => finish(null, null, 'O PTY não confirmou o encerramento dentro do prazo.'), 3500);
  if (!terminal) return finish();
  try { terminal.resume(); } catch {}
  await killTree(terminal.pid);
  try { terminal.kill(process.platform === 'win32' ? undefined : 'SIGKILL'); } catch { finish(); }
}

function output(data) {
  if (finished || stopping) return;
  for (let offset = 0; offset < data.length;) {
    let end = Math.min(offset + 4096, data.length);
    if (end < data.length && /[\uD800-\uDBFF]/.test(data[end - 1])) end--;
    const chunk = data.slice(offset, end); offset = end;
    const bytes = Buffer.byteLength(chunk);
    chunks.set(++sequence, bytes); outstanding += bytes;
    if (outstanding > HARD_LIMIT) { send({ type: 'failure', error: 'Saída excedeu o buffer supervisionado do terminal.' }); void stop(); return; }
    send({ type: 'data', sequence, chunk });
  }
  if (!paused && outstanding >= HIGH) { paused = true; terminal.pause(); }
}

async function receive(message) {
  if (!message || typeof message !== 'object' || finished) return;
  try {
    if (message.type === 'heartbeat') { lastHeartbeat = Date.now(); return; }
    if (message.type === 'close') { await stop(); return; }
    if (message.type === 'start') {
      if (started || stopping) return;
      started = true;
      const plan = message.plan;
      const pty = require('node-pty');
      terminal = pty.spawn(plan.shell.executable, plan.shell.args, {
        name: 'xterm-256color', cwd: plan.workspace, env: plan.environment,
        cols: plan.cols, rows: plan.rows, useConpty: true, useConptyDll: false,
        handleFlowControl: false
      });
      terminal.onData(output);
      terminal.onExit(event => finish(event.exitCode, event.signal));
      send({ type: 'started', pid: terminal.pid });
      return;
    }
    if (!terminal || stopping) return;
    if (message.type === 'input') terminal.write(message.data);
    else if (message.type === 'resize') terminal.resize(message.cols, message.rows);
    else if (message.type === 'ack' && Number.isSafeInteger(message.sequence) &&
        message.sequence > acknowledged && message.sequence <= sequence) {
      acknowledged = message.sequence;
      for (const [id, bytes] of chunks) {
        if (id > acknowledged) break;
        outstanding -= bytes; chunks.delete(id);
      }
      if (paused && outstanding <= LOW) { paused = false; terminal.resume(); }
    }
  } catch (error) {
    send({ type: 'failure', error: 'Falha no terminal local: ' + String(error.code || error.message || 'erro nativo').slice(0, 240) });
    if (!terminal) finish(null, null, 'Não foi possível iniciar o PTY.');
    else await stop();
  }
}
if (port) port.on('message', event => { void receive(event.data); });
else process.on('message', message => { void receive(message); });
process.on('disconnect', () => { void stop(); });
process.on('SIGTERM', () => { void stop(); });
process.on('SIGINT', () => { void stop(); });
const heartbeat = setInterval(() => { if (Date.now() - lastHeartbeat > 12_000) void stop(); }, 1000);
heartbeat.unref();
process.on('exit', () => {
  clearTimeout(finishTimer);
  if (terminal && !finished) { try { terminal.kill(); } catch {} }
});
send({ type: 'ready' });
