import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ELK from 'elkjs/lib/elk.bundled.js';
import {buildFlowLayoutGraph,readFlowLayoutPositions} from '../core/modules/automation/layout.mjs';
import {exampleFlow,createNode} from '../core/modules/automation/catalog.mjs';
import {WORKFLOW_TEMPLATES} from '../core/modules/automation/templates.mjs';
import {runFlow} from '../core/modules/automation/runner.mjs';
import {validateFlow} from '../core/modules/automation/graph.mjs';
import {createFlowSession,toUiNodes} from '../src/modules/automation/flow-session-store.mjs';
import {createFlowLayoutController} from '../src/modules/automation/flow-layout-controller.mjs';

async function arrange(flow,uiNodes=toUiNodes(flow)) {
  const graph=buildFlowLayoutGraph(uiNodes,flow.edges);
  const result=await new ELK().layout(graph);
  return {graph,result,positions:readFlowLayoutPositions(result,flow.nodes.map(node=>node.id))};
}
const wire=(source,target,sourceHandle='out',targetHandle='in',id=source+'_'+target)=>({id,source,target,sourceHandle,targetHandle});
const coordinates=flow=>flow.nodes.map((node,index)=>({id:node.id,x:40+index*360,y:40}));
function assertNoOverlap(nodes){
  for(let a=0;a<nodes.length;a++)for(let b=a+1;b<nodes.length;b++){
    const left=nodes[a],right=nodes[b];
    const overlap=left.x<right.x+right.width&&left.x+left.width>right.x&&left.y<right.y+right.height&&left.y+left.height>right.y;
    assert.equal(overlap,false,`Blocos sobrepostos: ${left.id}, ${right.id}`);
  }
}

test('real ELK layout separates branches and measured blocks without changing graph semantics',async()=>{
  const flow=structuredClone(WORKFLOW_TEMPLATES.find(item=>item.id==='pedido-ramificado').flow);
  const before=structuredClone(flow),nodes=toUiNodes(flow);
  nodes[1].measured={width:420,height:190};
  const {result,positions}=await arrange(flow,nodes);
  assertNoOverlap(result.children);
  const byId=new Map(result.children.map(node=>[node.id,node]));
  for(const edge of flow.edges){
    const source=byId.get(edge.source),target=byId.get(edge.target);
    assert.ok(target.x>=source.x+source.width,edge.id+' must follow its source');
  }
  assert.equal(byId.get('if').width,420);assert.equal(byId.get('if').height,190);
  const session=createFlowSession(flow);
  assert.equal(session.applyLayout(positions,session.captureLayoutToken()),true);
  assert.equal(validateFlow(session.getSnapshot().graph).valid,true);
  assert.deepEqual(session.getSnapshot().graph.edges,before.edges);
  assert.deepEqual(session.getSnapshot().graph.nodes.map(({position,...node})=>node),before.nodes.map(({position,...node})=>node));
  assert.deepEqual(flow,before,'layout cannot mutate the input document');
});

test('real ELK also arranges disconnected drafts and multiple input merge ports',async()=>{
  const nodes=[createNode('trigger.manual','start',{x:0,y:0}),createNode('text.trim','a',{x:0,y:0}),
    createNode('text.upper','b',{x:0,y:0}),createNode('logic.combine','merge',{x:0,y:0}),
    createNode('text.lower','draft',{x:0,y:0})];
  const flow={schemaVersion:1,name:'Ramificação',nodes,edges:[wire('start','a'),wire('start','b'),wire('a','merge','out','a'),wire('b','merge','out','b')]};
  const {result,positions}=await arrange(flow);
  assert.equal(positions.length,5);assertNoOverlap(result.children);
  const merge=result.children.find(node=>node.id==='merge');
  const inputs=merge.ports.filter(port=>port.id.includes(':in:'));
  assert.equal(inputs.length,2);assert.ok(inputs[0].y<inputs[1].y);
});

test('ELK handles the 400-node document limit with finite nonoverlapping coordinates',async()=>{
  const nodes=Array.from({length:400},(_,i)=>createNode(i?'text.trim':'trigger.manual','n'+i,{x:0,y:0}));
  const edges=nodes.slice(1).map((node,i)=>wire(nodes[i].id,node.id));
  const {result,positions}=await arrange({schemaVersion:1,name:'Limite',nodes,edges});
  assert.equal(positions.length,400);assertNoOverlap(result.children);
  assert.ok(positions.every(position=>Number.isFinite(position.x)&&Number.isFinite(position.y)));
});

test('layout worker projection contains ports and geometry but no configurations or payloads',()=>{
  const flow=exampleFlow();flow.nodes[0].config.payload='{"password":"private-value"}';
  const graph=buildFlowLayoutGraph(toUiNodes(flow),flow.edges);
  assert.doesNotMatch(JSON.stringify(graph),/private-value|password|payload|config/);
  assert.equal(graph.children[0].ports[0].id,'inicio:out:out');
  const fallback=toUiNodes(flow);fallback[0].measured={width:NaN,height:Infinity};
  assert.equal(buildFlowLayoutGraph(fallback,flow.edges).children[0].width,250);
  // Existing document edge identities need not be valid ELK identifiers.
  flow.edges[0].id='inicio:out:out';
  const projected=buildFlowLayoutGraph(toUiNodes(flow),flow.edges);
  assert.notEqual(projected.edges[0].id,projected.children[0].ports[0].id);
});

test('invalid topology and worker results fail before any document mutation',()=>{
  const flow=exampleFlow();
  assert.throws(()=>buildFlowLayoutGraph(Array(401).fill(flow.nodes[0]),[]),/400/);
  assert.throws(()=>buildFlowLayoutGraph([flow.nodes[0],flow.nodes[0]],[]),/identificadores/);
  assert.throws(()=>buildFlowLayoutGraph(flow.nodes,[wire('missing','gravar')]),/ausentes/);
  assert.throws(()=>buildFlowLayoutGraph(flow.nodes,[wire('inicio','gravar','wrong')]),/incompatíveis/);
  assert.throws(()=>buildFlowLayoutGraph(flow.nodes,[...flow.edges,wire('inicio','gravar')]),/mais de uma/);
  assert.throws(()=>buildFlowLayoutGraph(flow.nodes,[wire('selecionar','gravar'),wire('gravar','selecionar')]),/Ciclo/);
  const session=createFlowSession(flow),token=session.captureLayoutToken();
  for(const positions of [[],[{id:'inicio',x:NaN,y:0}],coordinates(flow).map(p=>({...p,x:Infinity})),coordinates(flow).map(p=>({...p,x:1_000_001})),coordinates(flow).map(p=>({...p,id:'inicio'}))]){
    assert.throws(()=>session.applyLayout(positions,token));
    assert.equal(session.getSnapshot().canUndo,false);assert.deepEqual(session.getSnapshot().graph,flow);
  }
});

test('layout commits one undo entry and preserves the latest presentation selection',()=>{
  const flow=exampleFlow(),session=createFlowSession(flow),token=session.captureLayoutToken();
  session.setSelectedId('gravar');
  assert.equal(session.applyLayout(coordinates(flow),token),true);
  assert.equal(session.getSnapshot().historyEntries,1);assert.equal(session.getSnapshot().selectedId,'gravar');
  assert.deepEqual(session.getSnapshot().nodes.filter(node=>node.selected).map(node=>node.id),['gravar']);
  assert.equal(session.getSnapshot().flowDirty,true);
  session.undo();assert.deepEqual(session.getSnapshot().graph,flow);assert.equal(session.getSnapshot().flowDirty,false);
  session.redo();assert.deepEqual(session.getSnapshot().nodes.map(node=>node.position),coordinates(flow).map(({x,y})=>({x,y})));
});

test('stale layouts cannot overwrite edits, undo, a new workspace, or a locked document',()=>{
  const flow=exampleFlow(),session=createFlowSession(flow),token=session.captureLayoutToken();
  session.rename('Editado');const changed=structuredClone(session.getSnapshot().graph);
  assert.equal(session.applyLayout(coordinates(flow),token),false);assert.deepEqual(session.getSnapshot().graph,changed);
  session.undo();assert.equal(session.applyLayout(coordinates(flow),token),false,'undo does not revive an expired computation');
  const beforeLoad=session.captureLayoutToken();session.replaceDocument(flow,'other-workspace');
  assert.equal(session.applyLayout(coordinates(flow),beforeLoad),false);
  const locked=session.captureLayoutToken();session.setInteractionLocked(true);
  assert.throws(()=>session.applyLayout(coordinates(flow),locked),/bloqueada/);
  assert.deepEqual(session.getSnapshot().graph,flow);
});

test('a laid out real workflow writes the same branch output as the original',async t=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'of-layout-run-'));
  t.after(()=>fs.rm(folder,{recursive:true,force:true}));
  const original=path.join(folder,'before'),organized=path.join(folder,'after');
  await Promise.all([fs.mkdir(original),fs.mkdir(organized)]);
  const flow=structuredClone(WORKFLOW_TEMPLATES.find(item=>item.id==='pedido-ramificado').flow);
  const session=createFlowSession(flow),{positions}=await arrange(flow);
  session.applyLayout(positions,session.captureLayoutToken());
  const before=await runFlow(flow,{workspace:original,dryRun:false});
  const after=await runFlow(session.getSnapshot().graph,{workspace:organized,dryRun:false});
  assert.equal(before.ok,true);assert.equal(after.ok,true);
  assert.deepEqual(after.steps.map(({nodeId,status})=>({nodeId,status})),before.steps.map(({nodeId,status})=>({nodeId,status})));
  const output='.omniforge/output/valor-alto.json';
  assert.deepEqual(await fs.readFile(path.join(original,output)),await fs.readFile(path.join(organized,output)));
});

function fakeWorker(){return {sent:null,terminated:0,postMessage(message){this.sent=message;},terminate(){this.terminated++;}};}
test('controller commits one response, ignores unrelated messages and always releases the worker',async()=>{
  const session=createFlowSession(exampleFlow()),worker=fakeWorker(),completions=[];
  const controller=createFlowLayoutController({session,createWorker:()=>worker,onComplete:result=>completions.push(result)});
  const promise=controller.arrange();
  assert.equal(controller.getSnapshot().running,true);
  worker.onmessage({data:{id:999,layout:{children:[]}}});assert.equal(controller.getSnapshot().running,true);
  const result=await new ELK().layout(worker.sent.graph);
  worker.onmessage({data:{id:worker.sent.id,layout:result}});
  assert.equal((await promise).applied,true);assert.equal(worker.terminated,1);assert.equal(worker.onmessage,null);
  assert.equal(completions.length,1);assert.equal(controller.getSnapshot().running,false);
  assert.equal(session.getSnapshot().historyEntries,1);
});

test('controller cancels an in-flight layout when document changes and ignores a late worker result',async()=>{
  const session=createFlowSession(exampleFlow()),worker=fakeWorker(),completions=[];
  const controller=createFlowLayoutController({session,createWorker:()=>worker,onComplete:result=>completions.push(result)});
  const promise=controller.arrange(),late=worker.onmessage,id=worker.sent.id;
  session.rename('Documento mais novo');
  const current=structuredClone(session.getSnapshot().graph);
  assert.equal((await promise).reason,'changed');assert.equal(worker.terminated,1);
  late({data:{id,layout:{children:coordinates(exampleFlow())}}});
  assert.deepEqual(session.getSnapshot().graph,current);assert.deepEqual(completions,[]);
});

test('controller cancellation, worker failure, malformed result and timeout preserve the graph',async()=>{
  for(const action of ['cancel','error','malformed','timeout']){
    const flow=exampleFlow(),session=createFlowSession(flow),worker=fakeWorker(),errors=[];
    const controller=createFlowLayoutController({session,createWorker:()=>worker,onError:error=>errors.push(error),timeoutMs:action==='timeout'?10:10_000});
    const promise=controller.arrange();
    if(action==='cancel')controller.cancel();
    if(action==='error')worker.onerror({preventDefault(){}});
    if(action==='malformed')worker.onmessage({data:{id:worker.sent.id,layout:{children:[]}}});
    const result=await promise;
    assert.equal(result.applied,false);assert.equal(worker.terminated,1);assert.equal(session.getSnapshot().historyEntries,0);
    assert.deepEqual(session.getSnapshot().graph,flow);assert.equal(errors.length,action==='cancel'?0:1);
  }
});
