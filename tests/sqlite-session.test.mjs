import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSession } from '../core/modules/database/database-session.mjs';
import { executeDatabaseJob } from '../core/modules/database/database-engine.mjs';
import { databasePath, listDatabaseFiles, readDatabaseSnapshot, saveDatabaseSnapshotCopy } from '../core/modules/database/database-files.mjs';

const huge = 'WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<1000000000) SELECT sum(x) FROM n';
const request = (session, sql, extra = {}) => ({ ...session.snapshot(), requestId: crypto.randomUUID(), sql, params: [], ...extra });
async function fixture(t, options) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omni-sqlite-test-'));
  const session = new DatabaseSession(options);
  t.after(async () => { session.dispose(); await fs.rm(root, { recursive: true, force: true }); });
  return { root, session };
}
const scalar = async (session, sql) => (await session.execute(request(session, sql))).result.rows[0][0].value;

test('snapshot create, transaction, exclusive save, reopen and dirty state use actual subprocess SQLite', async t => {
  const { root, session } = await fixture(t);
  const blank = await session.create(root);
  assert.equal(blank.dirty, true); assert.equal(blank.schema.objects.length, 0);
  await session.execute(request(session, "CREATE TABLE notes(id INTEGER PRIMARY KEY, text TEXT); INSERT INTO notes(text) VALUES ('first');"), 'apply');
  assert.equal(await scalar(session, 'SELECT text FROM notes'), 'first');
  const copy = await session.saveCopy({ ...session.snapshot(), relativePath: 'notes.sqlite' });
  assert.equal(copy.state.dirty, false); assert.equal(copy.state.lastSavedCopy, 'notes.sqlite');
  assert.equal((await fs.readFile(path.join(root, 'notes.sqlite'))).subarray(0, 16).toString(), 'SQLite format 3\0');
  session.reset(); await session.open(root, 'notes.sqlite');
  assert.equal(session.snapshot().sourcePath, 'notes.sqlite'); assert.equal(await scalar(session, 'SELECT COUNT(*) FROM notes'), '1');
});

test('failed atomic scripts preserve earlier unsaved edits and the exact accepted revision', async t => {
  const { root, session } = await fixture(t); await session.create(root);
  await session.execute(request(session, 'CREATE TABLE t(x UNIQUE); INSERT INTO t VALUES(1);'), 'apply');
  const before = session.snapshot();
  await assert.rejects(session.execute(request(session, 'INSERT INTO t VALUES(2); INSERT INTO t VALUES(1);'), 'apply'), /UNIQUE/);
  assert.deepEqual(session.snapshot().schema, before.schema); assert.equal(session.snapshot().revision, before.revision);
  assert.equal(session.hasUnsavedChanges, true); assert.equal(await scalar(session, 'SELECT COUNT(*) FROM t'), '1');
});

test('cancellation kills native computation while preserving previous snapshot and rejecting stale IDs', async t => {
  const { root, session } = await fixture(t); await session.create(root);
  await session.execute(request(session, 'CREATE TABLE t(x); INSERT INTO t VALUES(7);'), 'apply');
  const before = session.snapshot();
  const operation = request(session, 'INSERT INTO t VALUES(8); INSERT INTO t ' + huge);
  const pending = session.execute(operation, 'apply');
  const rejection = assert.rejects(pending, error => error.code === 'SQLITE_CANCELLED');
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(session.cancel({ sessionId: before.sessionId, requestId: 'wrong' }), false);
  assert.equal(session.cancel(operation), true); await rejection;
  assert.equal(session.isActive, false); assert.equal(session.snapshot().revision, before.revision);
  assert.equal(await scalar(session, 'SELECT sum(x) FROM t'), '7');
});

test('hard timeout bounds a real long query, clears ownership and permits a subsequent query', async t => {
  const { root, session } = await fixture(t, { timeoutMs: 2500 }); await session.create(root);
  const started = Date.now();
  await assert.rejects(session.execute(request(session, huge)), error => error.code === 'SQLITE_TIMEOUT');
  assert.ok(Date.now() - started < 6000);
  assert.equal(session.isActive, false); assert.equal(await scalar(session, 'SELECT 42'), '42');
});

test('stale revision, concurrent operations, dirty reset and canceled initialization are rejected', async t => {
  const { root, session } = await fixture(t); await session.create(root);
  const stale = request(session, 'SELECT 1');
  await session.execute(request(session, 'CREATE TABLE t(x);'), 'apply');
  await assert.rejects(session.execute(stale), /sessão SQLite mudou/);
  assert.throws(() => session.reset(), /Salve uma cópia/);
  const pending = session.execute(request(session, huge));
  const rejection = assert.rejects(pending, /interrompida/);
  await assert.rejects(session.execute(request(session, 'SELECT 2')), /operação SQLite atual/);
  session.cancel(); await rejection; session.reset({ discard: true });
  const creating = session.create(root); const canceled = assert.rejects(creating, /interrompida/);
  assert.equal(session.cancel(), true); await canceled; assert.equal(session.hasSession, false);
});

test('source stays byte-identical; save-copy remains a snapshot if source changes externally', async t => {
  const { root, session } = await fixture(t); await session.create(root);
  await session.execute(request(session, 'CREATE TABLE t(x); INSERT INTO t VALUES(1);'), 'apply');
  await session.saveCopy({ ...session.snapshot(), relativePath: 'original.sqlite' }); session.reset();
  const original = await fs.readFile(path.join(root, 'original.sqlite'));
  await session.open(root, 'original.sqlite');
  await session.execute(request(session, 'INSERT INTO t VALUES(2);'), 'apply');
  assert.deepEqual(await fs.readFile(path.join(root, 'original.sqlite')), original);
  const external = executeDatabaseJob({ operation: 'apply', image: original, sql: 'INSERT INTO t VALUES(3);' }).image;
  await fs.writeFile(path.join(root, 'original.sqlite'), external);
  await assert.rejects(session.saveCopy({ ...session.snapshot(), relativePath: 'original.sqlite' }), /destino já existe/);
  await session.saveCopy({ ...session.snapshot(), relativePath: 'edited.sqlite' });
  assert.deepEqual(await fs.readFile(path.join(root, 'original.sqlite')), external);
  session.reset(); await session.open(root, 'edited.sqlite');
  assert.equal(await scalar(session, 'SELECT group_concat(x) FROM t'), '1,2');
});

test('exclusive creation, case-insensitive collisions, missing parent and path traversal do not overwrite', async t => {
  const { root, session } = await fixture(t); await session.create(root);
  await session.saveCopy({ ...session.snapshot(), relativePath: 'Case.sqlite' });
  const before = await fs.readFile(path.join(root, 'Case.sqlite'));
  for (const name of ['Case.sqlite', 'case.sqlite']) await assert.rejects(session.saveCopy({ ...session.snapshot(), relativePath: name }), /destino já existe/);
  await assert.rejects(session.saveCopy({ ...session.snapshot(), relativePath: 'missing/copy.sqlite' }), /ENOENT/);
  for (const name of ['../outside.sqlite', '/outside.sqlite', 'C:/outside.sqlite', 'data\\copy.sqlite', '.git/a.sqlite', 'CON.sqlite', 'x.sqlite:stream', 'x.txt']) {
    assert.throws(() => databasePath(name), /caminho|Caminho/);
  }
  assert.deepEqual(await fs.readFile(path.join(root, 'Case.sqlite')), before);
  const image = executeDatabaseJob({ operation: 'create' }).image;
  const race = await Promise.allSettled([saveDatabaseSnapshotCopy(root, 'race.sqlite', image), saveDatabaseSnapshotCopy(root, 'race.sqlite', image)]);
  assert.equal(race.filter(item => item.status === 'fulfilled').length, 1);
  assert.deepEqual(await fs.readFile(path.join(root, 'race.sqlite')), image);
});

test('WAL header, WAL/SHM/journal sidecars and invalid images are refused without deleting files', async t => {
  const { root } = await fixture(t);
  const image = executeDatabaseJob({ operation: 'create' }).image;
  await fs.writeFile(path.join(root, 'source.sqlite'), image);
  for (const suffix of ['-wal', '-shm', '-journal']) {
    const file = path.join(root, 'source.sqlite' + suffix); await fs.writeFile(file, 'present');
    await assert.rejects(readDatabaseSnapshot(root, 'source.sqlite'), /arquivo auxiliar/);
    assert.equal(await fs.readFile(file, 'utf8'), 'present'); await fs.unlink(file);
  }
  const wal = Buffer.from(image); wal[18] = 2; wal[19] = 2;
  await fs.writeFile(path.join(root, 'source.sqlite'), wal);
  await assert.rejects(readDatabaseSnapshot(root, 'source.sqlite'), /modo WAL/);
  await fs.writeFile(path.join(root, 'invalid.db'), 'not a database');
  await assert.rejects(readDatabaseSnapshot(root, 'invalid.db'), /Arquivo SQLite inválido/);
});

test('hard links and linked directories cannot act as SQLite source or destination', async t => {
  const { root } = await fixture(t);
  const image = executeDatabaseJob({ operation: 'create' }).image;
  await fs.writeFile(path.join(root, 'original.sqlite'), image);
  await fs.link(path.join(root, 'original.sqlite'), path.join(root, 'hard.sqlite'));
  await assert.rejects(readDatabaseSnapshot(root, 'hard.sqlite'), /sem links/);
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'omni-sqlite-outside-'));
  t.after(() => fs.rm(outside, { recursive: true, force: true }));
  await fs.writeFile(path.join(outside, 'source.sqlite'), image);
  await fs.symlink(outside, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(readDatabaseSnapshot(root, 'linked/source.sqlite'), /fora do projeto|vinculada/);
  await assert.rejects(saveDatabaseSnapshotCopy(root, 'linked/new.sqlite', image), /fora do projeto|vinculada/);
  await assert.rejects(fs.stat(path.join(outside, 'new.sqlite')), { code: 'ENOENT' });
});

test('file discovery is bounded and excludes generated, private and linked paths', async t => {
  const { root } = await fixture(t);
  await fs.mkdir(path.join(root, 'data')); await fs.mkdir(path.join(root, 'node_modules'));
  await fs.writeFile(path.join(root, 'data', 'visible.sqlite'), 'x');
  await fs.writeFile(path.join(root, 'node_modules', 'ignored.sqlite'), 'x');
  await fs.writeFile(path.join(root, '.private.sqlite'), 'x');
  const found = await listDatabaseFiles(root);
  assert.deepEqual(found.files.map(item => item.path), ['data/visible.sqlite']);
});

test('dispose is deferred through an exclusive save and cancellation never interrupts that write', async t => {
  const { root, session } = await fixture(t); await session.create(root);
  await session.execute(request(session, 'CREATE TABLE t(x); INSERT INTO t VALUES(42);'), 'apply');
  const pending = session.saveCopy({ ...session.snapshot(), relativePath: 'during-close.sqlite' });
  assert.equal(session.isSaving, true); assert.equal(session.cancel(), false);
  assert.equal(session.dispose(), false); assert.equal(session.hasSession, true);
  const saved = await pending;
  assert.equal(saved.copy.path, 'during-close.sqlite'); assert.equal(session.isSaving, false); assert.equal(session.hasSession, false);
  const snapshot = await readDatabaseSnapshot(root, 'during-close.sqlite');
  const actual = executeDatabaseJob({ operation: 'query', image: snapshot.image, sql: 'SELECT x FROM t' });
  assert.equal(actual.result.rows[0][0].value, '42');
});
