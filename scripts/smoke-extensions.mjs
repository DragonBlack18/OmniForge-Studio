/** Windows E2E: real Electron renderer, native package actions and actual worker writes. */
import { _electron as electron } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const lab=await fs.mkdtemp(path.join(os.tmpdir(),'omniforge-ext-e2e-'));
const workspace=path.join(lab,'workspace');
const profile=path.join(lab,'profile');
const pkg=path.join(lab,'external.ofx.json');
await Promise.all([fs.mkdir(workspace),fs.mkdir(profile)]);
const source=JSON.parse(await fs.readFile(path.join(root,'examples','engenharia.ofx.json'),'utf8'));
await fs.writeFile(pkg,JSON.stringify(source));
let client;
const watchdog=setTimeout(()=>{
  console.error('[EXT E2E] 160s global timeout exceeded.');
  process.exit(1);
},160000);
watchdog.unref();
const entry=(actionId='kg-para-gramas',payload={massaKg:1.25})=>({
  schemaVersion:1,name:'E2E extensões v0.3',nodes:[
    {id:'start',type:'trigger.manual',position:{x:0,y:0},config:{payload:JSON.stringify(payload)}},
    {id:'ext',type:'extension.call',position:{x:200,y:0},
      config:{extensionId:'br.omniforge.engenharia',actionId}}
  ],edges:[{id:'wire',source:'start',target:'ext',sourceHandle:'out',targetHandle:'in'}]
});
let phase='boot';
try {
  client=await electron.launch({
    args:['.'],cwd:root,timeout:45000,
    env:{...process.env,OMNIFORGE_E2E:'1',OMNIFORGE_E2E_USER_DATA:profile,ELECTRON_RENDERER_URL:''}
  });
  const page=await client.firstWindow({timeout:45000});
  page.setDefaultTimeout(18000);
  page.on('pageerror',error=>console.error('[EXT Renderer]',error.message));
  const actualProfile=await client.evaluate(({app})=>app.getPath('userData'));
  assert.equal(path.normalize(actualProfile).toLowerCase(),path.normalize(profile).toLowerCase());
  await client.evaluate(({dialog},{workspace,pkg})=>{
    dialog.showOpenDialog=async (_win,options)=>({
      canceled:false,filePaths:[String(options?.title||'').includes('extensão declarativa')?pkg:workspace]
    });
    dialog.showMessageBox=async()=>({response:1});
  },{workspace,pkg});
  await page.getByText('OMNIFORGE',{exact:false}).first().waitFor();
  await page.getByRole('button',{name:'Abrir projeto'}).click();
  await page.getByText('Projeto aberto:',{exact:false}).waitFor();
  phase='install-builtin';
  await page.getByRole('button',{name:'Central de extensões'}).click();
  await page.getByTestId('extension-hub').waitFor();
  assert.equal((await page.evaluate(()=>window.omni.listExtensions())).length,0);
  await page.getByTestId('extension-install-example').click();
  await page.getByText('Exemplo funcional instalado.',{exact:false}).waitFor();
  const list1=await page.evaluate(()=>window.omni.listExtensions());
  assert.equal(list1.length,1);
  assert.equal(list1[0].enabled,false);
  assert.deepEqual(list1[0].granted,[]);
  await page.getByRole('button',{name:'Detalhes de Engenharia de dados'}).click();
  await page.getByRole('button',{name:'Ativar',exact:true}).click();
  await page.getByText('Extensão ativada.',{exact:false}).waitFor();
  phase='grants';
  const readonly=entry('etiqueta-ordem',{ordem:'123',material:'Inox'});
  const denied=await page.evaluate(flow=>window.omni.validateFlow(flow),readonly);
  assert.equal(denied.valid,false);
  await page.getByRole('checkbox',{name:/Transformar dados nos fluxos/}).check();
  await page.getByText('Permissão autorizada neste workspace.',{exact:false}).waitFor();
  const validateRead=await page.evaluate(flow=>window.omni.validateFlow(flow),readonly);
  assert.equal(validateRead.valid,true,validateRead.errors.join(';'));
  const executed=await page.evaluate(flow=>window.omni.executeFlow(flow,false),readonly);
  assert.equal(executed.ok,true,executed.error);
  assert.deepEqual(executed.artifacts,[]);
  const writeFlow=entry();
  const blocked=await page.evaluate(flow=>window.omni.validateFlow(flow),writeFlow);
  assert.equal(blocked.valid,false);
  await page.getByRole('checkbox',{name:/Gravar JSON na saída do projeto/}).check();
  await page.getByText('Permissão autorizada neste workspace.',{exact:false}).waitFor();
  phase='write-and-history';
  const approved=await page.evaluate(flow=>window.omni.validateFlow(flow),writeFlow);
  assert.equal(approved.valid,true,approved.errors.join(';'));
  const result=await page.evaluate(flow=>window.omni.executeFlow(flow,false),writeFlow);
  assert.equal(result.ok,true,result.error);
  assert.equal(result.artifacts[0].relativePath,'.omniforge/output/massa-convertida.json');
  const outputFile=path.join(workspace,'.omniforge','output','massa-convertida.json');
  assert.deepEqual(JSON.parse(await fs.readFile(outputFile,'utf8')),{massaGramas:1250});
  const history=await page.evaluate(()=>window.omni.listRunHistory());
  assert.ok(history.length>=2);
  phase='real-package-and-revoke';
  await page.getByTestId('extension-install').click();
  await page.getByText('Extensão instalada desativada.',{exact:false}).waitFor();
  assert.equal((await page.evaluate(()=>window.omni.listExtensions())).length,1);
  // Invariant: installing the identical manifest must not change current grants.
  assert.equal((await page.evaluate(()=>window.omni.listExtensions()))[0].granted.length,2);
  // Add the real configured node via the Extension Hub.
  await page.getByRole('button',{name:'Adicionar ao fluxo'}).first().click();
  await page.getByRole('button',{name:'Arquitetura visual'}).waitFor();
  const uiNodeCount=await page.locator('.graph-node').count();
  assert.ok(uiNodeCount>=4,'Ação deve inserir um nó real no editor visual.');
  const typed=await page.evaluate(()=>
    [...document.querySelectorAll('.graph-node__title')].map(e=>e.textContent));
  assert.ok(typed.some(x=>x.includes('Executar extensão local')));
  // Return to Extension Hub: revoke write; existing data must remain.
  await page.getByRole('button',{name:'Central de extensões'}).click();
  await page.getByRole('checkbox',{name:/Gravar JSON na saída do projeto/}).uncheck();
  await page.getByText('Permissão revogada neste workspace.',{exact:false}).waitFor();
  const revoked=await page.evaluate(flow=>window.omni.validateFlow(flow),writeFlow);
  assert.equal(revoked.valid,false);
  assert.deepEqual(JSON.parse(await fs.readFile(outputFile,'utf8')),{massaGramas:1250});
  await page.getByRole('button',{name:'Desinstalar extensão'}).click();
  await page.getByText('Extensão desinstalada.',{exact:false}).waitFor();
  assert.equal((await page.evaluate(()=>window.omni.listExtensions())).length,0);
  assert.deepEqual(JSON.parse(await fs.readFile(outputFile,'utf8')),{massaGramas:1250});
  phase='pass';
  console.log('PASS Extension Hub Electron E2E: native install, actual execution, workspace grants, reversible revocation and intact files.');
} catch(error) {
  console.error('[EXT E2E] failed at '+phase,error);
  process.exitCode=1;
} finally {
  if(client){
    try{
      const child=client.process();
      if(child && child.exitCode===null)child.kill();
      await Promise.race([client.close().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,3000))]);
    }catch{}
  }
  await fs.rm(lab,{recursive:true,force:true}).catch(()=>{});
  clearTimeout(watchdog);
  if(process.exitCode)process.exit(process.exitCode);
}
