import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {createFlowSession} from '../src/modules/automation/flow-session-store.mjs';
import {createFlowRecoveryController} from '../src/modules/automation/flow-recovery-controller.mjs';
import {saveFlowSession,restoreFlowSession} from '../src/modules/automation/flow-session-recovery.mjs';
import {exampleFlow} from '../core/modules/automation/catalog.mjs';
import {WORKFLOW_TEMPLATES} from '../core/modules/automation/templates.mjs';
import {readFlowDocument,saveFlow} from '../core/modules/workspace/workspace.mjs';
import {readFlowDraft,writeFlowDraft,discardFlowDraft,assertRecoverableFlow} from '../core/modules/automation/flow-recovery.mjs';

const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
// Portable test codec; native Windows protection is exercised by the Electron E2E.
function testCodec(){
  const key=randomBytes(32);
  return {available:async()=>true,encrypt:async text=>{
    const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv),body=Buffer.concat([c.update(text,'utf8'),c.final()]);
    return Buffer.concat([iv,c.getAuthTag(),body]);
  },decrypt:async bytes=>{
    const d=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));d.setAuthTag(bytes.subarray(12,28));
    return Buffer.concat([d.update(bytes.subarray(28)),d.final()]).toString('utf8');
  }};
}
async function fixture(run,{initial=true}={}){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'of-unified-flow-')),workspace=path.join(root,'project'),profile=path.join(root,'profile');
  await Promise.all([fs.mkdir(workspace),fs.mkdir(profile)]);
  const codec=testCodec(),removed=[];
  const api={readFlowDraft:r=>readFlowDraft(profile,r,codec),writeFlowDraft:(...args)=>writeFlowDraft(profile,...args,codec),
    discardFlowDraft:async(r,t)=>{removed.push(t);return discardFlowDraft(profile,r,t,codec);}};
  if(initial)await saveFlow(workspace,exampleFlow(),null);
  const session=createFlowSession(exampleFlow()),controller=createFlowRecoveryController(api,{delay:60_000});
  const stage=()=>{const s=session.getSnapshot();controller.stage(workspace,s.graph,s.flowRevision,s.flowDirty&&s.recoveryEligible);};
  const activate=async()=>{const doc=await readFlowDocument(workspace);session.replaceDocument(doc.flow,doc.revision,doc.revision===null,false);await controller.open(workspace);stage();};
  const unsubscribe=session.subscribe(stage);
  const read=()=>api.readFlowDraft(workspace);
  try {await activate();await run({workspace,profile,api,session,controller,read,activate,removed,
    save:()=>saveFlowSession({session,controller,workspace,saveFlow:(flow,revision)=>saveFlow(workspace,flow,revision)})});}
  finally{unsubscribe();controller.close();await fs.rm(root,{recursive:true,force:true});}
}

test('unified session never checkpoints the untouched new-workspace example',async()=>fixture(async({session,controller,read})=>{
  assert.equal(session.getSnapshot().flowDirty,true);assert.equal(session.getSnapshot().recoveryEligible,false);
  await controller.flush();assert.equal(await read(),null);
  session.rename('Primeiro trabalho');await controller.flush();assert.equal((await read()).flow.name,'Primeiro trabalho');
},{initial:false}));

test('120-character authoring name is accepted by encrypted recovery without truncation',async()=>fixture(async({session,controller,read,workspace})=>{
  const name='N'.repeat(120);session.rename(name);assert.doesNotThrow(()=>assertRecoverableFlow(session.getSnapshot().graph));
  await controller.flush();assert.equal((await read()).flow.name,name);
  assert.equal((await readFlowDocument(workspace)).flow.name,exampleFlow().name);
  assert.throws(()=>session.rename('N'.repeat(121)),/120/);
}));

test('restored checkpoint is undoable to original and undo removes only the obsolete local copy',async()=>fixture(async({session,controller,read,activate,workspace})=>{
  const original=await readFlowDocument(workspace);session.rename('Rascunho recuperado');await controller.flush();
  await activate();assert.equal(session.getSnapshot().graph.name,original.flow.name);
  session.setInteractionLocked(true);
  assert.equal(await restoreFlowSession({session,controller}),true);
  assert.equal(session.getSnapshot().graph.name,'Rascunho recuperado');assert.equal(session.getSnapshot().canUndo,true);
  assert.equal(session.getSnapshot().flowRevision,original.revision);
  session.setInteractionLocked(false);session.undo();await controller.flush();
  assert.equal(session.getSnapshot().flowDirty,false);assert.equal(await read(),null);
  assert.deepEqual(await readFlowDocument(workspace),original);
  session.redo();await controller.flush();assert.equal((await read()).flow.name,'Rascunho recuperado');
}));

test('edits racing a native save get a rebased checkpoint without delete-first loss',async()=>fixture(async({session,controller,read,workspace,removed})=>{
  session.rename('Snapshot para salvar');const started=defer(),finish=defer();
  const saving=saveFlowSession({session,controller,workspace,saveFlow:async(flow,revision)=>{
    const result=await saveFlow(workspace,flow,revision);started.resolve();await finish.promise;return result;
  }});
  await started.promise;session.rename('Edição mais recente');finish.resolve();const done=await saving;
  assert.equal(done.unchanged,false);assert.equal(session.getSnapshot().flowDirty,true);
  const disk=await readFlowDocument(workspace),draft=await read();
  assert.equal(disk.flow.name,'Snapshot para salvar');assert.equal(draft.flow.name,'Edição mais recente');
  assert.equal(draft.baseRevision,disk.revision);assert.equal(removed.length,0);
}));

test('external conflict preserves both native source and newest checkpoint',async()=>fixture(async({session,controller,read,workspace,save})=>{
  session.rename('Minha alteração');const original=await readFlowDocument(workspace);
  const external={...original.flow,name:'Alteração externa'};await saveFlow(workspace,external,original.revision);
  await assert.rejects(save(),/fora do editor/);
  assert.equal((await readFlowDocument(workspace)).flow.name,'Alteração externa');assert.equal((await read()).flow.name,'Minha alteração');
  assert.equal(session.getSnapshot().flowDirty,true);
}));

test('undo to baseline never deletes a checkpoint when the native source changed externally',async()=>fixture(async({session,controller,read,workspace})=>{
  session.rename('Editado');await controller.flush();const checkpoint=await read();
  const source=await readFlowDocument(workspace);await saveFlow(workspace,{...source.flow,name:'Externo'},source.revision);
  session.undo();await controller.flush();assert.equal((await read()).draftRevision,checkpoint.draftRevision);
  assert.match(controller.getSnapshot().error,/externamente/);
}));

test('all authoring mutation routes respect recovery lock; selection remains available',()=>{
  const s=createFlowSession(exampleFlow());s.setSelectedId('selecionar');s.duplicateSelected('copy');s.undo();
  s.setInteractionLocked(true);const before=JSON.stringify(s.getSnapshot().graph);
  for(const mutate of [()=>s.rename('bad'),()=>s.applyTemplate(WORKFLOW_TEMPLATES[0].flow),()=>s.undo(),()=>s.redo(),
    ()=>s.deleteSelected(),()=>s.deleteElements({nodes:[{id:'inicio'}]}),()=>s.duplicateSelected('new'),
    ()=>s.setNodes([]),()=>s.setEdges([]),()=>s.handleNodesChange([{type:'remove',id:'inicio'}],()=>[]),
    ()=>s.handleEdgesChange([{type:'remove',id:'edge'}],()=>[])])assert.throws(mutate,/bloqueada/);
  s.setSelectedId('inicio');assert.equal(s.getSnapshot().selectedId,'inicio');assert.equal(JSON.stringify(s.getSnapshot().graph),before);
});

test('shared undo/redo budget remains bounded after travelling across different-sized snapshots',()=>{
  const s=createFlowSession(exampleFlow(),{maxEntries:5,maxBytes:20_000});
  for(let i=0;i<12;i++)s.setNodes(ns=>ns.map(n=>n.id==='inicio'?{...n,data:{...n.data,config:{payload:'x'.repeat(1500+i*300)}}}:n));
  const check=()=>{assert.ok(s.getSnapshot().historyEntries<=5);assert.ok(s.getSnapshot().historyBytes<=20_000);};
  check();for(let i=0;i<12;i++){s.undo();check();}for(let i=0;i<12;i++){s.redo();check();}
});

test('late save results cannot regress a revision or leak across project replacement',()=>{
  const s=createFlowSession(exampleFlow());s.rename('A');const a=s.captureSaveToken();s.rename('B');const b=s.captureSaveToken();
  assert.equal(s.markSaved(b,'new'),true);assert.equal(s.markSaved(a,'old'),false);assert.equal(s.getSnapshot().flowRevision,'new');
  s.replaceDocument({...exampleFlow(),name:'Outro projeto'},'different');assert.equal(s.isCurrentDocument(b),false);
  assert.equal(s.markSaved(b,'leaked'),false);assert.equal(s.getSnapshot().flowRevision,'different');assert.equal(s.getSnapshot().canUndo,false);
});

test('restored data tools and template history survive native save/read-back',async()=>fixture(async({session,controller,activate,read,workspace,save})=>{
  const template=WORKFLOW_TEMPLATES.find(t=>t.label==='Preparar registros');assert.ok(template);
  session.applyTemplate(template.flow);await controller.flush();assert.equal((await read()).flow.nodes.length,5);
  await activate();await restoreFlowSession({session,controller});await save();
  assert.deepEqual((await readFlowDocument(workspace)).flow,template.flow);assert.equal(await read(),null);
  session.undo();assert.equal(session.getSnapshot().graph.nodes.length,3);assert.equal(session.getSnapshot().flowDirty,true);
  session.redo();assert.equal(session.getSnapshot().flowDirty,false);
}));

test('cached document snapshot remains stable for presentation changes and owns config copies',()=>{
  const input=exampleFlow(),s=createFlowSession(input),before=s.getSnapshot().graph;
  input.nodes[0].config.payload='outside';assert.notEqual(before.nodes[0].config.payload,'outside');
  s.setSelectedId('gravar');assert.equal(s.getSnapshot().graph,before);
  s.setNodes(ns=>ns.map(n=>({...n,measured:{width:300}})),{presentation:true});assert.equal(s.getSnapshot().graph,before);
  s.rename('Novo');assert.notEqual(s.getSnapshot().graph,before);assert.equal(before.name,exampleFlow().name);
});
