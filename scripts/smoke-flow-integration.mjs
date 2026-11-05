/** Combined PR36+PR37 acceptance: native Windows process, real history/recovery/data tools. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {_electron as electron} from 'playwright-core';
import {exampleFlow} from '../core/modules/automation/catalog.mjs';
import {saveFlow} from '../core/modules/workspace/workspace.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const lab=await fs.mkdtemp(path.join(os.tmpdir(),'of-unified-e2e-'));
const workspace=path.join(lab,'workspace'),profile=path.join(lab,'profile'),artifacts=path.join(root,'smoke-artifacts');
await Promise.all([fs.mkdir(workspace),fs.mkdir(profile),fs.mkdir(artifacts,{recursive:true})]);
await saveFlow(workspace,exampleFlow(),null);
const source=path.join(workspace,'.omniforge','flows','principal.json'),original=await fs.readFile(source);
let app,page,phase='boot';const errors=[];
const watchdog=setTimeout(()=>{console.error('[UNIFIED FLOW] timeout',phase);process.exit(1);},180000);watchdog.unref();
const count=n=>page.waitForFunction(expected=>document.querySelectorAll('.react-flow__node').length===expected,n);
const draft=()=>page.evaluate(async()=>{const [p]=await window.omni.listProjects();return window.omni.readFlowDraft(p.path);});
const absent=()=>page.waitForFunction(async()=>{const [p]=await window.omni.listProjects();return (await window.omni.readFlowDraft(p.path))===null;});
const checkpoint=()=>page.getByTestId('flow-draft-saved').waitFor();
async function start(){
  app=await electron.launch({args:['.'],cwd:root,timeout:45000,env:{...process.env,OMNIFORGE_E2E:'1',OMNIFORGE_E2E_USER_DATA:profile,ELECTRON_RENDERER_URL:''}});
  page=await app.firstWindow();page.setDefaultTimeout(25000);page.on('pageerror',e=>errors.push(e.message));
  const actual=await app.evaluate(async({app,BrowserWindow,dialog,safeStorage},dir)=>{
    BrowserWindow.getAllWindows()[0].setSize(1440,900);dialog.showOpenDialog=async()=>({canceled:false,filePaths:[dir]});
    return {profile:app.getPath('userData'),encrypted:await safeStorage.isAsyncEncryptionAvailable()};
  },workspace);
  assert.equal(path.normalize(actual.profile).toLowerCase(),path.normalize(profile).toLowerCase());assert.equal(actual.encrypted,true);
  await page.getByTestId('workspace-overview').waitFor();
  await page.getByRole('button',{name:'Abrir projeto',exact:true}).click();await page.getByText('Projeto aberto:',{exact:false}).waitFor();
}
async function stop(){
  if(!app)return;const client=app;app=null;const child=client.process();
  const exited=new Promise(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',resolve);});
  await client.evaluate(({app})=>app.exit(0)).catch(()=>{});
  await Promise.race([exited,new Promise(resolve=>setTimeout(resolve,4000))]);if(child.exitCode===null)child.kill();
  await client.close().catch(()=>{});
}
async function save(){
  await page.getByRole('button',{name:'Salvar fluxo',exact:true}).click();
  await page.getByText('Fluxo gravado em',{exact:false}).waitFor();await absent();
}
try{
  await start();await count(3);
  assert.equal(await page.getByRole('navigation').count(),1);
  phase='duplicate, protect, undo to save and redo';
  await page.locator('.react-flow__node[data-id="selecionar"]').click();await page.getByTestId('flow-duplicate').click();await count(4);await checkpoint();
  assert.equal((await draft()).flow.nodes.length,4);assert.deepEqual(await fs.readFile(source),original);
  await page.getByTestId('flow-undo').click();await count(3);await absent();
  await page.getByTestId('flow-redo').click();await count(4);await checkpoint();
  phase='restart and block every authoring path until recovery decision';
  await stop();await start();await count(3);await page.getByTestId('flow-recovery').waitFor();
  for(const id of ['flow-undo','flow-redo','flow-duplicate','flow-delete','flow-arrange'])
    assert.equal(await page.getByTestId(id).isDisabled(),true,id+' must be blocked');
  await page.keyboard.press('Control+d');await page.keyboard.press('Delete');await count(3);
  assert.deepEqual(await page.evaluate(()=>window.omni.listRunHistory()),[]);
  await page.screenshot({path:path.join(artifacts,'flow-unified-recovery-1440.png')});
  phase='restore creates undo entry against original, not a second competing state';
  await page.getByTestId('flow-restore-draft').click();await page.getByText('Fluxo restaurado no editor.',{exact:false}).waitFor();await count(4);
  await page.getByTestId('flow-undo').click();await count(3);await absent();assert.deepEqual(await fs.readFile(source),original);
  await page.getByTestId('flow-redo').click();await count(4);await checkpoint();await save();
  assert.equal(JSON.parse(await fs.readFile(source,'utf8')).nodes.length,4);
  phase='new data template survives restart and executes only on explicit consent';
  await page.evaluate(()=>{window.confirm=()=>true;});
  await page.getByTestId('primary-sidebar').getByRole('button',{name:'Modelos de fluxo',exact:true}).click();
  await page.locator('article').filter({hasText:'Preparar registros'}).getByRole('button',{name:'Usar modelo'}).click();await count(5);await checkpoint();
  assert.equal((await draft()).flow.name,'Preparar registros');assert.deepEqual(await page.evaluate(()=>window.omni.listRunHistory()),[]);
  await stop();await start();await count(4);await page.getByTestId('flow-restore-draft').click();await count(5);
  await page.getByText('Fluxo restaurado no editor.',{exact:false}).waitFor();await save();
  assert.equal(JSON.parse(await fs.readFile(source,'utf8')).name,'Preparar registros');
  await page.getByRole('button',{name:'▶ Executar',exact:true}).click();await page.getByText('Execução real concluída.',{exact:false}).waitFor();
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(workspace,'.omniforge/output/registros.json'),'utf8')),[{codigo:1,total:120},{codigo:2,total:80}]);
  assert.ok(await page.locator('.graph-node__state--PASS').count()>0,'Canvas shows actual successful node states');
  phase='review combined inspector at desktop and compact sizes';
  await page.getByTestId('flow-fit').click();await page.screenshot({path:path.join(artifacts,'flow-unified-1440.png')});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1280,800));
  await page.screenshot({path:path.join(artifacts,'flow-unified-1280.png')});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2),false);
  phase='full name contract remains recoverable';
  await page.locator('.react-flow__pane').click({position:{x:10,y:10}});
  await page.getByRole('tab',{name:'Propriedades',exact:true}).click();
  await page.getByLabel('Nome do fluxo',{exact:true}).fill('N'.repeat(120));await page.getByLabel('Nome do fluxo',{exact:true}).press('Tab');await checkpoint();
  assert.equal((await draft()).flow.name.length,120);await save();assert.equal(JSON.parse(await fs.readFile(source,'utf8')).name.length,120);
  assert.deepEqual(errors,[]);
  console.log('PASS unified flows: one state, protected restart, undo/redo of restore, native save, data tools, explicit execution, 120-char names and compact UI.');
}catch(error){
  console.error('[UNIFIED FLOW] phase='+phase,error);process.exitCode=1;
  await page?.screenshot({path:path.join(artifacts,'flow-unified-failure.png')}).catch(()=>{});
  await fs.writeFile(path.join(artifacts,'flow-unified-failure.json'),JSON.stringify({phase,errors,message:error.message},null,2));
}finally{await stop();clearTimeout(watchdog);await fs.rm(lab,{recursive:true,force:true,maxRetries:3,retryDelay:100}).catch(()=>{});process.exit(process.exitCode||0);}
