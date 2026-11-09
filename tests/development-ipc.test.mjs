import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { installDevelopmentIpc } = require('../electron/modules/development-ipc.cjs');

function setup({ response = 1, onDialog = () => {}, onPrepare = () => {}, busy = () => false } = {}) {
  const handlers = new Map(), calls = [], events = [];
  let workspace = '/workspace/project';
  class Runner {
    isRunning = false;
    state = null;
    snapshot() { return this.state; }
    async start(input) {
      calls.push(input); this.isRunning = true;
      this.state = { id: 'run-id', workspace: input.workspace, status: 'running' };
      input.onEvent({ type: 'started', task: this.state });
      return this.state;
    }
    cancel() { this.isRunning = false; return true; }
  }
  const core = {
    listDevelopmentTargets: async root => ({ workspace: root, targets: [] }),
    prepareDevelopmentTask: async (root, request) => {
      await onPrepare();
      return { ...request, args: [...request.args], workspace: root,
        executable: '/usr/bin/node', canonicalExecutable: '/usr/bin/node', runtime: 'node' };
    },
    LocalDevelopmentRunner: Runner
  };
  const window = { isDestroyed: () => false, webContents: { isDestroyed: () => false,
    send: (channel, event) => events.push({ channel, event }) } };
  const controller = installDevelopmentIpc({ register: (name, handler) => handlers.set(name, handler),
    dialog: { showMessageBox: async (_window, options) => { await onDialog(options); return { response }; } },
    core, getWorkspace: () => workspace, getWindow: () => window, isHostBusy: busy });
  return { handlers, calls, events, controller, setWorkspace: value => { workspace = value; } };
}
const request = () => ({ path: 'main.js', revision: 'a'.repeat(64), action: 'run', args: ['two words'] });

test('native development approval names exact source revision, interpreter and arguments', async () => {
  let dialog;
  const fixture = setup({ onDialog: options => { dialog = options; } });
  const result = await fixture.handlers.get('runDevelopmentTask')(request());
  assert.equal(result.status, 'running');
  assert.equal(dialog.defaultId, 0);
  assert.equal(dialog.cancelId, 0);
  assert.match(dialog.detail, /main\.js/);
  assert.match(dialog.detail, /a{64}/);
  assert.match(dialog.detail, /\/usr\/bin\/node/);
  assert.match(dialog.detail, /two words/);
  assert.equal(fixture.calls[0].approvedExecutable, '/usr/bin/node');
  assert.equal(fixture.events[0].channel, 'omni:developmentEvent');
});

test('native cancellation never starts a process and releases operation gate', async () => {
  const fixture = setup({ response: 0 });
  assert.equal(await fixture.handlers.get('runDevelopmentTask')(request()), null);
  assert.equal(fixture.calls.length, 0);
  assert.equal(fixture.controller.isActive(), false);
});

test('pending native consent locks duplicate requests and blocks workspace changes', async () => {
  let finishDialog;
  const fixture = setup({ onDialog: () => new Promise(resolve => { finishDialog = resolve; }) });
  const running = fixture.handlers.get('runDevelopmentTask')(request());
  while (!finishDialog) await new Promise(resolve => setImmediate(resolve));
  assert.equal(fixture.controller.isPending(), true);
  await assert.rejects(fixture.handlers.get('runDevelopmentTask')(request()), /Conclua a operação/);
  fixture.setWorkspace('/different');
  finishDialog();
  await assert.rejects(running, /workspace mudou/);
  assert.equal(fixture.calls.length, 0);
  assert.equal(fixture.controller.isActive(), false);
});

test('host busy rejects execution, even when it changes during the native dialog', async () => {
  const blocked = setup({ busy: () => true });
  await assert.rejects(blocked.handlers.get('runDevelopmentTask')(request()), /Conclua a operação/);
  let hostBusy = false;
  const race = setup({ busy: () => hostBusy, onDialog: () => { hostBusy = true; } });
  await assert.rejects(race.handlers.get('runDevelopmentTask')(request()), /outra operação/);
  assert.equal(race.calls.length, 0);
});

test('approved request is isolated from input mutation and cancellation needs the active id', async () => {
  const source = request();
  const fixture = setup({ onDialog: () => { source.path = 'other.js'; source.args.push('changed'); } });
  await fixture.handlers.get('runDevelopmentTask')(source);
  assert.equal(fixture.calls[0].request.path, 'main.js');
  assert.deepEqual(fixture.calls[0].request.args, ['two words']);
  assert.equal(fixture.handlers.get('cancelDevelopmentTask')('wrong'), false);
  assert.equal(fixture.handlers.get('cancelDevelopmentTask')('run-id'), true);
});

test('host cancellation during discovery prevents a later consent dialog', async () => {
  let finishPrepare, dialogs = 0;
  const fixture = setup({
    onPrepare: () => new Promise(resolve => { finishPrepare = resolve; }),
    onDialog: () => { dialogs++; }
  });
  const running = fixture.handlers.get('runDevelopmentTask')(request());
  while (!finishPrepare) await new Promise(resolve => setImmediate(resolve));
  assert.equal(fixture.controller.cancel(), true);
  finishPrepare();
  assert.equal(await running, null);
  assert.equal(dialogs, 0);
  assert.equal(fixture.calls.length, 0);
  assert.equal(fixture.controller.isActive(), false);
});

test('host cancellation invalidates late native approval and allows a new deliberate request', async () => {
  let finishDialog, shouldWait = true;
  const fixture = setup({ onDialog: () => shouldWait ?
    new Promise(resolve => { finishDialog = resolve; }) : undefined });
  const running = fixture.handlers.get('runDevelopmentTask')(request());
  while (!finishDialog) await new Promise(resolve => setImmediate(resolve));
  assert.equal(fixture.controller.cancel(), true);
  assert.equal(fixture.controller.isPending(), true);
  finishDialog();
  assert.equal(await running, null);
  assert.equal(fixture.calls.length, 0);
  assert.equal(fixture.controller.isActive(), false);
  shouldWait = false;
  assert.equal((await fixture.handlers.get('runDevelopmentTask')(request())).status, 'running');
  assert.equal(fixture.calls.length, 1);
});
