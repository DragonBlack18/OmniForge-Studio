import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { createCloseController } = createRequire(import.meta.url)('../electron/security/close-controller.cjs');
const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture(initial = {unsaved:true}) {
  const state={...initial}, jobs=[], prompts=[], events=[];
  let alive=true, quits=0, flowCancels=0, taskCancels=0, toolCancels=0;
  const controller=createCloseController({getState:()=>state,isAlive:()=>alive,
    prompt:options=>new Promise((resolve,reject)=>prompts.push({options,resolve,reject})),
    quit:()=>{quits++;},cancelFlow:()=>{flowCancels++;},cancelTask:()=>{taskCancels++;},cancelTools:()=>{toolCancels++;},
    defer:fn=>jobs.push(fn),record:code=>events.push(code)});
  return {controller,state,jobs,prompts,events,
    request(){let prevented=false;controller.handleClose({preventDefault(){prevented=true;}});return prevented;},
    run(){while(jobs.length)jobs.shift()();}, kill(){alive=false;controller.dispose();},
    get quits(){return quits;},get flowCancels(){return flowCancels;},get taskCancels(){return taskCancels;},get toolCancels(){return toolCancels;}};
}
test('clean window closes once and rejects new work before closed',()=>{
  const f=fixture({});assert.equal(f.request(),false);assert.equal(f.controller.isBusy(),true);
  assert.equal(f.prompts.length,0);f.kill();assert.equal(f.controller.isBusy(),false);
});
test('close prompt is reentrancy-safe, cancellation releases gate, approval defers quit',async()=>{
  const f=fixture();assert.equal(f.request(),true);assert.equal(f.request(),true);await settle();
  assert.equal(f.prompts.length,1);f.prompts[0].resolve({response:0});await settle();
  assert.equal(f.controller.isBusy(),false);assert.equal(f.quits,0);
  f.request();await settle();f.prompts[1].resolve({response:1});await settle();
  assert.equal(f.quits,0);assert.equal(f.jobs.length,1);f.run();assert.equal(f.quits,1);
  assert.equal(f.request(),false);
});
test('native commits and pending consent cannot be overridden by exit approval',async()=>{
  for(const key of ['save','cad','registry','schedulePrompt','taskPrompt','diagnosticExport','terminalPrompt','databasePrompt','databaseSave']){
    const f=fixture({[key]:true});f.request();await settle();
    assert.equal(f.prompts[0].options.buttons.length,1,key);
    f.prompts[0].resolve({response:1});await settle();f.run();
    assert.equal(f.quits,0,key);assert.equal(f.controller.isBusy(),false,key);
  }
});
test('late exit consent rechecks native writes instead of trusting the original state',async()=>{
  const f=fixture();f.request();await settle();f.state.save=true;
  f.prompts[0].resolve({response:1});await settle();f.run();
  assert.equal(f.quits,0);assert.equal(f.controller.isBusy(),false);
  assert.ok(f.events.includes('close-blocked'));
});
test('confirmed exit drains flow and task history before a single deferred quit',async()=>{
  const f=fixture({execution:true,task:true});f.request();await settle();
  f.prompts[0].resolve({response:1});await settle();
  assert.equal(f.flowCancels,1);assert.equal(f.taskCancels,1);assert.equal(f.quits,0);
  f.state.execution=false;f.controller.workFinished();f.run();assert.equal(f.quits,0);
  f.state.task=false;f.controller.workFinished();f.controller.workFinished();
  assert.equal(f.jobs.length,1);f.run();assert.equal(f.quits,1);
});
test('disposing a window invalidates late dialogs and queued approvals',async()=>{
  const a=fixture();a.request();await settle();a.kill();a.prompts[0].resolve({response:1});await settle();a.run();assert.equal(a.quits,0);
  const b=fixture();b.request();await settle();b.prompts[0].resolve({response:1});await settle();b.kill();b.run();assert.equal(b.quits,0);
});
test('exit waits for terminal process and database work while cancellation preserves unsaved data until exit',async()=>{
  const f=fixture({terminal:true,databaseWork:true,unsaved:true});
  assert.equal(f.request(),true);await settle();
  f.prompts[0].resolve({response:1});await settle();
  assert.equal(f.toolCancels,1);assert.equal(f.quits,0);
  f.state.terminal=false;f.controller.workFinished();f.run();assert.equal(f.quits,0);
  f.state.databaseWork=false;f.controller.workFinished();f.run();assert.equal(f.quits,1);
});
test('native dialog rejection does not leave the desktop stuck closing',async()=>{
  const f=fixture();f.request();await settle();f.prompts[0].reject(Error('test only'));await settle();
  assert.equal(f.controller.isBusy(),false);assert.ok(f.events.includes('close-error'));
  assert.equal(f.request(),true);
});
