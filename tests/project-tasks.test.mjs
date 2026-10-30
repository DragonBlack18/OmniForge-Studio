import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  listProjectTasks, assertTaskSelection, findNpmToolchain, LocalProjectTaskRunner
} from '../core/modules/ide/project-tasks.mjs';

async function fixture(t, scripts = {}) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'omni-project-tasks-'));
  t.after(() => fs.rm(workspace, { recursive:true, force:true }));
  const packageText = JSON.stringify({ name:'test-project', version:'1.0.0', scripts }, null, 2);
  await fs.writeFile(path.join(workspace,'package.json'),packageText);
  return workspace;
}
function awaitFinished(runner, args) {
  let resolveDone;
  const done = new Promise(resolve => {resolveDone=resolve;});
  return runner.start({...args, onEvent: event => {
    if(event.type === 'finished') resolveDone(event.task);
  }}).then(started => ({started,done}));
}
test('scan real npm scripts without side effects; allow only bounded script names', async t => {
  const root = await fixture(t, {
    verify:'node check.cjs',
    'build:win':'node build.cjs',
    'invalid name':'echo reject',
    invalid:'a'.repeat(2000),
    preinstall:'node install.cjs'
  });
  const data = await listProjectTasks(root);
  assert.equal(data.available,true);
  assert.equal(data.packageName,'test-project');
  assert.deepEqual(data.scripts.map(s=>s.id), ['verify','build:win']);
  assert.match(data.revision, /^[a-f0-9]{64}$/);
  assert.deepEqual((await fs.readdir(root)).sort(), ['package.json']);
});
test('missing or invalid package.json fails safe and never creates a manifest', async t => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(),'omni-no-manifest-'));
  t.after(()=>fs.rm(folder,{recursive:true,force:true}));
  assert.equal((await listProjectTasks(folder)).available,false);
  assert.deepEqual(await fs.readdir(folder),[]);
  await fs.writeFile(path.join(folder,'package.json'),'{ broken');
  await assert.rejects(listProjectTasks(folder), /JSON UTF-8/);
});
test('preflight pins exact package revision and rejects stale or fabricated selections', async t => {
  const root = await fixture(t,{verify:'node check.cjs'});
  const {revision} = await listProjectTasks(root);
  assert.equal((await assertTaskSelection(root,'verify',revision)).id,'verify');
  await assert.rejects(assertTaskSelection(root,'../out',revision),/Seleção/);
  await assert.rejects(assertTaskSelection(root,'missing',revision),/não existe/);
  await fs.writeFile(path.join(root,'package.json'),'{"scripts":{"verify":"node updated.cjs"}}');
  await assert.rejects(assertTaskSelection(root,'verify',revision),/mudou/);
});
test('manifest symlink is rejected without reading external source', async t => {
  const root=await fixture(t,{verify:'node check.cjs'});
  const external=await fs.mkdtemp(path.join(os.tmpdir(),'omni-script-outside-'));
  t.after(()=>fs.rm(external,{recursive:true,force:true}));
  const outside=path.join(external,'external.json');
  await fs.writeFile(outside,'{"scripts":{"sensitive":"echo outside"}}');
  await fs.rm(path.join(root,'package.json'));
  try { await fs.symlink(outside,path.join(root,'package.json')); }
  catch(err){if(err.code==='EPERM')return t.skip('Windows runner disallows symlinks');throw err;}
  await assert.rejects(listProjectTasks(root),/Manifesto inválido/);
});
test('CLI toolchain uses node executable with npm JS, without cmd/bat shell invocation', async () => {
  const found=await findNpmToolchain();
  assert.match(path.basename(found.node),/^node(?:\.exe)?$/i);
  assert.equal(path.basename(found.npmCli),'npm-cli.js');
  assert.ok((await fs.stat(found.npmCli)).isFile());
});
test('real npm run emits live output, writes real artifact and skips implicit pre/post hooks', async t => {
  const workspace=await fixture(t,{verify:'node check.cjs', preverify:'node hook.cjs', postverify:'node hook.cjs'});
  await fs.writeFile(path.join(workspace,'check.cjs'),
    "const fs=require('node:fs');fs.writeFileSync('artifact.txt','REAL');console.log('TASK_REAL_PASS');");
  await fs.writeFile(path.join(workspace,'hook.cjs'),
    "require('node:fs').writeFileSync('implicit-hook.txt','UNEXPECTED');");
  const {revision}=await listProjectTasks(workspace);
  const runner=new LocalProjectTaskRunner();
  t.after(()=>runner.cancel());
  const {started,done}=await awaitFinished(runner,{workspace,id:'verify',revision});
  assert.equal(started.status,'running');
  const completed=await done;
  assert.equal(completed.status,'completed');
  assert.equal(completed.exitCode,0);
  assert.match(completed.output,/TASK_REAL_PASS/);
  assert.equal(await fs.readFile(path.join(workspace,'artifact.txt'),'utf8'),'REAL');
  await assert.rejects(fs.stat(path.join(workspace,'implicit-hook.txt')),{code:'ENOENT'});
});
test('failing npm script produces FAIL state, not a success banner', async t => {
  const workspace=await fixture(t,{fail:'node non-existing-file.cjs'});
  const runner=new LocalProjectTaskRunner();
  const {revision}=await listProjectTasks(workspace);
  const {done}=await awaitFinished(runner,{workspace,id:'fail',revision});
  const result=await done;
  assert.equal(result.status,'failed');
  assert.notEqual(result.exitCode,0);
});
test('duplicate runs cannot begin and a running script can be cancelled', async t => {
  const workspace=await fixture(t,{hold:'node hang.cjs'});
  await fs.writeFile(path.join(workspace,'hang.cjs'),"console.log('RUNNING');setInterval(()=>{},500)");
  const runner=new LocalProjectTaskRunner({timeoutMs:10000});
  t.after(()=>runner.cancel());
  const {revision}=await listProjectTasks(workspace);
  const {done}=await awaitFinished(runner,{workspace,id:'hold',revision});
  assert.equal(runner.isRunning,true);
  await assert.rejects(runner.start({workspace,id:'hold',revision}),/Outra tarefa/);
  assert.equal(runner.cancel(),true);
  assert.equal(runner.cancel(),true); // second cancel is harmless
  const end=await done;
  assert.equal(end.status,'cancelled');
  assert.equal(runner.isRunning,false);
});
test('long-running task times out and releases its execution slot', async t => {
  const workspace=await fixture(t,{hold:'node hang.cjs'});
  await fs.writeFile(path.join(workspace,'hang.cjs'),"setInterval(()=>{},500)");
  const runner=new LocalProjectTaskRunner({timeoutMs:180});
  t.after(()=>runner.cancel());
  const {revision}=await listProjectTasks(workspace);
  const {done}=await awaitFinished(runner,{workspace,id:'hold',revision});
  const end=await done;
  assert.equal(end.status,'timeout');
  assert.equal(runner.isRunning,false);
});
test('toolchain unavailable fails without starting subprocess or changing workspace', async t => {
  const workspace=await fixture(t,{verify:'node file.cjs'});
  const runner=new LocalProjectTaskRunner({resolveToolchain:async()=>{throw Error('No Node available');}});
  const {revision}=await listProjectTasks(workspace);
  await assert.rejects(runner.start({workspace,id:'verify',revision}),/No Node available/);
  assert.equal(runner.snapshot(),null);
  assert.deepEqual(await fs.readdir(workspace),['package.json']);
});
