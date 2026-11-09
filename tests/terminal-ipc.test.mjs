import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { installTerminalIpc } = createRequire(import.meta.url)('../electron/modules/terminal-ipc.cjs');

function fixture({ onPrepare = () => {}, onDialog = () => {}, response = 1, busy = () => false } = {}) {
  const handlers = new Map(), calls = [], dialogs = [], events = [], copied = [];
  let workspace = '/fixture/project', canonical = '/bin/sh';
  class Session {
    constructor(options) { this.options = options; this.isRunning = false; }
    snapshot() { return this.state; }
    async start(plan) { calls.push(plan); this.isRunning = true;
      this.state = { id: 'session-id', workspace: plan.workspace, status: 'running' };
      this.options.onEvent({ type: 'started', session: this.state }); return this.state; }
    close() { this.isRunning = false; return true; }
    write(data) { return data; } resize() { return true; } ack() { return true; }
    attach() { return this.state; } detach() { return true; }
  }
  const controller = installTerminalIpc({ register: (name, handler) => handlers.set(name, handler),
    dialog: { showMessageBox: async (_window, options) => { dialogs.push(options); await onDialog(); return { response }; } },
    getWorkspace: () => workspace, getWindow: () => ({ isDestroyed: () => false,
      webContents: { isDestroyed: () => false, send: (channel, event) => events.push({ channel, event }) } }),
    isHostBusy: busy, createWorker: () => { throw new Error('Should use fake session'); },
    writeClipboard: text => copied.push(text),
    loadSession: async () => ({ TerminalSession: Session }),
    loadContract: async () => ({ prepareTerminalOpen: async (root, request) => {
      await onPrepare(); return { ...request, workspace: root, shell: { id: 'sh', label: 'Shell POSIX',
        executable: '/bin/sh', canonical, args: ['-i'] } };
    }, listTerminalShells: async () => ({ shells: [] }) }) });
  return { handlers, calls, dialogs, events, copied, controller,
    run: () => handlers.get('openTerminal')({ shellId: 'sh', cols: 80, rows: 24 }),
    setWorkspace: value => { workspace = value; }, setCanonical: value => { canonical = value; } };
}
test('terminal opening requires explicit native consent naming exact workspace and fixed shell', async () => {
  const denied = fixture({ response: 0 }); assert.equal(await denied.run(), null); assert.equal(denied.calls.length, 0);
  const approved = fixture(); assert.equal((await approved.run()).status, 'running');
  assert.equal(approved.dialogs[0].defaultId, 0); assert.equal(approved.dialogs[0].cancelId, 0);
  assert.match(approved.dialogs[0].detail, /\/fixture\/project/); assert.match(approved.dialogs[0].detail, /\/bin\/sh/);
  assert.equal(approved.events[0].channel, 'omni:terminalEvent');
  assert.equal(approved.handlers.get('writeTerminal')('session-id', 'echo hello\r'), 'echo hello\r');
  assert.throws(() => approved.handlers.get('writeTerminal')('wrong', 'data'), /Sessão/);
});
test('terminal consent is exclusive and host cancellation invalidates approval arriving later', async () => {
  let release;
  const f = fixture({ onDialog: () => new Promise(resolve => { release = resolve; }) });
  const opening = f.run(); while (!release) await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.controller.isPending(), true); await assert.rejects(f.run(), /Conclua/);
  assert.equal(f.controller.cancel(), true); release(); assert.equal(await opening, null);
  assert.equal(f.calls.length, 0); assert.equal(f.controller.isActive(), false);
});
test('terminal cancellation before preparation prevents even a native dialog', async () => {
  let release;
  const f = fixture({ onPrepare: () => new Promise(resolve => { release = resolve; }) });
  const opening = f.run(); while (!release) await new Promise(resolve => setImmediate(resolve));
  f.controller.cancel(); release(); assert.equal(await opening, null);
  assert.equal(f.dialogs.length, 0); assert.equal(f.calls.length, 0);
});
test('workspace changes and shell replacement after consent prevent PTY creation', async () => {
  const changedWorkspace = fixture({ onDialog: () => changedWorkspace.setWorkspace('/elsewhere') });
  await assert.rejects(changedWorkspace.run(), /workspace mudou/); assert.equal(changedWorkspace.calls.length, 0);
  const changedShell = fixture({ onDialog: () => changedShell.setCanonical('/elsewhere/sh') });
  await assert.rejects(changedShell.run(), /ambiente.*mudou/); assert.equal(changedShell.calls.length, 0);
  const busy = fixture({ busy: () => true }); await assert.rejects(busy.run(), /Conclua/);
});
test('explicit selection copy is scoped to the session and rejects oversized or invalid text', async () => {
  const f = fixture(); await f.run();
  const copy = f.handlers.get('copyTerminalSelection');
  assert.equal(copy('session-id', 'Saída selecionada'), true);
  assert.deepEqual(f.copied, ['Saída selecionada']);
  for (const value of ['', '\0', 'a'.repeat(65537), null]) assert.throws(() => copy('session-id', value), /64 KB/);
  assert.throws(() => copy('foreign-session', 'text'), /Sessão/);
  f.setWorkspace('/other'); assert.throws(() => copy('session-id', 'text'), /workspace/);
  assert.equal(f.copied.length, 1);
});
