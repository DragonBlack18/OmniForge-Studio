import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { installProjectTaskIpc } = createRequire(import.meta.url)('../electron/modules/task-ipc.cjs');

function fixture({ onPrepare = () => {}, onDialog = () => {}, response = () => 1 } = {}) {
  const handlers = new Map(), dialogs = [];
  let finished = 0;
  const controller = installProjectTaskIpc({
    register: (name, handler) => handlers.set(name, handler),
    core: { assertTaskSelection: async () => {
      await onPrepare();
      return { id: 'verify', command: 'node check.cjs' };
    } },
    dialog: { showMessageBox: async (_window, options) => {
      dialogs.push(options);
      await onDialog();
      return { response: response() };
    } },
    getWorkspace: () => '/synthetic/workspace', getUserData: () => '/synthetic/profile',
    getWindow: () => ({}), isHostBusy: () => false,
    onFinished: () => { finished++; }
  });
  return { controller, dialogs, run: () => handlers.get('runProjectTask')('verify', 'a'.repeat(64)),
    get finished() { return finished; } };
}

test('npm host cancellation during manifest preparation prevents a native prompt or process', async () => {
  let release;
  const f = fixture({ onPrepare: () => new Promise(resolve => { release = resolve; }) });
  const run = f.run();
  while (!release) await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.controller.cancel(), true);
  release();
  assert.equal(await run, null);
  assert.equal(f.dialogs.length, 0);
  assert.equal(f.controller.snapshot(), null);
  assert.equal(f.controller.isActive(), false);
  assert.equal(f.finished, 1);
});

test('npm host cancellation invalidates late native consent and releases the next explicit request', async () => {
  let release, waiting = true;
  const f = fixture({ onDialog: () => waiting ? new Promise(resolve => { release = resolve; }) : undefined,
    response: () => waiting ? 1 : 0 });
  const run = f.run();
  while (!release) await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.controller.isPending(), true);
  assert.equal(f.controller.cancel(), true);
  release();
  assert.equal(await run, null);
  assert.equal(f.controller.snapshot(), null);
  assert.equal(f.controller.isActive(), false);
  waiting = false;
  assert.equal(await f.run(), null);
  assert.equal(f.dialogs.length, 2);
  assert.equal(f.controller.isActive(), false);
  assert.equal(f.finished, 2);
});
