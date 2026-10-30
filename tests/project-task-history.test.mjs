import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  listProjectTaskHistory, recordProjectTaskHistory
} from '../core/modules/ide/project-task-history.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omni-task-history-'));
  const profile = path.join(root, 'profile');
  const first = path.join(root, 'first');
  const second = path.join(root, 'second');
  await Promise.all([fs.mkdir(profile), fs.mkdir(first), fs.mkdir(second)]);
  t.after(() => fs.rm(root, { recursive:true, force:true }));
  return { root, profile, first, second };
}
function completed(workspace, overrides = {}) {
  return {
    id:randomUUID(), name:'verify', status:'completed',
    workspace, command:'node secret-command.cjs',
    output:'TOKEN=very-secret-private-value',
    startedAt:'2026-10-30T12:00:00.000Z',
    finishedAt:'2026-10-30T12:00:01.235Z',
    exitCode:0, truncated:false, ...overrides
  };
}

test('history reads do not create profile files or change workspaces', async t => {
  const { profile, first } = await fixture(t);
  assert.deepEqual(await listProjectTaskHistory(profile, first), []);
  assert.deepEqual(await fs.readdir(profile), []);
  assert.deepEqual(await fs.readdir(first), []);
});

test('real atomic persistence only stores metadata, not logs, commands or raw workspace paths', async t => {
  const { profile, first } = await fixture(t);
  const task = completed(first);
  const saved = await recordProjectTaskHistory(profile, task);
  assert.equal(saved.id, task.id);
  assert.equal(saved.durationMs, 1235);
  assert.deepEqual(Object.keys(saved).sort(),
    ['durationMs','exitCode','finishedAt','id','name','startedAt','status','truncated'].sort());
  const [directory] = await fs.readdir(profile);
  assert.equal(directory,'project-task-history');
  const [filename] = await fs.readdir(path.join(profile, directory));
  assert.match(filename, /^[a-f0-9]{64}\.json$/);
  const body = await fs.readFile(path.join(profile, directory, filename), 'utf8');
  assert.doesNotMatch(body, /secret|command|TOKEN|workspace|stdout|stderr/i);
  assert.ok(!body.includes(first));
  assert.deepEqual(await listProjectTaskHistory(profile, first), [saved]);
  assert.deepEqual(await fs.readdir(first), []);
});

test('results are scoped per workspace and duplicate finish events are idempotent', async t => {
  const { profile, first, second } = await fixture(t);
  const a=completed(first);
  const b=completed(second,{name:'build'});
  await recordProjectTaskHistory(profile,a);
  await recordProjectTaskHistory(profile,a);
  await recordProjectTaskHistory(profile,b);
  assert.deepEqual((await listProjectTaskHistory(profile,first)).map(x=>x.id),[a.id]);
  assert.deepEqual((await listProjectTaskHistory(profile,second)).map(x=>x.id),[b.id]);
});

test('concurrent results remain consistent and older records are bounded to 60', async t => {
  const { profile, first } = await fixture(t);
  const runs=Array.from({length:68},()=>completed(first));
  // Parallel I/O completion order is intentionally nondeterministic.
  await Promise.all(runs.slice(0,30).map(item=>recordProjectTaskHistory(profile,item)));
  const concurrent=await listProjectTaskHistory(profile,first,{limit:60});
  assert.equal(concurrent.length,30);
  assert.deepEqual(new Set(concurrent.map(x=>x.id)),new Set(runs.slice(0,30).map(x=>x.id)));
  // Sequential finishes have a deterministic newest-first retention order.
  for(const item of runs.slice(30)) await recordProjectTaskHistory(profile,item);
  const items=await listProjectTaskHistory(profile,first,{limit:60});
  assert.equal(items.length,60);
  assert.equal(new Set(items.map(x=>x.id)).size,60);
  assert.deepEqual(items.slice(0,38).map(x=>x.id),runs.slice(30).reverse().map(x=>x.id));
  assert.ok(items.every(x=>runs.some(run=>run.id===x.id)));
  assert.equal((await listProjectTaskHistory(profile,first,{limit:3})).length,3);
  await assert.rejects(listProjectTaskHistory(profile,first,{limit:61}),/Limite/);
});

test('all real final states can be retained, nonfinal and invalid states are rejected',async t=>{
  const { profile, first }=await fixture(t);
  for (const status of ['completed','failed','cancelled','timeout','output-limit']) {
    const entry=await recordProjectTaskHistory(profile,completed(first,{
      status,exitCode:status==='completed'?0:null
    }));
    assert.equal(entry.status,status);
  }
  await assert.rejects(recordProjectTaskHistory(profile,completed(first,{status:'running'})),/inválido/);
  await assert.rejects(recordProjectTaskHistory(profile,completed(first,{name:'../bad'})),/inválido/);
  await assert.rejects(recordProjectTaskHistory(profile,completed(first,{finishedAt:'2026-10-30T11:00:00Z'})),/Datas/);
  assert.equal((await listProjectTaskHistory(profile,first)).length,5);
});

test('corrupt existing history fails closed and remains unchanged',async t=>{
  const { profile, first }=await fixture(t);
  await recordProjectTaskHistory(profile,completed(first));
  const target=path.join(profile,'project-task-history',
    (await fs.readdir(path.join(profile,'project-task-history')))[0]);
  const corrupt='{"schemaVersion":1,"records":[{"bad":"record"}]}';
  await fs.writeFile(target,corrupt);
  await assert.rejects(listProjectTaskHistory(profile,first),/Contrato/);
  await assert.rejects(recordProjectTaskHistory(profile,completed(first)),/Contrato/);
  assert.equal(await fs.readFile(target,'utf8'),corrupt);
});

test('symlinked history directory is rejected without writing to external locations',async t=>{
  const { profile, first, second }=await fixture(t);
  const directory=path.join(profile,'project-task-history');
  try {await fs.symlink(second,directory,'dir');}
  catch(error) {
    if(['EPERM','EACCES','ENOSYS'].includes(error.code))return t.skip('symlink blocked');
    throw error;
  }
  await assert.rejects(recordProjectTaskHistory(profile,completed(first)),/inseguro/);
  assert.deepEqual(await fs.readdir(second),[]);
});

test('invalid profile path is rejected before any write',async t=>{
  const { root, first }=await fixture(t);
  await assert.rejects(recordProjectTaskHistory('relative/profile',completed(first)),/Perfil/);
  await assert.rejects(recordProjectTaskHistory(path.join(root,'not-created'),completed(first)));
});
