import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as host from '../core/host.mjs';
import { exampleFlow } from '../core/catalog.mjs';

test('Electron facade retains synchronous graph/catalogue and local scheduler contracts', () => {
  assert.ok(Object.keys(host.NODE_CATALOG).length >= 57);
  assert.equal(typeof host.LocalScheduleEngine, 'function');
  assert.equal(typeof host.EXAMPLE_EXTENSION, 'object');
  assert.equal(host.validateFlow(exampleFlow()).valid, true);
});

test('lazy facades return real workspace and CAD data without writing during reads', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'omni-core-host-'));
  t.after(() => fs.rm(dir,{recursive:true,force:true}));
  const document = await host.readFlowDocument(dir);
  assert.equal(document.revision, null);
  const cad = await host.loadCadDocument(dir);
  assert.equal(cad.revision, null);
  assert.equal((await host.listProjectFiles(dir)).length,0);
  assert.deepEqual(await fs.readdir(dir), []);
});

test('lazy IDE and Git operations retain fail-closed project semantics', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'omni-host-ide-'));
  t.after(() => fs.rm(dir,{recursive:true,force:true}));
  const created = await host.createWorkspaceFile(dir,'new.txt');
  assert.match(created.revision,/^[a-f0-9]{64}$/);
  const data = await host.readProjectFile(dir,'new.txt');
  assert.equal(data.content,'');
  const git = await host.gitWorkspaceStatus(dir);
  assert.equal(git.available,false);
});
