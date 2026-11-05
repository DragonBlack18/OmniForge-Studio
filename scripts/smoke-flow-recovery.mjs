import { waitForPageState } from './lib/wait-for-state.mjs';
/** Real Windows Electron: OS-encrypted draft, complete process restart, restore,
 * explicit save, conflict, consent, filesystem integrity and no auto execution. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import { exampleFlow } from '../core/modules/automation/catalog.mjs';
import { saveFlow } from '../core/modules/workspace/workspace.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const lab=await fs.mkdtemp(path.join(os.tmpdir(),'of-flow-recovery-e2e-'));
const workspace=path.join(lab,'workspace'),profile=path.join(lab,'profile');
await Promise.all([fs.mkdir(workspace),fs.mkdir(profile)]);
const original=exampleFlow();original.nodes[0].config.payload='{"secret":"TEST_VALUE_NOT_FOR_PLAINTEXT_STORAGE"}';
await saveFlow(workspace,original,null);
const FLOW=path.join(workspace,'.omniforge','flows','principal.json');
const initialBytes=await fs.readFile(FLOW);
let client,page,phase='boot';const errors=[];
const watchdog=setTimeout(()=>{console.error('[FLOW RECOVERY] timeout',phase);process.exit(1);},180000);watchdog.unref();
async function start() {
  client=await electron.launch({args:['.'],cwd:root,timeout:45000,
    env:{...process.env,OMNIFORGE_E2E:'1',OMNIFORGE_E2E_USER_DATA:profile,ELECTRON_RENDERER_URL:''}});
  page=await client.firstWindow({timeout:45000});page.setDefaultTimeout(25000);
  page.on('pageerror',e=>errors.push(e.message));
  const native=await client.evaluate(async({app,safeStorage,dialog,BrowserWindow},folder)=>{
    BrowserWindow.getAllWindows()[0].setSize(1440,900);
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});
    return {profile:app.getPath('userData'),encryption:await safeStorage.isAsyncEncryptionAvailable()};
  },workspace);
  assert.equal(path.normalize(native.profile).toLowerCase(),path.normalize(profile).toLowerCase());
  assert.equal(native.encryption,true,'Native OS encryption is required; no plaintext fallback.');
  await page.getByTestId('workspace-overview').waitFor();
}
async function open() {
  await page.getByRole('button',{name:'Abrir projeto',exact:true}).click();
  await page.getByText('Projeto aberto:',{exact:false}).waitFor();
  await page.locator('.react-flow__node').first().waitFor();
}
async function draft() {
  return page.evaluate(async()=>{
    const projects=await window.omni.listProjects();
    return window.omni.readFlowDraft(projects[0].path);
  });
}
async function checkpoint() {
  await page.getByTestId('flow-draft-saved').waitFor();
  return draft();
}
async function add() {
  const n=await page.locator('.react-flow__node').count();
  await page.locator('.catalog-item').first().click();
  await page.waitForFunction(expected=>document.querySelectorAll('.react-flow__node').length===expected,n+1);
}
async function stop() {
  if(!client)return;
  const app=client;client=null;
  const child=app.process();
  const exited=new Promise(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',resolve);});
  await app.evaluate(({app})=>app.exit(0)).catch(()=>{});
  await Promise.race([exited,new Promise(resolve=>setTimeout(resolve,4000))]);
  if(child.exitCode===null)child.kill();
  await app.close().catch(()=>{});
}
try {
  await start();await open();
  phase='real edit creates only encrypted checkpoint';
  await add();const first=await checkpoint();assert.equal(first.flow.nodes.length,4);
  assert.deepEqual(await fs.readFile(FLOW),initialBytes);
  const records=await fs.readdir(path.join(profile,'flow-recovery'));
  assert.equal(records.filter(n=>n.endsWith('.oflow')).length,1);
  const bytes=await fs.readFile(path.join(profile,'flow-recovery',records.find(n=>n.endsWith('.oflow'))));
  assert.equal(bytes.includes(Buffer.from('TEST_VALUE_NOT_FOR_PLAINTEXT_STORAGE')),false);
  assert.equal(bytes.includes(Buffer.from('"nodes"')),false);
  assert.deepEqual(await page.evaluate(()=>window.omni.listRunHistory()),[]);

  phase='complete process restart offers manual restoration';
  await stop();await start();await open();
  await page.getByTestId('flow-recovery').waitFor();
  assert.equal(await page.locator('.react-flow__node').count(),3);
  assert.equal(await page.getByRole('button',{name:'Salvar fluxo',exact:true}).isEnabled(),false);
  assert.equal(await page.getByRole('button',{name:'▶ Executar',exact:true}).isEnabled(),false);
  assert.deepEqual(await fs.readFile(FLOW),initialBytes);
  await page.getByRole('button',{name:'Inspecionar JSON',exact:true}).click();
  assert.equal(JSON.parse(await page.getByLabel('JSON do fluxo recuperável').inputValue()).nodes.length,4);
  await fs.mkdir(path.join(root,'smoke-artifacts'),{recursive:true});
  await page.screenshot({path:path.join(root,'smoke-artifacts','flow-recovery-v079.png')});
  await page.getByTestId('flow-restore-draft').click();
  await page.getByText('Fluxo restaurado no editor.',{exact:false}).waitFor();
  assert.equal(await page.locator('.react-flow__node').count(),4);
  assert.deepEqual(await fs.readFile(FLOW),initialBytes);
  assert.notEqual(await draft(),null);

  phase='explicit save persists restored flow then clears only its checkpoint';
  await page.getByRole('button',{name:'Salvar fluxo',exact:true}).click();
  await page.getByText('Fluxo gravado em',{exact:false}).waitFor();
  await waitForPageState(page, async()=>{const p=await window.omni.listProjects();return (await window.omni.readFlowDraft(p[0].path))===null;});
  const stored=JSON.parse(await fs.readFile(FLOW,'utf8'));assert.equal(stored.nodes.length,4);

  phase='save before debounce cannot leave a stale checkpoint';
  await add();await page.getByRole('button',{name:'Salvar fluxo',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.topbar-save')?.disabled);
  await new Promise(resolve=>setTimeout(resolve,1200)); // Deliberate quiescence across the 900ms debounce.
  assert.equal(await draft(),null);assert.equal(JSON.parse(await fs.readFile(FLOW,'utf8')).nodes.length,5);

  phase='external file change blocks restore without losing either version';
  await add();const pending=await checkpoint();assert.equal(pending.flow.nodes.length,6);
  const external={...JSON.parse(await fs.readFile(FLOW,'utf8')),name:'EXTERNAL_DO_NOT_OVERWRITE'};
  const externalBytes=Buffer.from(JSON.stringify(external,null,2)+'\n');await fs.writeFile(FLOW,externalBytes);
  await page.reload();await page.getByTestId('workspace-overview').waitFor();await open();
  await page.getByText('Conflito com o fluxo salvo',{exact:true}).waitFor();
  assert.equal(await page.getByTestId('flow-restore-draft').isEnabled(),false);
  assert.deepEqual(await fs.readFile(FLOW),externalBytes);
  await page.getByRole('button',{name:'Inspecionar JSON',exact:true}).click();
  assert.equal(JSON.parse(await page.getByLabel('JSON do fluxo recuperável').inputValue()).nodes.length,6);
  await page.evaluate(()=>{window.confirm=()=>false;});
  await page.getByRole('button',{name:'Descartar cópia',exact:true}).click();assert.notEqual(await draft(),null);
  await page.evaluate(()=>{window.confirm=()=>true;});
  await page.getByRole('button',{name:'Descartar cópia',exact:true}).click();
  await page.getByText('Cópia de recuperação do fluxo descartada; original preservado.',{exact:true}).waitFor();
  assert.equal(await draft(),null);assert.deepEqual(await fs.readFile(FLOW),externalBytes);
  await assert.rejects(page.evaluate(()=>window.omni.readFlowDraft('C:/not-the-active-project')),/Workspace alterado/);
  assert.deepEqual(await page.evaluate(()=>window.omni.listRunHistory()),[]);
  await assert.rejects(fs.stat(path.join(workspace,'.omniforge','output')),{code:'ENOENT'});
  assert.deepEqual(errors,[]);
  console.log('PASS flow recovery: native encryption, process restart, explicit restore/save, debounce, external conflict and no execution.');
} catch(error) {
  console.error('[FLOW RECOVERY] phase='+phase,error);
  await fs.mkdir(path.join(root,'smoke-artifacts'),{recursive:true});
  await page?.screenshot({path:path.join(root,'smoke-artifacts','flow-recovery-failure.png')}).catch(()=>{});
  process.exitCode=1;
} finally {
  await stop();clearTimeout(watchdog);
  await fs.rm(lab,{recursive:true,force:true,maxRetries:3,retryDelay:100}).catch(()=>{});
  process.exit(process.exitCode||0);
}
