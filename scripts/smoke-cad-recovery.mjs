/** Real Electron CAD recovery: renderer crash reload, non-destructive restore and external conflict. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const lab=await fs.mkdtemp(path.join(os.tmpdir(),'omni-cad-recovery-e2e-'));
const workspace=path.join(lab,'workspace'),profile=path.join(lab,'profile');
await Promise.all([fs.mkdir(workspace),fs.mkdir(profile)]);
const CAD=path.join(workspace,'.omniforge','cad','sketch.json');
let client,page,phase='boot';
const watchdog=setTimeout(()=>{console.error('[CAD RECOVERY E2E] watchdog phase='+phase);process.exit(1);},150000);
watchdog.unref();

async function openCad(){
  await page.getByRole('button',{name:'Abrir projeto'}).click();
  await page.getByText('Projeto aberto:',{exact:false}).waitFor();
  await page.getByRole('button',{name:'CAD Sketch 2D'}).click();
  await page.getByTestId('cad-workbench').waitFor();
}
async function readDraft(){
  return page.evaluate(async()=>{
    const projects=await window.omni.listProjects();
    if(projects.length!==1)throw Error('E2E CAD deve usar somente um projeto.');
    return window.omni.readCadDraft(projects[0].path);
  });
}
async function addLayer(name){
  await page.getByRole('textbox',{name:'Nome da nova camada'}).fill(name);
  await page.getByRole('button',{name:'+ Criar'}).click();
  await page.getByText('Camada criada: '+name,{exact:false}).waitFor();
}
try{
  client=await electron.launch({
    args:['.'],cwd:root,timeout:45000,
    env:{...process.env,OMNIFORGE_E2E:'1',OMNIFORGE_E2E_USER_DATA:profile,ELECTRON_RENDERER_URL:''}
  });
  page=await client.firstWindow({timeout:45000});
  page.setDefaultTimeout(20000);
  page.on('pageerror',err=>console.error('[CAD RECOVERY renderer]',err.name,err.message));
  const actual=await client.evaluate(({app})=>app.getPath('userData'));
  assert.equal(path.normalize(actual).toLowerCase(),path.normalize(profile).toLowerCase());
  await client.evaluate(({dialog},folder)=>{
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});
  },workspace);

  phase='draft must survive independently without creating CAD source file';
  await openCad();
  await addLayer('E2E_RECOVERY_UNSAVED_A');
  await page.getByTestId('cad-draft-saved').waitFor();
  const first=await readDraft();
  assert.equal(first.baseRevision,null);
  assert.ok(first.sketch.layers.some(layer=>layer.name==='E2E_RECOVERY_UNSAVED_A'));
  assert.match(first.draftRevision,/^[a-f0-9]{64}$/);
  await assert.rejects(fs.stat(CAD),{code:'ENOENT'});

  phase='reload must offer explicit restoration, not overwrite source';
  await page.reload();
  await openCad();
  await page.getByTestId('cad-recovery').waitFor();
  await page.getByText('Rascunho CAD recuperável').waitFor();
  await assert.rejects(fs.stat(CAD),{code:'ENOENT'});
  await page.getByTestId('cad-restore-draft').click();
  assert.equal(await page.getByTestId('cad-save').isEnabled(),true);
  await page.getByTestId('cad-save').click();
  await page.getByText('Desenho salvo:',{exact:false}).waitFor();
  await page.waitForFunction(async()=>{
    const projects=await window.omni.listProjects();
    return (await window.omni.readCadDraft(projects[0].path))===null;
  });
  const stored=JSON.parse(await fs.readFile(CAD,'utf8'));
  assert.ok(stored.layers.some(layer=>layer.name==='E2E_RECOVERY_UNSAVED_A'));

  phase='external source revision changes must block automatic restoration';
  await addLayer('E2E_RECOVERY_UNSAVED_B');
  await page.getByTestId('cad-draft-saved').waitFor();
  const second=await readDraft();
  assert.ok(second.sketch.layers.some(layer=>layer.name==='E2E_RECOVERY_UNSAVED_B'));
  const outside={...stored,name:'EXTERNAL_DO_NOT_OVERWRITE'};
  await fs.writeFile(CAD,JSON.stringify(outside,null,2)+'\n');
  await page.reload();
  await openCad();
  await page.getByTestId('cad-recovery').waitFor();
  await page.getByText('Conflito: desenho CAD alterado externamente').waitFor();
  assert.equal(await page.getByTestId('cad-restore-draft').count(),0);
  await page.getByRole('button',{name:'Visualizar JSON recuperável'}).click();
  assert.match(await page.getByRole('textbox',{name:'JSON do rascunho CAD'}).inputValue(),/E2E_RECOVERY_UNSAVED_B/);
  assert.equal((await fs.readFile(CAD,'utf8')).includes('EXTERNAL_DO_NOT_OVERWRITE'),true);

  phase='decline then accept explicit discard without touching original';
  await page.evaluate(()=>{window.confirm=()=>false;});
  await page.getByRole('button',{name:'Descartar rascunho CAD'}).click();
  assert.notEqual(await readDraft(),null);
  await page.evaluate(()=>{window.confirm=()=>true;});
  await page.getByRole('button',{name:'Descartar rascunho CAD'}).click();
  await page.getByText('Cópia de recuperação CAD descartada',{exact:false}).waitFor();
  assert.equal(await readDraft(),null);
  assert.equal(JSON.parse(await fs.readFile(CAD,'utf8')).name,'EXTERNAL_DO_NOT_OVERWRITE');

  phase='foreign workspace cannot read recovery through renderer IPC';
  await assert.rejects(page.evaluate(()=>window.omni.readCadDraft('C:/forged-workspace')),/Workspace alterado/);
  console.log('PASS CAD recovery E2E: real edits, local checkpoint, reload, explicit save, conflict and discard.');
  phase='pass';
}catch(error){
  console.error('[CAD RECOVERY E2E] phase='+phase,error);
  process.exitCode=1;
}finally{
  if(client){
    try{
      const child=client.process();
      if(child && child.exitCode===null)child.kill();
      await Promise.race([client.close().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,3000))]);
    }catch{}
  }
  await fs.rm(lab,{recursive:true,force:true}).catch(()=>{});
  clearTimeout(watchdog);
  process.exit(process.exitCode||0);
}
