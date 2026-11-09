import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { nodeDatabaseProcess } from '../core/modules/database/database-session.mjs';
const require = createRequire(import.meta.url);
const { installDatabaseIpc } = require('../electron/modules/database-ipc.cjs');

async function fixture(t) {
  // Native getWorkspace() returns project.path after realpath. Windows TEMP may
  // contain an 8.3 alias or different casing; the fixture must honor that contract.
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'omni-sqlite-ipc-')));
  let workspace = root, response = 1, hook = () => {}, hostBusy = false;
  const handlers = new Map(), events = [], dialogs = [], copied = [];
  const controller = installDatabaseIpc({ register: (name, callback) => handlers.set(name, callback),
    getWorkspace: () => workspace, getWindow: () => ({ isDestroyed: () => false,
      webContents: { isDestroyed: () => false, send: (channel, event) => events.push({ channel, event }) } }),
    isHostBusy: () => hostBusy, spawnProcess: nodeDatabaseProcess,
    clipboard: { writeText: (text, type) => copied.push({ text, type }) },
    dialog: { showMessageBox: async (_window, options) => { dialogs.push(options); await hook(options); return { response }; } }
  });
  t.after(async () => { controller.dispose(); await fs.rm(root, { recursive: true, force: true }); });
  const call = (name, ...args) => handlers.get(name)(...args);
  const request = sql => ({ ...controller.snapshot(), requestId: crypto.randomUUID(), sql, params: [] });
  return { root, controller, call, request, events, dialogs, copied,
    respond: value => { response = value; }, onDialog: value => { hook = value; },
    workspace: value => { workspace = value; }, busy: value => { hostBusy = value; } };
}

function holdConsent(fixture, t, timeoutMs = 5000) {
  let release, announce;
  const entered = new Promise(resolve => { announce = resolve; });
  fixture.onDialog(() => new Promise(resolve => { release = resolve; announce(); }));
  // An assertion failure must not leave the native consent fixture unresolved.
  t.after(() => release?.());
  return { release: () => release?.(), wait: async operation => {
    let timer;
    try {
      await Promise.race([
        entered,
        operation.then(() => { throw new Error('A operação terminou antes de abrir o consentimento esperado.'); }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Tempo excedido aguardando consentimento SQLite.')), timeoutMs); })
      ]);
    } finally { clearTimeout(timer); }
  } };
}

test('native approval pins source/revision and real SQL; decline leaves schema unchanged', async t => {
  const f = await fixture(t); await f.call('createDatabase');
  f.respond(0);
  assert.equal(await f.call('applyDatabaseSql', f.request('CREATE TABLE declined(x);')), null);
  assert.equal(f.controller.snapshot().schema.objects.length, 0);
  const prompt = f.dialogs[0];
  assert.equal(prompt.defaultId, 0); assert.equal(prompt.cancelId, 0);
  assert.match(prompt.detail, /CREATE TABLE declined/); assert.match(prompt.detail, /Revisão da sessão: 0/);
  f.respond(1);
  const result = await f.call('applyDatabaseSql', f.request('CREATE TABLE accepted(x); INSERT INTO accepted VALUES(9);'));
  assert.equal(result.changes, 1); assert.equal(result.state.revision, 1);
  assert.equal(f.events.at(-1).channel, 'omni:databaseEvent');
  assert.equal(f.controller.isActive(), false);
});

test('approval copies validated SQL and parameters, blocks duplicate requests and rejects host changes', async t => {
  const f = await fixture(t); await f.call('createDatabase');
  const consent = holdConsent(f, t);
  const source = f.request('CREATE TABLE approved(x);');
  const pending = f.call('applyDatabaseSql', source);
  await consent.wait(pending);
  assert.equal(f.controller.isPending(), true);
  await assert.rejects(f.call('queryDatabase', f.request('SELECT 1')), /Conclua a operação/);
  source.sql = 'CREATE TABLE replaced(x);'; source.params.push('changed');
  consent.release(); await pending;
  assert.equal(f.controller.snapshot().schema.objects[0].name, 'approved');
  f.onDialog(() => { f.busy(true); });
  await assert.rejects(f.call('applyDatabaseSql', f.request('CREATE TABLE blocked(x);')), /Outra operação/);
  assert.equal(f.controller.snapshot().schema.objects.length, 1);
});

test('cancel during native consent invalidates later approval without destroying accepted image', async t => {
  const f = await fixture(t); await f.call('createDatabase');
  await f.call('applyDatabaseSql', f.request('CREATE TABLE accepted(x);'));
  const consent = holdConsent(f, t);
  const pending = f.call('applyDatabaseSql', f.request('CREATE TABLE late(x);'));
  await consent.wait(pending);
  assert.equal(f.controller.cancel(), true); consent.release();
  assert.equal(await pending, null); assert.equal(f.controller.snapshot().schema.objects.length, 1);
  assert.equal(f.controller.hasUnsavedChanges(), true);
});

test('workspace change during consent rejects writes and clean reset works under host mutex', async t => {
  const f = await fixture(t); await f.call('createDatabase');
  f.onDialog(() => f.workspace(path.join(f.root, 'other')));
  await assert.rejects(f.call('applyDatabaseSql', f.request('CREATE TABLE wrong(x);')), /workspace mudou/);
  f.workspace(f.root); f.onDialog(() => {});
  await f.call('saveDatabaseCopy', { ...f.controller.snapshot(), relativePath: 'clean.sqlite' });
  f.busy(true);
  assert.equal(f.controller.reset(), true); assert.equal(f.controller.hasSession(), false);
});

test('save copy and dirty close each require consent; declining preserves memory and disk', async t => {
  const f = await fixture(t); await f.call('createDatabase');
  await f.call('applyDatabaseSql', f.request('CREATE TABLE t(x); INSERT INTO t VALUES(3);'));
  f.respond(0);
  assert.equal(await f.call('saveDatabaseCopy', { ...f.controller.snapshot(), relativePath: 'declined.sqlite' }), null);
  await assert.rejects(fs.stat(path.join(f.root, 'declined.sqlite')), { code: 'ENOENT' });
  assert.equal(await f.call('closeDatabase', f.controller.snapshot().sessionId), false);
  assert.equal(f.controller.hasUnsavedChanges(), true);
  f.respond(1);
  const result = await f.call('saveDatabaseCopy', { ...f.controller.snapshot(), relativePath: 'accepted.sqlite' });
  assert.equal(result.state.dirty, false); assert.equal(f.controller.isSaving(), false);
  assert.match(f.dialogs.at(-1).detail, /Novo arquivo: accepted.sqlite/);
  await assert.rejects(f.call('saveDatabaseCopy', { ...f.controller.snapshot(), relativePath: 'accepted.sqlite' }), /destino já existe/);
  assert.equal(await f.call('closeDatabase', f.controller.snapshot().sessionId), true);
  await f.call('openDatabase', 'accepted.sqlite');
  assert.equal((await f.call('queryDatabase', f.request('SELECT x FROM t'))).result.rows[0][0].value, '3');
});

test('disposed host cannot create a session after a pending initialization import', async t => {
  const f = await fixture(t);
  const creating = f.call('createDatabase');
  f.controller.dispose();
  assert.equal(await creating, null); assert.equal(f.controller.hasSession(), false);
});

test('native result clipboard requires current session/workspace and bounded plain text', async t => {
  const f = await fixture(t); await f.call('createDatabase');
  const id = f.controller.snapshot().sessionId, text = '{"rows":[[{"type":"integer","value":"9223372036854775807"}]]}';
  assert.equal(f.call('copyDatabaseResult', id, text), true);
  assert.deepEqual(f.copied, [{ text, type: 'clipboard' }]);
  assert.throws(() => f.call('copyDatabaseResult', 'other', text), /sessão SQLite mudou/);
  for (const invalid of [null, {}, 'a\0b', 'x'.repeat(2 * 1024 * 1024 + 1)]) {
    assert.throws(() => f.call('copyDatabaseResult', id, invalid), /inválido|2 MiB/);
  }
  f.workspace('/other'); assert.throws(() => f.call('copyDatabaseResult', id, text), /outro workspace/);
  assert.equal(f.copied.length, 1);
});

test('consent fixture observes rejection before the dialog and bounds an absent dialog', async t => {
  const consent = holdConsent({ onDialog() {} }, t, 40);
  const failure = new Error('Rejected before native consent');
  await assert.rejects(consent.wait(Promise.reject(failure)), error => error === failure);
  await assert.rejects(consent.wait(Promise.resolve()), /terminou antes de abrir/);
  await assert.rejects(consent.wait(new Promise(() => {})), /Tempo excedido aguardando consentimento/);
});
