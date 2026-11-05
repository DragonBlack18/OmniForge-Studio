import test from 'node:test';
import assert from 'node:assert/strict';
import {exampleFlow} from '../core/modules/automation/catalog.mjs';
import {createFlowSession} from '../src/modules/automation/flow-session-store.mjs';
import {createFlowRecoveryController} from '../src/modules/automation/flow-recovery-controller.mjs';
import {assertRecoverableFlow} from '../core/modules/automation/flow-recovery.mjs';

test('opening an unsaved example does not protect it until a persistent user edit',()=>{
  const store=createFlowSession(exampleFlow());
  store.replaceDocument(exampleFlow(),null,true,false);
  assert.equal(store.getSnapshot().flowDirty,true);
  assert.equal(store.getSnapshot().editEpoch,0);
  store.setSelectedId('inicio');
  assert.equal(store.getSnapshot().editEpoch,0);
  store.rename('Meu fluxo');
  assert.ok(store.getSnapshot().editEpoch>0);
});

test('restore is reversible, keeps original revision and invalidates old save leases',()=>{
  const original=exampleFlow(),store=createFlowSession(original);
  store.replaceDocument(original,'base');
  const oldSave=store.captureSaveToken();
  const restored={...structuredClone(original),name:'Fluxo recuperado'};
  store.restoreDocument(restored,'base');
  assert.equal(store.getSnapshot().graph.name,'Fluxo recuperado');
  assert.equal(store.getSnapshot().flowRevision,'base');
  assert.equal(store.getSnapshot().flowDirty,true);
  assert.equal(store.markSaved(oldSave,'obsolete'),false);
  assert.equal(store.getSnapshot().flowRevision,'base');
  assert.equal(store.undo(),true);
  assert.deepEqual(store.getSnapshot().graph,original);
  assert.equal(store.getSnapshot().flowDirty,false);
  assert.equal(store.redo(),true);
  assert.equal(store.getSnapshot().flowDirty,true);
});

test('restore does not erase existing reversible edits and refuses a mismatched revision',()=>{
  const store=createFlowSession(exampleFlow());
  store.replaceDocument(exampleFlow(),'base');
  store.rename('Edição anterior');
  const before=structuredClone(store.getSnapshot().graph);
  const restored={...exampleFlow(),name:'Recuperado'};
  assert.throws(()=>store.restoreDocument(restored,'wrong'),/divergente/);
  assert.deepEqual(store.getSnapshot().graph,before);
  store.restoreDocument(restored,'base');
  store.undo();assert.deepEqual(store.getSnapshot().graph,before);
  store.undo();assert.equal(store.getSnapshot().graph.name,exampleFlow().name);
});

test('recovery accepts the same 120-character names allowed by authoring',()=>{
  const store=createFlowSession(exampleFlow());
  store.rename('Á'.repeat(120));
  assert.doesNotThrow(()=>assertRecoverableFlow(store.getSnapshot().graph));
  assert.throws(()=>assertRecoverableFlow({...store.getSnapshot().graph,name:'a'.repeat(121)}));
});

test('restoring a checkpoint uses the same store; undo and redo are checkpointable without execution',async()=>{
  const original=exampleFlow(), restored={...structuredClone(original),name:'Recuperado'};
  let record={flow:restored,baseRevision:'base',sourceRevision:'base',draftRevision:'d1',savedAt:'2026-01-01'};
  let writes=0;const timers=[];
  const recovery=createFlowRecoveryController({
    async readFlowDraft(){return record;},
    async writeFlowDraft(root,flow,revision,expected){
      assert.equal(root,'workspace');assert.equal(revision,'base');assert.equal(expected,record?.draftRevision??null);
      writes++;record={flow:structuredClone(flow),baseRevision:revision,sourceRevision:revision,draftRevision:'d'+(writes+1),savedAt:'2026-01-02'};
      return {draftRevision:record.draftRevision,savedAt:record.savedAt};
    },
    async discardFlowDraft(){record=null;}
  },{setTimer:fn=>{timers.push(fn);return timers.length;},clearTimer(){}});
  const store=createFlowSession(original);
  store.replaceDocument(original,'base');
  await recovery.open('workspace');
  store.restoreDocument(await recovery.restore('base'),'base');
  const stage=()=>{const s=store.getSnapshot();recovery.stage('workspace',s.graph,s.flowRevision,s.flowDirty&&s.editEpoch>0);};
  stage();await recovery.flush();assert.equal(writes,0,'Identical restored content must not be written twice.');
  store.undo();stage();await recovery.flush();assert.equal(writes,0,'Clean original is not an unsaved checkpoint.');
  store.redo();store.rename('Recuperado e editado');stage();await recovery.flush();
  assert.equal(record.flow.name,'Recuperado e editado');
  assert.equal(store.getSnapshot().canUndo,true);
  recovery.close();
});

test('save after restoring keeps later edits dirty and undo resolves against the saved graph',()=>{
  const store=createFlowSession(exampleFlow());
  store.replaceDocument(exampleFlow(),'base');
  store.restoreDocument({...exampleFlow(),name:'Restaurado'},'base');
  const token=store.captureSaveToken();
  store.rename('Edição durante save');
  assert.equal(store.markSaved(token,'new-revision'),false);
  assert.equal(store.getSnapshot().flowRevision,'new-revision');
  store.undo();assert.equal(store.getSnapshot().graph.name,'Restaurado');
  assert.equal(store.getSnapshot().flowDirty,false);
  store.redo();assert.equal(store.getSnapshot().flowDirty,true);
});

test('mutation lock is bound to recovery for graph, toolbar, properties and rename routes',async()=>{
  const fs=await import('node:fs/promises');
  const shell=await fs.readFile('src/workbench/AppShell.jsx','utf8');
  assert.match(shell,/dirty:flowDirty && editEpoch>0/);
  assert.match(shell,/replaceDocument:restoreDocument/);
  assert.match(shell,/onConnect=\{onConnect\} locked=\{busy\|\|flowRecovery\.locked\}/);
  assert.match(shell,/busy=\{busy\|\|flowRecovery\.locked\} selected=/);
  assert.match(shell,/busy=\{busy\|\|flowRecovery\.locked\} tabRequest=/);
  assert.match(shell,/onRename=\{value=>\{if\(busy\|\|!flowEditAllowed\(\)\)return/);
});
