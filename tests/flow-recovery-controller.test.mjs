import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlowRecoveryController } from '../src/modules/automation/flow-recovery-controller.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const flow=name=>({schemaVersion:1,name,nodes:[],edges:[]});
function setup(api={}) {
  let callback=null,sequence=0;const writes=[],deletes=[];
  const controller=createFlowRecoveryController({readFlowDraft:async()=>null,
    writeFlowDraft:async(root,doc,base,token)=>{writes.push({root,doc,base,token});return {draftRevision:'token'+(++sequence),savedAt:'now'};},
    discardFlowDraft:async(root,token)=>deletes.push({root,token}),...api},
    {setTimer:fn=>{callback=fn;return 1;},clearTimer:()=>{callback=null;}});
  return {controller,writes,deletes,fire:()=>{const fn=callback;callback=null;fn?.();}};
}

test('checkpoint updates coalesce and selection-only/no-dirty state does not write',async()=>{
  const {controller:c,writes}=setup();await c.open('/a');
  c.stage('/a',flow('initial'),null,false);await c.flush();assert.equal(writes.length,0);
  c.stage('/a',flow('one'),null,true);c.stage('/a',flow('two'),null,true);await c.flush();
  assert.equal(writes.length,1);assert.equal(writes[0].doc.name,'two');
  c.stage('/a',flow('two'),null,true);await c.flush();assert.equal(writes.length,1);
  c.stage('/a',flow('three'),null,true);await c.flush();assert.equal(writes[1].token,'token1');
  c.close();
});

test('out-of-order opens of same root cannot replace a newer session',async()=>{
  const older=deferred();let n=0;
  const {controller:c}=setup({readFlowDraft:()=>++n===1?older.promise:Promise.resolve(null)});
  const first=c.open('/a');await c.open('/a');older.resolve({draftRevision:'old',flow:flow('obsolete')});await first;
  assert.equal(c.getSnapshot().draft,null);assert.equal(c.getSnapshot().phase,'ready');c.close();
});

test('old workspace writes and timers cannot affect new workspace state',async()=>{
  const delayed=deferred(),entered=deferred();const calls=[];
  const {controller:c}=setup({writeFlowDraft:async(root)=>{calls.push(root);entered.resolve();return delayed.promise;}});
  await c.open('/a');c.stage('/a',flow('A'),null,true);const pending=c.flush();
  await entered.promise;await c.open('/b');delayed.resolve({draftRevision:'old',savedAt:'past'});await pending;
  assert.deepEqual(calls,['/a']);assert.equal(c.getSnapshot().savedAt,null);assert.equal(c.getSnapshot().phase,'ready');c.close();
});

test('save drains in-flight checkpoint token, deletes only that token and stages fresh revision',async()=>{
  const delayed=deferred();let first=true;const writes=[],deleted=[];
  const {controller:c}=setup({writeFlowDraft:async(root,doc,base,token)=>{
    writes.push({doc,base,token});if(first){first=false;return delayed.promise;}return {draftRevision:'new',savedAt:'later'};},
    discardFlowDraft:async(root,token)=>deleted.push(token)});
  await c.open('/a');c.stage('/a',flow('before'),null,true);
  const save=c.beforeSave();await Promise.resolve();c.stage('/a',flow('during'),'saved-revision',true);
  delayed.resolve({draftRevision:'in-flight',savedAt:'now'});const lease=await save;
  await c.afterSave(lease,true);assert.deepEqual(deleted,['in-flight']);assert.equal(writes.length,1);
  c.stage('/a',flow('during'),'saved-revision',true);await c.flush();
  assert.equal(writes[1].base,'saved-revision');assert.equal(writes[1].doc.name,'during');assert.equal(writes[1].token,null);c.close();
});

test('failed original save retains checkpoint; failed protection does not disable manual saving',async()=>{
  const {controller:c,deletes}=setup();await c.open('/a');c.stage('/a',flow('A'),null,true);
  const lease=await c.beforeSave();await c.afterSave(lease,false);assert.equal(deletes.length,0);c.close();
  const {controller:d}=setup({writeFlowDraft:async()=>{throw new Error('unavailable');}});
  await d.open('/a');d.stage('/a',flow('B'),null,true);const token=await d.beforeSave();
  assert.ok(token);await d.afterSave(token,true);assert.match(d.getSnapshot().error,/unavailable/);d.close();
});

test('restoration rechecks disk revision and does not discard or execute a pending draft',async()=>{
  const draft={flow:flow('recover'),baseRevision:'a',sourceRevision:'a',draftRevision:'one'};let changed=false;
  const {controller:c,writes,deletes}=setup({readFlowDraft:async()=>({...draft,sourceRevision:changed?'b':'a'})});
  await c.open('/a');c.stage('/a',flow('original'),'a',true);await c.flush();assert.equal(writes.length,0);
  changed=true;await assert.rejects(c.restore('a'),/disco mudou/);assert.ok(c.getSnapshot().draft);
  changed=false;assert.deepEqual(await c.restore('a'),draft.flow);assert.equal(c.getSnapshot().draft,null);
  assert.equal(deletes.length,0);c.close();
});

test('late discard, cleanup failure and unmount never reset a different workspace',async()=>{
  const wait=deferred();let draft={draftRevision:'one',flow:flow('A'),baseRevision:null};
  const {controller:c}=setup({readFlowDraft:async()=>draft,discardFlowDraft:()=>wait.promise});
  await c.open('/a');const done=c.discard();draft=null;await c.open('/b');wait.resolve(true);await done;
  assert.equal(c.getSnapshot().phase,'ready');assert.equal(c.getSnapshot().draft,null);c.close();
});
