import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EXAMPLE_EXTENSION } from '../core/extension-example.mjs';
import {
  validateExtensionManifest, executeExtensionSteps, resolveExtensionAction
} from '../core/extension-contract.mjs';
import {
  listInstalledExtensions, extensionSnapshot, readExtensionFile, installExtension,
  setExtensionEnabled, setExtensionGrant, removeExtension
} from '../core/extension-registry.mjs';
import { validateFlow } from '../core/graph.mjs';
import { runSupervisedFlow } from '../core/supervisor.mjs';
import { recordRunHistory, listRunHistory, readRunHistory } from '../core/history.mjs';

const clone=value=>structuredClone(value);
const flowFor=(manifest=EXAMPLE_EXTENSION,actionId='kg-para-gramas')=>({
  schemaVersion:1,name:'Extensão real de engenharia',nodes:[
    {id:'start',type:'trigger.manual',position:{x:0,y:0},config:{
      payload:JSON.stringify({massaKg:1.25,ordem:'003',material:'Aço inox'})
    }},
    {id:'ext',type:'extension.call',position:{x:240,y:0},
      config:{extensionId:manifest.id,actionId}}
  ],edges:[{id:'e1',source:'start',sourceHandle:'out',target:'ext',targetHandle:'in'}]
});
async function fixture(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'omniforge-ext-'));
  const data=path.join(root,'profile'),a=path.join(root,'workspace-a'),b=path.join(root,'workspace-b');
  await Promise.all([fs.mkdir(data),fs.mkdir(a),fs.mkdir(b)]);
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  return {root,data,a,b};
}
async function authorized(t,{write=true}={}) {
  const fx=await fixture(t);
  await installExtension(fx.data,EXAMPLE_EXTENSION);
  await setExtensionEnabled(fx.data,EXAMPLE_EXTENSION.id,true);
  await setExtensionGrant(fx.data,fx.a,EXAMPLE_EXTENSION.id,'workflow.transform',true);
  if(write)await setExtensionGrant(fx.data,fx.a,EXAMPLE_EXTENSION.id,'workspace.output.write',true);
  const extensions=await extensionSnapshot(fx.data,fx.a);
  return {...fx,extensions};
}
test('manifesto declarativo validado e todas as 2 ações reais cadastradas',()=>{
  assert.equal(validateExtensionManifest(EXAMPLE_EXTENSION),EXAMPLE_EXTENSION);
  assert.equal(EXAMPLE_EXTENSION.actions.length,2);
  assert.equal(EXAMPLE_EXTENSION.permissions.length,2);
});
test('eng. massa: caminho, fator, arredondamento e wrap executam sem mock',()=>{
  const action=EXAMPLE_EXTENSION.actions[0];
  assert.deepEqual(executeExtensionSteps(action,{massaKg:1.25}),{massaGramas:1250});
  assert.deepEqual(executeExtensionSteps(action,{massaKg:0.005}),{massaGramas:5});
  assert.throws(()=>executeExtensionSteps(action,{massaKg:'1.2'}),/número/);
  assert.throws(()=>executeExtensionSteps(action,{outra:1}),/Campo obrigatório/);
});
test('templates usam dados reais, sem eval nem execução de strings',()=>{
  const result=executeExtensionSteps(EXAMPLE_EXTENSION.actions[1],{ordem:'001',material:'Alumínio'});
  assert.equal(result,'ORDEM 001 | MATERIAL Alumínio');
  assert.throws(()=>executeExtensionSteps(EXAMPLE_EXTENSION.actions[1],{ordem:'001'}),/Campo obrigatório/);
});
test('manifesto bloqueia operações e campos arbitrários, duplicatas e IDs perigosos',()=>{
  const bad=clone(EXAMPLE_EXTENSION);
  bad.actions[0].steps[0]={op:'eval',code:'process.exit(0)'};
  assert.throws(()=>validateExtensionManifest(bad),/campo não reconhecido|indisponível/);
  const foreign=clone(EXAMPLE_EXTENSION);
  foreign.require='node:child_process';
  assert.throws(()=>validateExtensionManifest(foreign),/não reconhecido/);
  const dup=clone(EXAMPLE_EXTENSION);
  dup.actions[1].id=dup.actions[0].id;
  assert.throws(()=>validateExtensionManifest(dup),/duplicado/);
  const polluted=clone(EXAMPLE_EXTENSION);
  polluted.actions[0].steps[0].path='__proto__.polluted';
  assert.throws(()=>validateExtensionManifest(polluted),/inválido/);
});
test('escrita em workspace requer permissão declarada e filename seguro',()=>{
  const missing=clone(EXAMPLE_EXTENSION);
  missing.permissions=['workflow.transform'];
  assert.throws(()=>validateExtensionManifest(missing),/permissão explícita/);
  const traversal=clone(EXAMPLE_EXTENSION);
  traversal.actions[0].outputFile='../outside.json';
  assert.throws(()=>validateExtensionManifest(traversal),/nome JSON seguro/);
});
test('operações desconhecidas são recusadas, sem callback ou JavaScript carregado',()=>{
  const payload=clone(EXAMPLE_EXTENSION);
  payload.actions[0].steps=[{op:'fs.writeFile',path:'../../test'}];
  assert.throws(()=>validateExtensionManifest(payload),/não reconhecido|indisponível/);
  const template=clone(EXAMPLE_EXTENSION);
  template.actions[1].steps=[{op:'text.template',template:'{{constructor}}'}];
  assert.throws(()=>validateExtensionManifest(template),/inválido/);
});
test('registro começa vazio, instala desativada e mantém SHA256 verificável',async t=>{
  const {data,a}=await fixture(t);
  assert.deepEqual(await listInstalledExtensions(data,a),[]);
  const installed=await installExtension(data,EXAMPLE_EXTENSION);
  assert.equal(installed.enabled,false);
  assert.match(installed.sha256,/^[a-f0-9]{64}$/);
  const rows=await listInstalledExtensions(data,a);
  assert.equal(rows.length,1);
  assert.deepEqual(rows[0].granted,[]);
  assert.equal(rows[0].actions.length,2);
  assert.equal((await installExtension(data,EXAMPLE_EXTENSION)).alreadyInstalled,true);
});
test('sem instalação, ativação ou permissão o fluxo é barrado na validação',async t=>{
  const {data,a}=await fixture(t);
  const flow=flowFor();
  assert.equal(validateFlow(flow).valid,false);
  await installExtension(data,EXAMPLE_EXTENSION);
  assert.equal(validateFlow(flow,{extensions:await extensionSnapshot(data,a)}).valid,false);
  await setExtensionEnabled(data,EXAMPLE_EXTENSION.id,true);
  assert.equal(validateFlow(flow,{extensions:await extensionSnapshot(data,a)}).valid,false);
  await setExtensionGrant(data,a,EXAMPLE_EXTENSION.id,'workflow.transform',true);
  assert.equal(validateFlow(flow,{extensions:await extensionSnapshot(data,a)}).valid,false);
  await setExtensionGrant(data,a,EXAMPLE_EXTENSION.id,'workspace.output.write',true);
  assert.equal(validateFlow(flow,{extensions:await extensionSnapshot(data,a)}).valid,true);
});
test('autorizações são distintas entre workspaces, não há grant implícito',async t=>{
  const {data,a,b}=await authorized(t);
  const aSnapshot=await extensionSnapshot(data,a);
  const bSnapshot=await extensionSnapshot(data,b);
  assert.equal(aSnapshot[0].grants.length,2);
  assert.deepEqual(bSnapshot[0].grants,[]);
  assert.equal(validateFlow(flowFor(),{extensions:bSnapshot}).valid,false);
});
test('execução supervisionada real grava somente em .omniforge/output, com histórico',async t=>{
  const {a,extensions}=await authorized(t);
  const result=await runSupervisedFlow(flowFor(),{
    workspace:a,dryRun:false,networkApproved:false,projects:[],extensions
  },{timeoutMs:10000});
  assert.equal(result.ok,true,result.error);
  assert.equal(result.steps.at(-1).status,'PASS');
  assert.equal(result.artifacts.length,1);
  assert.equal(result.artifacts[0].relativePath,'.omniforge/output/massa-convertida.json');
  assert.deepEqual(JSON.parse(await fs.readFile(
    path.join(a,'.omniforge','output','massa-convertida.json'),'utf8')),{massaGramas:1250});
  const receipt=await recordRunHistory(a,result);
  assert.equal(receipt.saved,true);
  const list=await listRunHistory(a);
  assert.equal(list.length,1);
  const stored=await readRunHistory(a,receipt.id);
  assert.equal(stored.ok,true);
  assert.equal(JSON.stringify(stored).includes('Aço inox'),false);
});
test('simulação executa transformações mas não grava arquivos',async t=>{
  const {a,extensions}=await authorized(t);
  const result=await runSupervisedFlow(flowFor(),{
    workspace:a,dryRun:true,networkApproved:false,projects:[],extensions
  },{timeoutMs:10000});
  assert.equal(result.ok,true,result.error);
  assert.equal(result.artifacts.length,1);
  assert.equal(result.artifacts[0].simulated,true);
  await assert.rejects(fs.stat(path.join(a,'.omniforge')),{code:'ENOENT'});
});
test('ação somente transformação não precisa nem solicita acesso a arquivo',async t=>{
  const {a,extensions}=await authorized(t,{write:false});
  const flow=flowFor(EXAMPLE_EXTENSION,'etiqueta-ordem');
  assert.equal(validateFlow(flow,{extensions}).valid,true);
  const result=await runSupervisedFlow(flow,{
    workspace:a,dryRun:false,networkApproved:false,projects:[],extensions
  },{timeoutMs:10000});
  assert.equal(result.ok,true,result.error);
  assert.deepEqual(result.artifacts,[]);
  await assert.rejects(fs.stat(path.join(a,'.omniforge')),{code:'ENOENT'});
});
test('revogação impede nova execução e não destrói arquivos anteriores',async t=>{
  const {data,a}=await authorized(t);
  const before=path.join(a,'.omniforge','output','massa-convertida.json');
  await fs.mkdir(path.dirname(before),{recursive:true});
  await fs.writeFile(before,'{"ok":true}');
  await setExtensionGrant(data,a,EXAMPLE_EXTENSION.id,'workspace.output.write',false);
  const extensions=await extensionSnapshot(data,a);
  assert.equal(validateFlow(flowFor(),{extensions}).valid,false);
  const result=await runSupervisedFlow(flowFor(),{
    workspace:a,dryRun:false,networkApproved:false,projects:[],extensions
  },{timeoutMs:10000});
  assert.equal(result.ok,false);
  assert.equal(result.stage,'validation');
  assert.equal(await fs.readFile(before,'utf8'),'{"ok":true}');
});
test('atualizar pacote revoga grants anteriores; alterações de versão são auditáveis',async t=>{
  const {data,a}=await authorized(t);
  const upgraded=clone(EXAMPLE_EXTENSION);
  upgraded.version='1.1.0';
  assert.throws(()=>validateExtensionManifest({...upgraded,extraKey:true}),/não reconhecido/);
  await assert.rejects(installExtension(data,upgraded),/Confirme a atualização/);
  const result=await installExtension(data,upgraded,{replace:true});
  assert.equal(result.wasUpgrade,true);
  assert.equal(result.enabled,false);
  assert.deepEqual((await extensionSnapshot(data,a))[0].grants,[]);
});
test('remover pacote não apaga documentos do usuário e invalida os nós antigos',async t=>{
  const {data,a}=await authorized(t);
  const out=path.join(a,'dados-do-usuario.txt');
  await fs.writeFile(out,'proteger');
  assert.deepEqual(await removeExtension(data,EXAMPLE_EXTENSION.id),{
    removed:true,id:EXAMPLE_EXTENSION.id
  });
  assert.deepEqual(await extensionSnapshot(data,a),[]);
  assert.equal(validateFlow(flowFor(),{extensions:[]}).valid,false);
  assert.equal(await fs.readFile(out,'utf8'),'proteger');
});
test('arquivo .ofx.json real, inválidos e symlink não instalam código arbitrário',async t=>{
  const {root}=await fixture(t);
  const source=path.join(root,'example.ofx.json');
  await fs.writeFile(source,JSON.stringify(EXAMPLE_EXTENSION));
  assert.deepEqual(await readExtensionFile(source),EXAMPLE_EXTENSION);
  await assert.rejects(readExtensionFile(path.join(root,'example.js')),/\.ofx\.json/);
  const bad=path.join(root,'bad.ofx.json');
  await fs.writeFile(bad,'not-a-json-manifest');
  await assert.rejects(readExtensionFile(bad),/UTF-8 válido/);
  const huge=path.join(root,'huge.ofx.json');
  await fs.writeFile(huge,' '.repeat(131073));
  await assert.rejects(readExtensionFile(huge),/128 KB/);
  const alias=path.join(root,'link.ofx.json');
  try {
    await fs.symlink(source,alias,'file');
    await assert.rejects(readExtensionFile(alias),/link simbólico/);
  } catch(e){if(!['EPERM','EACCES'].includes(e.code))throw e;}
});
test('registro adulterado é rejeitado, sem instalar ou autorizar silenciosamente',async t=>{
  const {data,a}=await authorized(t);
  const file=path.join(data,'extension-hub','extensions.json');
  const db=JSON.parse(await fs.readFile(file,'utf8'));
  db.installed[0].manifest.actions[0].outputFile='changed.json';
  await fs.writeFile(file,JSON.stringify(db),'utf8');
  await assert.rejects(listInstalledExtensions(data,a),/Integridade/);
  await assert.rejects(extensionSnapshot(data,a),/Integridade/);
});
test('registro em symlink é recusado, sem seguir arquivo redirecionado',async t=>{
  const {data,root}=await fixture(t);
  const parent=path.join(data,'extension-hub');
  await fs.mkdir(parent);
  const target=path.join(root,'outside.json');
  await fs.writeFile(target,JSON.stringify({schemaVersion:1,installed:[],grants:{}}));
  try{
    await fs.symlink(target,path.join(parent,'extensions.json'),'file');
  }catch(e){if(['EPERM','EACCES'].includes(e.code))return t.skip('Windows symlink não disponível');throw e;}
  await assert.rejects(listInstalledExtensions(data),/link/);
});
