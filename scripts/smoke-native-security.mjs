/** Real Electron security and diagnostics E2E, isolated profile and disposable files. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const lab=await fs.mkdtemp(path.join(os.tmpdir(),'omni-native-security-'));
const profile=path.join(lab,'profile'),workspace=path.join(lab,'workspace'),reportFile=path.join(lab,'report.json');
await Promise.all([fs.mkdir(profile),fs.mkdir(workspace)]);
let app,page,phase='launch';
const errors=[];
const timer=setTimeout(()=>{console.error('NATIVE SECURITY timeout:',phase);process.exit(1);},150_000);timer.unref();
try {
  app=await electron.launch({args:['.'],cwd:root,timeout:45_000,
    env:{...process.env,OMNIFORGE_E2E:'1',OMNIFORGE_E2E_USER_DATA:profile,ELECTRON_RENDERER_URL:''}});
  page=await app.firstWindow({timeout:45_000});page.setDefaultTimeout(20_000);
  page.on('pageerror',e=>errors.push(e.message));
  await page.getByTestId('workspace-overview').waitFor();
  assert.equal(path.normalize(await app.evaluate(({app})=>app.getPath('userData'))).toLowerCase(),path.normalize(profile).toLowerCase());
  phase='native policy and protected document';
  const report=await page.evaluate(()=>window.omni.runtimeDiagnostics());
  for(const key of ['sandbox','contextIsolation','nodeIntegrationDisabled','webSecurity'])assert.equal(report.protections[key],true,key);
  const csp=await page.evaluate(async()=> (await fetch('omni://app/')).headers.get('content-security-policy'));
  assert.ok(csp.includes("connect-src 'self';")&&!csp.includes('127.0.0.1'));
  assert.equal(await page.evaluate(async()=> (await fetch('omni://app/secret%3Adata')).status),403);
  await assert.rejects(page.evaluate(()=>window.omni.setUnsavedChanges('界'.repeat(740_000))),/Payload/);
  assert.equal(await page.evaluate(()=>window.omni.setUnsavedChanges(false)),true);
  phase='permission checks';
  const permissions=await page.evaluate(async()=>{
    const result={};for(const name of ['geolocation','notifications','camera','microphone']){
      try{result[name]=(await navigator.permissions.query({name})).state;}catch{result[name]='unsupported';}
    }return result;
  });
  for(const value of Object.values(permissions))assert.ok(['denied','unsupported'].includes(value));
  phase='diagnostic UI and explicit no-overwrite export';
  await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},reportFile);
  await page.getByRole('button',{name:'Abrir diagnóstico local',exact:true}).click();
  await page.getByRole('dialog',{name:'Diagnóstico local',exact:true}).waitFor();
  await page.getByRole('button',{name:'Exportar JSON',exact:true}).click();
  await page.getByText('Relatório exportado.',{exact:true}).waitFor();
  const bytes=await fs.readFile(reportFile,'utf8'),exported=JSON.parse(bytes);
  assert.equal(exported.application.version,'0.8.0');
  assert.ok(!bytes.includes(lab)&&!bytes.includes('OMNIFORGE_E2E'));
  await page.getByRole('button',{name:'Exportar JSON',exact:true}).click();
  await page.getByText('O arquivo já existe.',{exact:false}).waitFor();
  assert.equal(await fs.readFile(reportFile,'utf8'),bytes);
  await fs.mkdir(path.join(root,'smoke-artifacts'),{recursive:true});
  await page.screenshot({path:path.join(root,'smoke-artifacts','native-diagnostics-v080.png')});
  await page.getByRole('button',{name:'Fechar diagnóstico',exact:true}).click();
  phase='native operation exclusion and safe close';
  await app.evaluate(({dialog})=>{
    globalThis.__omniPendingChooser=null;
    dialog.showOpenDialog=()=>new Promise(resolve=>{globalThis.__omniPendingChooser=resolve;});
    dialog.showMessageBox=async()=>({response:0});
  });
  await page.evaluate(()=>{window.__choosing=window.omni.selectWorkspace();});
  await page.waitForFunction(async()=> (await window.omni.runtimeDiagnostics()).operations.registry);
  await assert.rejects(page.evaluate(()=>window.omni.executeFlow({},false)),/operação atual/);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),1);
  await app.evaluate(()=>{globalThis.__omniPendingChooser({canceled:true,filePaths:[]});delete globalThis.__omniPendingChooser;});
  await page.evaluate(()=>window.__choosing);
  await page.waitForFunction(async()=> !(await window.omni.runtimeDiagnostics()).operations.registry);
  assert.deepEqual(await fs.readdir(workspace),[]);
  assert.deepEqual(errors,[]);
  console.log('PASS native security: real IPC quota, CSP, permissions, privacy, export, operation exclusion and close guard.');
}catch(error){console.error('NATIVE SECURITY FAIL phase='+phase,error);process.exitCode=1;}
finally{
  if(app){try{const p=app.process();if(p&&p.exitCode===null)p.kill();await Promise.race([app.close().catch(()=>{}),new Promise(r=>setTimeout(r,2200))]);}catch{}}
  await fs.rm(lab,{recursive:true,force:true}).catch(()=>{});clearTimeout(timer);process.exit(process.exitCode||0);
}
