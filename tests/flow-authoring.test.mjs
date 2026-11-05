import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {exampleFlow,createNode} from '../core/modules/automation/catalog.mjs';
import {validateFlow} from '../core/modules/automation/graph.mjs';
import {checkFlowConnection,arrangeFlowNodes} from '../core/modules/automation/connections.mjs';
import {executePureNode,validatePureNode} from '../core/modules/automation/pure-nodes.mjs';
import {runFlow} from '../core/modules/automation/runner.mjs';
import {WORKFLOW_TEMPLATES} from '../core/modules/automation/templates.mjs';
import {createFlowSession} from '../src/modules/automation/flow-session-store.mjs';

const edge=(source,target,sourceHandle='out',targetHandle='in')=>({id:source+'_'+target,source,target,sourceHandle,targetHandle});
const make=type=>{const n=createNode(type,'node',{x:0,y:0});return n.config;};
const result=(type,input,config={})=>executePureNode(type,input,{...make(type),...config});

test('connection guard rejects self loops, cycles, occupied inputs and invalid handles without mutating document',()=>{
  const flow=exampleFlow(),before=structuredClone(flow);
  assert.equal(checkFlowConnection(flow,edge('inicio','inicio')).valid,false);
  assert.equal(checkFlowConnection(flow,edge('inicio','selecionar')).code,'occupied');
  assert.equal(checkFlowConnection(flow,edge('inicio','gravar','wrong')).code,'ports');
  assert.equal(checkFlowConnection(flow,edge('missing','gravar')).code,'missing');
  const candidate={...flow,edges:[edge('selecionar','gravar')]};
  assert.equal(checkFlowConnection(candidate,edge('gravar','selecionar')).code,'cycle');
  assert.equal(checkFlowConnection({...flow,edges:[]},edge('inicio','selecionar')).valid,true);
  assert.deepEqual(flow,before);
});
test('auto-arrange changes only position, is deterministic and refuses cyclic graphs',()=>{
  const f=exampleFlow(),before=structuredClone(f);
  const a=arrangeFlowNodes(f.nodes,f.edges),b=arrangeFlowNodes(f.nodes,f.edges);
  assert.deepEqual(a,b);assert.deepEqual(f,before);
  assert.ok(a[0].position.x<a[1].position.x&&a[1].position.x<a[2].position.x);
  assert.deepEqual(a.map(({position,...n})=>n),f.nodes.map(({position,...n})=>n));
  assert.throws(()=>arrangeFlowNodes(f.nodes,[...f.edges,edge('gravar','inicio')]),/Ciclo/);
});
test('document history restores deletion with incident wires in a single undo and preserves its name',()=>{
  const f=exampleFlow(),s=createFlowSession(f);s.replaceDocument(f,'rev');s.setSelectedId('selecionar');s.deleteSelected();
  assert.equal(s.getSnapshot().nodes.length,2);assert.equal(s.getSnapshot().edges.length,0);
  s.undo();assert.deepEqual(s.getSnapshot().graph,f);assert.equal(s.getSnapshot().flowDirty,false);
  s.redo();assert.equal(s.getSnapshot().edges.length,0);assert.equal(s.getSnapshot().flowDirty,true);
});
test('selection and measurements do not enter history; typing coalesces and new work invalidates redo',()=>{
  let now=0;const s=createFlowSession(exampleFlow(),{clock:()=>now});
  s.setSelectedId('inicio');assert.equal(s.getSnapshot().canUndo,false);
  s.setNodes(nodes=>nodes.map(n=>({...n,measured:{width:200}})),{presentation:true});assert.equal(s.getSnapshot().canUndo,false);
  const write=value=>s.setNodes(ns=>ns.map(n=>n.id==='inicio'?{...n,data:{...n.data,config:{payload:value}}}:n),{groupKey:'inicio:payload'});
  write('{}');now=100;write('{"n":1}');s.undo();assert.equal(s.getSnapshot().nodes[0].data.config.payload,exampleFlow().nodes[0].config.payload);
  write('[]');assert.equal(s.getSnapshot().canRedo,false);
});
test('drag changes coalesce into one history entry and dimensions never dirty the flow',()=>{
  const s=createFlowSession(exampleFlow());
  const apply=(changes,ns)=>ns.map(n=>{const c=changes.find(c=>c.id===n.id);return c?.position?{...n,position:c.position}:n;});
  for(let i=1;i<=8;i++)s.handleNodesChange([{id:'inicio',type:'position',position:{x:i*10,y:100},dragging:i<8}],apply);
  s.undo();assert.deepEqual(s.getSnapshot().nodes[0].position,exampleFlow().nodes[0].position);assert.equal(s.getSnapshot().canUndo,false);
});
test('save racing new edits keeps dirty; stale workspace response cannot overwrite the new revision',()=>{
  const s=createFlowSession(exampleFlow());s.rename('Primeira edição');const token=s.captureSaveToken();s.rename('Nova edição');
  assert.equal(s.markSaved(token,'revision1'),false);assert.equal(s.getSnapshot().flowDirty,true);
  s.undo();assert.equal(s.getSnapshot().graph.name,'Primeira edição');assert.equal(s.getSnapshot().flowDirty,false);
  s.replaceDocument(exampleFlow(),'different');assert.equal(s.markSaved(token,'old'),false);assert.equal(s.getSnapshot().flowRevision,'different');
});
test('duplicate is disconnected and templates are reversible; history quotas are bounded',()=>{
  const s=createFlowSession(exampleFlow(),{maxEntries:3});s.setSelectedId('selecionar');s.duplicateSelected('copy');
  assert.equal(s.getSnapshot().nodes.length,4);assert.equal(s.getSnapshot().edges.some(e=>e.source==='copy'||e.target==='copy'),false);
  s.applyTemplate(WORKFLOW_TEMPLATES[0].flow);s.undo();assert.equal(s.getSnapshot().nodes.length,4);
  for(let i=0;i<8;i++)s.setNodes(ns=>ns.map(n=>({...n,position:{x:i,y:0}})));
  let count=0;while(s.undo())count++;assert.equal(count,3);
});
test('history respects byte ceiling and subscribes without retaining disposed listeners',()=>{
  const s=createFlowSession(exampleFlow(),{maxBytes:1});let count=0;const dispose=s.subscribe(()=>count++);
  s.rename('Alterado');assert.equal(s.getSnapshot().canUndo,false);dispose();s.rename('Outro');assert.equal(count,1);
});
test('structured diagnostics identify the exact node, reject malformed positions and duplicate CAD outputs',()=>{
  const f=exampleFlow();f.nodes[1].config.path='__proto__.secret';
  const v=validateFlow(f);assert.equal(v.valid,false);assert.ok(v.diagnostics.some(x=>x.nodeId==='selecionar'));
  f.nodes[1].position.x=Infinity;assert.ok(validateFlow(f).diagnostics.some(x=>x.code==='position'));
  const a=createNode('cad.exportDrawing','a',{x:0,y:0}),b=createNode('cad.exportDrawing','b',{x:1,y:0});
  const dupe={schemaVersion:1,nodes:[f.nodes[0],a,b],edges:[edge('inicio','a'),edge('a','b')]};
  assert.ok(validateFlow(dupe).errors.some(x=>x.includes('mesmo arquivo')));
});
test('oversized and hostile graph inputs fail closed before execution',()=>{
  assert.equal(validateFlow({schemaVersion:1,nodes:Array(401).fill(null),edges:[]}).valid,false);
  const f=exampleFlow();f.nodes[0].config.payload='"'+'x'.repeat(2_000_001)+'"';assert.equal(validateFlow(f).valid,false);
});
test('projection and explicit mappings retain only selected own properties',async()=>{
  const input=[{id:1,nome:'A',segredo:'não exportar'}];const saved=structuredClone(input);
  assert.deepEqual(await result('data.project',input),[{id:1,nome:'A'}]);
  assert.deepEqual(await result('data.mapFields',input),[{codigo:1}]);assert.deepEqual(input,saved);
  await assert.rejects(result('data.project',input,{fields:'__proto__'}),/campos|campo/);
  await assert.rejects(result('data.mapFields',input,{mapping:'{"constructor":"id"}'}),/campos|campo/);
  await assert.rejects(result('data.mapFields',input,{mapping:'{"x":"constructor.value"}'}),/reservado/);
});
test('groups preserve key types, count every item, and aggregation is strict and finite',async()=>{
  const input=[{categoria:1,valor:2},{categoria:'1',valor:3},{categoria:1,valor:4}];
  const grouped=await result('data.groupBy',input);assert.equal(grouped.length,2);assert.equal(grouped[0].items.length,2);
  assert.equal(await result('data.sumBy',input),9);
  await assert.rejects(result('data.sumBy',[{valor:'2'}]),/número/);
  await assert.rejects(result('data.sumBy',[{valor:1e308},{valor:1e308}]),/finito/);
  await assert.rejects(result('data.groupBy',[{categoria:{nested:1}}]),/simples/);
});
test('chunk, unicode substring, range and type guards produce real bounded outputs',async()=>{
  assert.deepEqual(await result('data.chunk',[1,2,3,4,5],{size:'2'}),[[1,2],[3,4],[5]]);
  assert.equal(await result('text.substring','A😀çB',{start:'1',count:'2'}),'😀ç');
  assert.equal(await result('math.clamp',200),100);assert.equal(await result('math.clamp',-5),0);
  assert.deepEqual(await result('logic.requireType',[] ,{expected:'array'}),[]);
  await assert.rejects(result('logic.requireType','wrong'),/Tipo recebido/);
  for(const size of ['','0','1001','1.5'])await assert.rejects(result('data.chunk',[],{size}));
  await assert.rejects(result('math.clamp',10,{min:'20',max:'0'}),/Intervalo/);
});
test('new templates execute and persist actual JSON with failures stopping downstream writes',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'of-authoring-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  for(const id of ['projetar-registros','agrupar-registros','totalizar-registros']){
    const flow=WORKFLOW_TEMPLATES.find(x=>x.id===id).flow;
    const r=await runFlow(flow,{workspace:root,dryRun:false});assert.equal(r.ok,true,r.error);
  }
  const read=name=>fs.readFile(path.join(root,'.omniforge/output',name),'utf8').then(JSON.parse);
  assert.deepEqual(await read('registros.json'),[{codigo:1,total:120},{codigo:2,total:80}]);assert.equal(await read('total.json'),200);
  assert.equal((await read('grupos.json'))[0].items.length,2);
  const fail=structuredClone(WORKFLOW_TEMPLATES[0].flow);fail.nodes[0].config.payload='{}';fail.nodes.at(-1).config.fileName='must-not-exist.json';
  const r=await runFlow(fail,{workspace:root,dryRun:false});assert.equal(r.ok,false);assert.equal(r.stage,'execution');
  await assert.rejects(fs.stat(path.join(root,'.omniforge/output/must-not-exist.json')),{code:'ENOENT'});
});
