import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileDatabaseBootstrap } from '../src/modules/database/database-bootstrap.mjs';

const fulfilled = value => ({ status: 'fulfilled', value });
const failed = message => ({ status: 'rejected', reason: new Error(message) });
const state = { workspace: '/project', sessionId: 'session', revision: 3, dirty: true, sequence: 8 };

test('catalog read failure preserves native dirty session and buffered newer completion', () => {
  const latest = { ...state, revision: 4, sequence: 10 };
  const restored = reconcileDatabaseBootstrap('/project', fulfilled(state), failed('permission denied'), [
    { state: latest }, { state: { ...state, sequence: 9 } }
  ]);
  assert.deepEqual(restored.state, latest); assert.equal(restored.state.dirty, true);
  assert.equal(restored.catalog, null); assert.match(restored.error, /listar os bancos.*permission denied/);
});

test('state read failure can recover from a buffered native event without hiding catalog', () => {
  const catalog = { workspace: '/project', files: [] };
  const restored = reconcileDatabaseBootstrap('/project', failed('IPC failed'), fulfilled(catalog), [{ state }]);
  assert.deepEqual(restored.state, state); assert.deepEqual(restored.catalog, catalog);
  assert.match(restored.error, /ler a sessão SQLite/);
});

test('bootstrap ignores snapshots from another workspace and honors a buffered close', () => {
  assert.equal(reconcileDatabaseBootstrap('/other', fulfilled(state), fulfilled({ workspace: '/project' }), []).state, null);
  assert.equal(reconcileDatabaseBootstrap('/project', fulfilled(state), failed('offline'), [{ state: null }]).state, null);
});
