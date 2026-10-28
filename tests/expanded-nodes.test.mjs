import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NODE_CATALOG, createNode } from '../core/catalog.mjs';
import { validateFlow } from '../core/graph.mjs';
import { runFlow } from '../core/runner.mjs';
import { executePureNode, validatePureNode, PURE_CATALOG } from '../core/pure-nodes.mjs';

function testFlow(type, input, config={}) {
  const trigger=createNode('trigger.manual','start',{x:0,y:0});trigger.config.payload=JSON.stringify(input);
  const node=createNode(type,'transform',{x:220,y:0});Object.assign(node.config,config);
  return {schemaVersion:1,name:'test',nodes:[trigger,node],edges:[{id:'one',source:'start',sourceHandle:'out',target:'transform',targetHandle:'in'}]};
}

const cases={
  'logic.pass': [3,3], 'logic.assert':[{venda:{id:1001}},{venda:{id:1001}}],
  'logic.default':[null,{}],
  'data.constant': [4,{}],
  'data.set': [{a:1},{a:1,status:'ok'}], 'data.remove':[{segredo:1,a:2},{a:2}],
  'data.keys':[{a:1,b:2},['a','b']], 'data.values':[{a:1},[1]], 'data.count':[[1,2,3],3],
  'data.first':[[3,2],3], 'data.last':[[3,2],2], 'data.reverse':[[3,1],[1,3]],
  'data.unique':[[1,1,2],[1,2]], 'data.slice':[[1,2,3],[1,2,3]],
  'data.sort':[[3,1,2],[1,2,3]], 'data.pluck':[[{id:1},{id:2}],[1,2]],
  'data.filter':[[{ativo:true},{ativo:false}],[{ativo:true}]], 'data.flatten':[[[1],[2]],[1,2]],
  'data.merge':[{a:1},{a:1}],
  'text.upper':['ola','OLA'], 'text.lower':['OLA','ola'], 'text.trim':[' x ','x'],
  'text.replace':['antigo novo','novo novo'], 'text.split':['a,b',['a','b']],
  'text.join':[['a','b'],'a,b'], 'text.contains':['texto de exemplo',true], 'text.length':['ola',3],
  'text.template':[{venda:{id:101}},'Pedido 101'],
  'math.add':[2,3], 'math.subtract':[5,4], 'math.multiply':[4,8],
  'math.divide':[8,4], 'math.round':[1.254,1.25], 'math.abs':[-4,4],
  'math.sum':[[1,2,3],6], 'math.average':[[2,4],3], 'math.min':[[4,2],2], 'math.max':[[4,2],4],
  'encoding.base64':['abc','YWJj'], 'encoding.fromBase64':['YWJj','abc'],
  'encoding.toJson':[{x:1},'{"x":1}'], 'encoding.fromJson':['{"x":1}',{x:1}],
  'date.year':['2025-12-31T23:00:00Z',2025]
};
for (const [type,[input,expected]] of Object.entries(cases)) {
  test(`bloco funcional ${type}`, async () => {
    const n=createNode(type,'test',{x:0,y:0});validatePureNode(n);
    assert.deepEqual(await executePureNode(type,input,n.config),expected);
  });
}
test('todos os blocos do catálogo têm um executor explicitamente registrado', () => {
  for (const type of Object.keys(NODE_CATALOG)) {
    assert.ok(Object.hasOwn(PURE_CATALOG,type)|| ['trigger.manual','logic.pick','logic.combine','io.writeJson','io.readJson','http.localJson','project.callLocalApi','cad.sketchReport','cad.exportDrawing'].includes(type),type);
  }
});
test('todos os manifests possuem nomes, categorias, portas e campos corretos', () => {
  for(const [type,manifest] of Object.entries(NODE_CATALOG)) {
    assert.ok(type && manifest.label && manifest.category && manifest.description);
    assert.ok(Array.isArray(manifest.inputs)&&Array.isArray(manifest.outputs)&&Array.isArray(manifest.fields));
    assert.equal(new Set(manifest.inputs.map(x=>x.id)).size,manifest.inputs.length);
    assert.equal(new Set(manifest.outputs.map(x=>x.id)).size,manifest.outputs.length);
  }
});
test('ramificação SIM/NÃO não executa o ramo não selecionado', async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'omni-branches-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const start=createNode('trigger.manual','start',{x:0,y:0});start.config.payload='{"venda":{"id":1001}}';
  const cond=createNode('logic.if','cond',{x:100,y:0});
  const yes=createNode('io.writeJson','yes',{x:200,y:0});yes.config.fileName='sim.json';
  const no=createNode('io.writeJson','no',{x:200,y:100});no.config.fileName='nao.json';
  const combine=createNode('logic.combine','combine',{x:300,y:0});
  const finish=createNode('io.writeJson','finish',{x:400,y:0});finish.config.fileName='resultado.json';
  const nodes=[start,cond,yes,no,combine,finish];
  const edges=[['start','out','cond','in'],['cond','yes','yes','in'],['cond','no','no','in'],['yes','out','combine','a'],['no','out','combine','b'],['combine','out','finish','in']].map(([source,sourceHandle,target,targetHandle],i)=>({id:'e'+i,source,sourceHandle,target,targetHandle}));
  const flow={schemaVersion:1,name:'branch',nodes,edges};assert.equal(validateFlow(flow).valid,true,validateFlow(flow).errors.join(';'));
  const result=await runFlow(flow,{workspace:root,dryRun:false});assert.equal(result.ok,true,result.error);assert.equal(result.steps.find(x=>x.nodeId==='yes').status,'PASS');assert.equal(result.steps.find(x=>x.nodeId==='no').status,'SKIP');
  await assert.rejects(fs.stat(path.join(root,'.omniforge/output/nao.json')),{code:'ENOENT'});
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(root,'.omniforge/output/resultado.json'),'utf8')),{venda:{id:1001}});
  const opposite=structuredClone(flow);opposite.nodes.find(x=>x.id==='cond').config.value='999';const result2=await runFlow(opposite,{workspace:root,dryRun:false});assert.equal(result2.ok,true);assert.equal(result2.steps.find(x=>x.nodeId==='yes').status,'SKIP');assert.equal(result2.steps.find(x=>x.nodeId==='no').status,'PASS');
});
test('simulação da ramificação não gera efeitos colaterais',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'omni-drybranch-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const start=createNode('trigger.manual','start',{x:0,y:0}),cond=createNode('logic.if','cond',{x:100,y:0});
  start.config.payload='{"venda":{"id":1001}}';const yes=createNode('io.writeJson','yes',{x:200,y:0});
  const flow={schemaVersion:1,nodes:[start,cond,yes],edges:[{id:'e1',source:'start',sourceHandle:'out',target:'cond',targetHandle:'in'},{id:'e2',source:'cond',sourceHandle:'yes',target:'yes',targetHandle:'in'}]};
  assert.equal(validateFlow(flow).valid,true);
  const result=await runFlow(flow,{workspace:root,dryRun:true});assert.equal(result.ok,true);
  assert.equal(result.artifacts[0].simulated,true);
  await assert.rejects(fs.stat(path.join(root,'.omniforge/output/venda.json')),{code:'ENOENT'});
});
test('bloqueia caminhos reservados e prova não poluir protótipos',()=>{
  const n=createNode('data.set','x',{x:0,y:0});n.config.path='__proto__.admin';assert.throws(()=>validatePureNode(n),/reservado/);
  assert.equal({}.admin,undefined);
});
test('operações matemáticas rejeitam divisor zero e entradas não numéricas',async ()=>{
  const n=createNode('math.divide','n',{x:0,y:0});n.config.value='0';assert.throws(()=>validatePureNode(n),/zero/);
  await assert.rejects(executePureNode('math.add','2',{value:'1'}),/número/);
});
test('leitura local JSON funciona com arquivo válido e bloqueia symlinks',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'omni-read-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const save=testFlow('io.writeJson',{x:12},{fileName:'dado.json'});const result=await runFlow(save,{workspace:root,dryRun:false});assert.equal(result.ok,true);
  const load=testFlow('io.readJson',true,{fileName:'dado.json'});const loaded=await runFlow(load,{workspace:root,dryRun:false});assert.equal(loaded.ok,true);
  const file=path.join(root,'.omniforge/output/dado.json');await fs.rm(file);await fs.symlink(path.join(root,'fora.json'),file);const blocked=await runFlow(load,{workspace:root,dryRun:false});assert.equal(blocked.ok,false);
});

test('templates oficiais validam e executam sem dados simulados',async t=>{
  const {WORKFLOW_TEMPLATES}=await import('../core/templates.mjs');
  assert.equal(WORKFLOW_TEMPLATES.length,6);
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'omni-templates-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const { initialCadSketch, makeCadEntity, addCadEntity } = await import('../core/cad2d.mjs');
  const { saveCadDocument } = await import('../core/cad-store.mjs');
  await saveCadDocument(root,addCadEntity(initialCadSketch(),makeCadEntity('line',{x:0,y:0},{x:20,y:0})),null);
  for(const template of WORKFLOW_TEMPLATES){
    const result=await runFlow(template.flow,{workspace:root,dryRun:true});
    assert.equal(result.ok,true,template.id+': '+result.error);
    assert.equal(result.steps.some(s=>s.status==='FAIL'),false);
  }
  const selected=WORKFLOW_TEMPLATES.find(t=>t.id==='pedido-ramificado');
  const actual=await runFlow(selected.flow,{workspace:root,dryRun:false});
  assert.equal(actual.ok,true,actual.error);
  await fs.stat(path.join(root,'.omniforge/output/valor-alto.json'));
  await assert.rejects(fs.stat(path.join(root,'.omniforge/output/valor-normal.json')),{code:'ENOENT'});
});
test('algoritmos de codificação têm resultados reais e podem encadear', async()=>{
  const encoded=await executePureNode('encoding.base64','São Paulo',{});
  assert.equal(await executePureNode('encoding.fromBase64',encoded,{}),'São Paulo');
  const digest=await executePureNode('encoding.hash','abc',{});
  assert.equal(digest,'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const uuid=await executePureNode('encoding.uuid',null,{});
  assert.match(uuid,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
test('integração de 3 transformações reais e artefato escrito',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'omni-chain-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const {WORKFLOW_TEMPLATES}=await import('../core/templates.mjs');
  const template=WORKFLOW_TEMPLATES.find(t=>t.id==='filtrar-lista');
  const result=await runFlow(template.flow,{workspace:root,dryRun:false});
  assert.equal(result.ok,true,result.error);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(root,'.omniforge/output/produtos-ativos.json'),'utf8')),['Produto A']);
});
