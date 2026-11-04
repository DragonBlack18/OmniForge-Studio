/**
 * v0.7.6 Windows Electron end-to-end.
 * Verify real React Flow drag/change utilities remain functional after they
 * move out of the initial bundle. Saved flow remains untouched until Save.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const lab=await fs.mkdtemp(path.join(os.tmpdir(),'omni-lazy-flow-e2e-'));
const workspace=path.join(lab,'workspace'),profile=path.join(lab,'profile');
await Promise.all([fs.mkdir(workspace),fs.mkdir(profile)]);
const flowPath=path.join(workspace,'.omniforge','flows','principal.json');
let client,page,phase='boot';
const watchdog=setTimeout(()=>{
  console.error('[FLOW SESSION E2E] TIMEOUT phase='+phase);process.exit(1);
},160000);
watchdog.unref();
function snapshot() {
  return page.locator('.react-flow__node').count();
}
try {
  client=await electron.launch({
    args:['.'],cwd:root,timeout:45000,
    env:{...process.env,OMNIFORGE_E2E:'1',OMNIFORGE_E2E_USER_DATA:profile,
      ELECTRON_RENDERER_URL:''}
  });
  page=await client.firstWindow({timeout:45000});
  page.setDefaultTimeout(20000);
  page.on('pageerror',err=>console.error('[FLOW SESSION renderer]',err.message));
  const isolated=await client.evaluate(({app})=>app.getPath('userData'));
  assert.equal(path.normalize(isolated).toLowerCase(),path.normalize(profile).toLowerCase());
  await client.evaluate(({dialog},directory)=>{
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[directory]});
  },workspace);

  phase='cold home loads no graph engine chunk';
  await page.getByTestId('workspace-overview').waitFor();
  const before = await page.evaluate(()=>performance.getEntriesByType('resource')
    .some(item=>/FlowCanvas-[^/]+\.js/i.test(item.name)));
  assert.equal(before,false,'Home carregou FlowCanvas antes de abrir automações.');

  phase='open actual project and save initial real flow';
  await page.getByRole('button',{name:'Abrir projeto'}).click();
  await page.getByText('Projeto aberto:',{exact:false}).waitFor();
  await page.locator('.react-flow__node').first().waitFor();
  const initialCount=await snapshot();
  assert.ok(initialCount>=3,'Dados reais do fluxo inicial devem aparecer no canvas.');
  await page.getByRole('button',{name:'Salvar fluxo'}).click();
  await page.getByText('Fluxo gravado em',{exact:false}).waitFor();
  const originalBytes=await fs.readFile(flowPath);
  const original=JSON.parse(originalBytes.toString());
  assert.equal(original.nodes.length,initialCount);

  phase='edit flow and leave canvas without losing uncommitted state';
  await page.locator('.catalog-item').first().click();
  await page.waitForFunction(expected=>
    document.querySelectorAll('.react-flow__node').length===expected,initialCount+1);
  assert.equal(await snapshot(),initialCount+1);
  assert.deepEqual(await fs.readFile(flowPath),originalBytes,'Adicionar nó não pode salvar automaticamente.');
  await page.getByRole('button',{name:'CAD Sketch 2D'}).click();
  await page.getByTestId('cad-workbench').waitFor();
  await page.getByRole('button',{name:'Visão geral'}).click();
  await page.getByTestId('workspace-overview').waitFor();
  await page.getByText('Edições pendentes',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Editor de código'}).click();
  await page.getByRole('button',{name:'Arquitetura visual'}).click();
  await page.waitForFunction(expected=>
    document.querySelectorAll('.react-flow__node').length===expected,initialCount+1);
  assert.deepEqual(await fs.readFile(flowPath),originalBytes,
    'Mudar de ferramentas não pode sobrescrever o fluxo.');

  phase='persist the edited graph explicitly and verify real filesystem';
  await page.getByRole('button',{name:'Salvar fluxo'}).click();
  await page.getByText('Fluxo gravado em',{exact:false}).waitFor();
  const modified=JSON.parse(await fs.readFile(flowPath,'utf8'));
  assert.equal(modified.nodes.length,initialCount+1);
  assert.deepEqual(modified.edges,original.edges);

  phase='read-back after workspace reload and ensure no data loss';
  await page.reload();
  await page.getByTestId('workspace-overview').waitFor();
  await page.getByRole('button',{name:'Abrir projeto'}).click();
  await page.getByText('Projeto aberto:',{exact:false}).waitFor();
  await page.waitForFunction(expected=>
    document.querySelectorAll('.react-flow__node').length===expected,initialCount+1);

  phase='record workbench artifact';
  await fs.mkdir(path.join(root,'smoke-artifacts'),{recursive:true});
  await page.screenshot({path:path.join(root,'smoke-artifacts','lazy-flow-v076.png')});
  assert.equal(JSON.parse(await fs.readFile(flowPath,'utf8')).nodes.length,initialCount+1);
  console.log('PASS lazy Flow runtime E2E: cold-home chunk isolation, real controlled flow changes, unsaved navigation and persistence.');
  phase='pass';
} catch(error) {
  console.error('[FLOW SESSION E2E] phase='+phase,error);
  process.exitCode=1;
} finally {
  if(client) {
    try {
      const process=client.process();
      if(process && process.exitCode===null)process.kill();
      await Promise.race([client.close().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,3000))]);
    }catch{}
  }
  await fs.rm(lab,{recursive:true,force:true}).catch(()=>{});
  clearTimeout(watchdog);
  process.exit(process.exitCode||0);
}
