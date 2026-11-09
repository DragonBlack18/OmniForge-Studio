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
    globalThis.lazyFlowPickerCount=0;
    dialog.showOpenDialog=async()=>{
      globalThis.lazyFlowPickerCount++;
      return {canceled:false,filePaths:[directory]};
    };
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
  // omni:// resources need not appear in Chromium Resource Timing. Inspect
  // the emitted production manifest instead of claiming an HTTP request was
  // observed; the real rendered nodes above prove the lazy module runs.
  const manifest=JSON.parse(await fs.readFile(path.join(root,'dist','.vite','manifest.json'),'utf8'));
  const flowChunk=Object.entries(manifest).find(([key])=>key.endsWith('src/modules/automation/FlowCanvas.jsx'));
  assert.ok(flowChunk && flowChunk[1]?.file?.endsWith('.js'),
    'O manifesto do build deve conter o chunk React Flow.');
  assert.ok(Object.values(manifest).some(item=>(item.dynamicImports||[]).includes(flowChunk[0])),
    'React Flow precisa ser carregado somente por importação dinâmica.');
  const initialCount=await snapshot();
  assert.ok(initialCount>=3,'Dados reais do fluxo inicial devem aparecer no canvas.');
  await page.getByRole('button',{name:'Salvar fluxo'}).click();
  await page.getByText('Fluxo gravado em',{exact:false}).waitFor();
  const originalBytes=await fs.readFile(flowPath);
  const original=JSON.parse(originalBytes.toString());
  assert.equal(original.nodes.length,initialCount);

  phase='drag native React Flow node and preserve controlled model changes';
  const moving=page.locator('.react-flow__node').first();
  const draggedId=await moving.getAttribute('data-id');
  const originalDragged=original.nodes.find(node=>node.id===draggedId);
  const rect=await moving.boundingBox();
  assert.ok(draggedId && originalDragged && rect,'O nó a ser arrastado precisa existir no documento real.');
  const startX=rect.x+rect.width/2, startY=rect.y+rect.height/2;
  await page.mouse.move(startX,startY);
  await page.mouse.down();
  await page.mouse.move(startX+90,startY+34,{steps:10});
  await page.mouse.up();
  await page.waitForFunction(({id,x,y})=>{
    const node=document.querySelector('.react-flow__node[data-id="'+id+'"]');
    if(!node)return false;
    const style=node.style.transform;
    const m=style.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
    return Boolean(m && Math.hypot(Number(m[1])-x,Number(m[2])-y)>10);
  },{id:draggedId,x:originalDragged.position.x,y:originalDragged.position.y});
  assert.deepEqual(await fs.readFile(flowPath),originalBytes,'Arrastar nó não deve gravar sem aprovação.');

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
  await page.getByTestId('primary-sidebar').getByRole('button',{name:'Editor de código'}).click();
  await page.getByRole('button',{name:'Arquitetura visual'}).click();
  await page.waitForFunction(expected=>
    document.querySelectorAll('.react-flow__node').length===expected,initialCount+1);
  assert.deepEqual(await fs.readFile(flowPath),originalBytes,
    'Mudar de ferramentas não pode sobrescrever o fluxo.');

  phase='persist the edited graph explicitly and verify real filesystem';
  await page.getByRole('button',{name:'Salvar fluxo'}).click();
  await page.getByText('Fluxo gravado em',{exact:false}).waitFor();
  const modifiedBytes=await fs.readFile(flowPath);
  const modified=JSON.parse(modifiedBytes.toString());
  assert.equal(modified.nodes.length,initialCount+1);
  const relocated=modified.nodes.find(node=>node.id===draggedId);
  assert.ok(relocated && Math.hypot(relocated.position.x-originalDragged.position.x,
    relocated.position.y-originalDragged.position.y)>10,
    'Posição movida pelo mouse deve persistir em documento real.');
  assert.deepEqual(modified.edges,original.edges);
  const selectedWorkspace=await page.evaluate(()=>window.omni.activeWorkspace());
  assert.equal(selectedWorkspace.workspace,await fs.realpath(workspace));
  assert.ok(selectedWorkspace.projectId);
  assert.deepEqual(selectedWorkspace.flow,modified);

  phase='reattach the exact workspace after renderer reload without reopening the picker';
  assert.equal(await client.evaluate(()=>globalThis.lazyFlowPickerCount),1);
  await page.reload();
  await page.getByTestId('workspace-overview').waitFor();
  await page.getByText('Projeto aberto:',{exact:false}).waitFor();
  const reattachedWorkspace=await page.evaluate(()=>window.omni.activeWorkspace());
  assert.equal(reattachedWorkspace.projectId,selectedWorkspace.projectId);
  assert.equal(reattachedWorkspace.workspace,selectedWorkspace.workspace);
  assert.deepEqual(reattachedWorkspace.flow,modified);
  assert.equal(await page.getByTestId('workspace-overview').locator('code').textContent(),selectedWorkspace.workspace);
  assert.equal(await page.locator('.topbar-workspace').getAttribute('title'),selectedWorkspace.workspace);
  await page.getByRole('button',{name:'Arquitetura visual',exact:true}).click();
  try{await page.waitForFunction(nodes=>{
    const rendered=[...document.querySelectorAll('.react-flow__node')];
    // CSSOM rounds fractional coordinates when serializing transforms. Compare
    // both sides through that same browser serializer; model/bytes stay exact.
    const expectedStyle=document.createElement('div').style;
    return rendered.length===nodes.length&&nodes.every(expected=>{
      const node=rendered.find(element=>element.dataset.id===expected.id);
      expectedStyle.transform=`translate(${expected.position.x}px,${expected.position.y}px)`;
      return Boolean(node&&node.style.transform===expectedStyle.transform);
    });
  },modified.nodes);}catch(error){
    console.error('[FLOW SESSION positions]',JSON.stringify({expected:modified.nodes.map(({id,position})=>({id,position})),
      rendered:await page.locator('.react-flow__node').evaluateAll(nodes=>nodes.map(node=>({id:node.dataset.id,transform:node.style.transform})))}));
    throw error;
  }
  assert.equal(await snapshot(),initialCount+1);
  assert.equal(await client.evaluate(()=>globalThis.lazyFlowPickerCount),1,
    'Recarregar o renderer deve reanexar o projeto atual sem abrir outro seletor.');
  assert.deepEqual(await fs.readFile(flowPath),modifiedBytes,
    'Reanexar o projeto e ler as posições salvas não pode modificar o fluxo.');

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
