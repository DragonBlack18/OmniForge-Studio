import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createNode, exampleFlow } from '../core/catalog.mjs';
import { runSupervisedFlow } from '../core/supervisor.mjs';

async function dir(t) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'omni-supervisor-'));
  t.after(() => fs.rm(folder, { recursive:true, force:true }));
  return folder;
}
function localFlow(port) {
  const trigger=createNode('trigger.manual','start',{x:0,y:0});
  const call=createNode('http.localJson','slow',{x:200,y:0});
  call.config={url:'http://127.0.0.1:'+port+'/wait',method:'GET',timeoutMs:'8000'};
  return {schemaVersion:1,name:'Cancelamento',nodes:[trigger,call],edges:[
    {id:'e1',source:'start',sourceHandle:'out',target:'slow',targetHandle:'in'}
  ]};
}
async function slowServer(t) {
  const server=http.createServer((_req,res)=>{res.on('error',()=>{});});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  return server.address().port;
}

test('processo separado executa fluxo real e comunica progresso', async t => {
  const workspace=await dir(t), updates=[];
  const result=await runSupervisedFlow(exampleFlow(),{
    workspace,dryRun:false,networkApproved:false,projects:[]
  },{onProgress:step=>updates.push(step)});
  assert.equal(result.ok,true,result.error);
  assert.equal(result.steps.length,3);
  assert.deepEqual(updates.map(step=>step.status),['PASS','PASS','PASS']);
  const output=JSON.parse(await fs.readFile(path.join(workspace,'.omniforge/output/venda.json'),'utf8'));
  assert.equal(output.id,1001);
});

test('simulação supervisionada não grava saída real', async t => {
  const workspace=await dir(t);
  const result=await runSupervisedFlow(exampleFlow(),{
    workspace,dryRun:true,networkApproved:false,projects:[]
  });
  assert.equal(result.ok,true,result.error);
  assert.equal(result.artifacts[0].simulated,true);
  await assert.rejects(fs.stat(path.join(workspace,'.omniforge/output/venda.json')),{code:'ENOENT'});
});

test('cancelamento termina HTTP lento e preserva resposta de supervisão', async t => {
  const workspace=await dir(t), port=await slowServer(t);
  const controller=new AbortController(), started=Date.now();
  const task=runSupervisedFlow(localFlow(port),{
    workspace,dryRun:false,networkApproved:true,projects:[]
  },{timeoutMs:5000,signal:controller.signal});
  setTimeout(()=>controller.abort(),450);
  const result=await task;
  assert.equal(result.ok,false);
  assert.equal(result.stage,'supervision');
  assert.match(result.error,/cancelada/);
  assert.ok(Date.now()-started<4000);
});

test('timeout elimina executor sem deixar automação ativa', async t => {
  const workspace=await dir(t), port=await slowServer(t);
  const result=await runSupervisedFlow(localFlow(port),{
    workspace,dryRun:false,networkApproved:true,projects:[]
  },{timeoutMs:500});
  assert.equal(result.ok,false);
  assert.equal(result.stage,'supervision');
  assert.match(result.error,/limite/);
});

test('abort antes de iniciar não cria documentos', async t => {
  const workspace=await dir(t), controller=new AbortController();
  controller.abort();
  const result=await runSupervisedFlow(exampleFlow(),{
    workspace,dryRun:false,networkApproved:false,projects:[]
  },{signal:controller.signal});
  assert.equal(result.ok,false);
  assert.match(result.error,/antes do início/);
  await assert.rejects(fs.stat(path.join(workspace,'.omniforge')),{code:'ENOENT'});
});

test('validação rejeita timeout e projetos inválidos', async t => {
  const workspace=await dir(t);
  assert.throws(()=>runSupervisedFlow(exampleFlow(),{
    workspace,dryRun:false,networkApproved:false,projects:[]
  },{timeoutMs:Infinity}),/Tempo limite/);
  assert.throws(()=>runSupervisedFlow(exampleFlow(),{
    workspace,dryRun:false,networkApproved:false,projects:'*'
  }),/Parâmetros/);
});
