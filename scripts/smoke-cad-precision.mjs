/** Real Electron integration: DXF blocks/arcs, precise editing, undo, disk and export. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {_electron as electron} from 'playwright-core';
import {parseCadDxf} from '../core/modules/cad/cad-import.mjs';
import {cadBounds} from '../core/modules/cad/cad2d.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const lab=await fs.mkdtemp(path.join(os.tmpdir(),'of-cad-precision-'));
const workspace=path.join(lab,'workspace'),profile=path.join(lab,'profile');
await Promise.all([fs.mkdir(workspace),fs.mkdir(profile)]);
const input=path.join(lab,'flanges.dxf');
await fs.copyFile(path.join(root,'tests','fixtures','cad','static-mechanical-blocks.dxf'),input);
const originalInput=await fs.readFile(input);
const stored=path.join(workspace,'.omniforge','cad','sketch.json');
const read=()=>fs.readFile(stored,'utf8').then(JSON.parse);
let app,page,phase='boot';
const errors=[];
const watchdog=setTimeout(()=>{console.error('[CAD PRECISION] timeout phase='+phase);process.exit(1);},180000);
watchdog.unref();
const waitStatus=text=>page.waitForFunction(value=>document.querySelector('.cad-status')?.textContent.includes(value),text);
async function clickWorld(x,y){
  const position=await page.getByTestId('cad-canvas').evaluate((svg,point)=>{
    const p=new DOMPoint(point.x,-point.y).matrixTransform(svg.getScreenCTM());return{x:p.x,y:p.y};
  },{x,y});
  await page.mouse.click(position.x,position.y);
}
async function save(){await page.getByTestId('cad-save').click();await waitStatus('Desenho salvo:');}

try{
  app=await electron.launch({args:['.'],cwd:root,timeout:45000,
    env:{...process.env,OMNIFORGE_E2E:'1',OMNIFORGE_E2E_USER_DATA:profile,ELECTRON_RENDERER_URL:''}});
  page=await app.firstWindow({timeout:45000});page.setDefaultTimeout(20000);
  page.on('pageerror',error=>errors.push(error.message));
  const actualProfile=await app.evaluate(({app})=>app.getPath('userData'));
  assert.equal(path.normalize(actualProfile).toLowerCase(),path.normalize(profile).toLowerCase());
  await app.evaluate(({dialog,BrowserWindow},{workspace,input})=>{
    BrowserWindow.getAllWindows()[0].setSize(1440,900);
    dialog.showOpenDialog=async(_window,options)=>({canceled:false,filePaths:[options.title?.includes('DXF')?input:workspace]});
  },{workspace,input});
  await page.getByRole('button',{name:'Abrir projeto'}).click();
  await page.getByText('Projeto aberto:',{exact:false}).waitFor();
  await page.getByRole('button',{name:'CAD Sketch 2D'}).click();
  phase='import actual mechanical blocks and inspect source';
  await page.getByTestId('cad-import-dxf').click();await waitStatus('DXF importado:');
  assert.equal(await page.getByTestId('cad-object-entry').count(),8);
  assert.match(await page.locator('.cad-status').textContent(),/2 instâncias de bloco convertidas/);
  await assert.rejects(fs.stat(stored),{code:'ENOENT'});
  await page.getByTestId('cad-object-entry').first().click();
  const firstId=await page.getByTestId('cad-object-entry').first().getAttribute('data-object-id');
  assert.equal(await page.getByTestId('cad-source-block').textContent(),'FLANGE');
  assert.equal(await page.getByLabel('Raio (mm)',{exact:true}).inputValue(),'40');
  phase='edit analytic arc and reject invalid radius without mutating document';
  await page.getByLabel('Raio (mm)',{exact:true}).fill('0');
  await page.getByTestId('cad-apply-geometry').click();await waitStatus('Raio CAD inválido');
  assert.equal(await page.getByTestId('cad-object-entry').count(),8);
  await page.getByLabel('Raio (mm)',{exact:true}).fill('30');
  await page.getByLabel('Ângulo inicial (graus)',{exact:true}).fill('350');
  await page.getByLabel('Ângulo final (graus)',{exact:true}).fill('60');
  await page.getByTestId('cad-apply-geometry').click();await waitStatus('Medidas aplicadas');
  assert.match(await page.locator(`[data-entity-id="${firstId}"]`).getAttribute('d'),/A 30 30/);
  phase='create concentric offset and exercise real undo/redo';
  const operations=page.getByTestId('cad-technical-operations');
  await operations.locator('summary').click();
  await operations.getByLabel('Operação geométrica CAD').selectOption('offset');
  await operations.getByLabel('Distância radial (mm)').fill('5');
  await operations.getByLabel('Direção do offset circular').selectOption('outward');
  await operations.getByTestId('cad-operation-apply').click();await waitStatus('Paralela aplicada');
  assert.equal(await page.getByTestId('cad-object-entry').count(),9);
  await page.getByRole('button',{name:'Desfazer',exact:true}).click();
  assert.equal(await page.getByTestId('cad-object-entry').count(),8);
  await page.getByRole('button',{name:'Refazer',exact:true}).click();
  assert.equal(await page.getByTestId('cad-object-entry').count(),9);
  phase='draw three-point arc through actual viewport pointer events';
  await page.getByTestId('cad-tool-arc').click();
  await clickWorld(0,20);await clickWorld(15,20);await clickWorld(0,35);
  await waitStatus('Arco criado em milímetros');
  assert.equal(await page.getByTestId('cad-object-entry').count(),10);
  await assert.rejects(fs.stat(stored),{code:'ENOENT'});
  phase='save document, verify exact geometry and export-import world bounds';
  await save();const document=await read();
  assert.equal(document.entities.length,10);
  const edited=document.entities.find(entity=>entity.id===firstId);
  assert.equal(edited.radius,30);assert.equal(edited.startAngle,350);assert.equal(edited.endAngle,60);
  assert.deepEqual(edited.source.blockPath,['FLANGE']);
  const newArc=document.entities.at(-1);assert.equal(newArc.type,'arc');assert.equal(newArc.radius,15);
  assert.deepEqual(newArc.center,{x:0,y:20});assert.equal(newArc.startAngle,0);assert.equal(newArc.endAngle,90);
  await page.getByRole('button',{name:'Exportar DXF',exact:true}).click();await waitStatus('Arquivo DXF real exportado:');
  const exported=await fs.readFile(path.join(workspace,'.omniforge','output','cad-sketch.dxf'),'utf8');
  assert.match(exported,/\nARC\n/);assert.doesNotMatch(exported,/\nINSERT\n/);
  const reimported=parseCadDxf(exported,{assumeMillimeters:true}).sketch;
  assert.deepEqual(cadBounds(reimported),cadBounds(document));
  assert.deepEqual(await fs.readFile(input),originalInput);
  phase='reload from disk and inspect persisted block provenance';
  await page.reload();await page.getByTestId('workspace-overview').waitFor();
  await page.getByRole('button',{name:'Abrir projeto'}).click();await page.getByText('Projeto aberto:',{exact:false}).waitFor();
  await page.getByRole('button',{name:'CAD Sketch 2D'}).click();
  await page.waitForFunction(()=>document.querySelectorAll('[data-testid="cad-object-entry"]').length===10);
  await page.getByTestId('cad-object-entry').first().click();
  assert.equal(await page.getByTestId('cad-source-block').textContent(),'FLANGE');
  assert.deepEqual(await read(),document);assert.deepEqual(errors,[]);
  await page.getByRole('button',{name:'Ajustar desenho à tela',exact:true}).click();
  await fs.mkdir(path.join(root,'smoke-artifacts'),{recursive:true});
  await page.screenshot({path:path.join(root,'smoke-artifacts','cad-precision.png')});
  await page.getByTestId('cad-source-block').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(root,'smoke-artifacts','cad-precision-provenance.png')});
  console.log('PASS CAD precision Electron: real DXF block import, source inspector, arc editing/drawing, radial offset, undo/redo, native save/reload and DXF round-trip.');
  phase='pass';
}catch(error){console.error('[CAD PRECISION] phase='+phase,error);process.exitCode=1;}
finally{
  if(app)try{const child=app.process();if(child&&child.exitCode===null)child.kill();
    await Promise.race([app.close().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,2800))]);}catch{}
  await fs.rm(lab,{recursive:true,force:true}).catch(()=>{});clearTimeout(watchdog);
  process.exit(process.exitCode||0);
}
