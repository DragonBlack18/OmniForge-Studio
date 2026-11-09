/** Real Electron: persistent dimensions, fixed invariants, recovery and explicit DXF loss boundary. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {_electron as electron} from 'playwright-core';
import {answerConfirmation} from './lib/confirm-dialog.mjs';
import {waitForState} from './lib/wait-for-state.mjs';
import {parseCadDxf} from '../core/modules/cad/cad-import.mjs';
import {cadBounds} from '../core/modules/cad/cad2d.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const folder=await fs.mkdtemp(path.join(os.tmpdir(),'of-cad-dimensions-'));
const workspace=path.join(folder,'workspace'),profile=path.join(folder,'profile');
const artifacts=path.join(root,'smoke-artifacts');
await Promise.all([fs.mkdir(workspace),fs.mkdir(profile),fs.mkdir(artifacts,{recursive:true})]);
const source=path.join(folder,'mechanical-parts.dxf');
await fs.copyFile(path.join(root,'tests/fixtures/cad/static-mechanical-blocks.dxf'),source);
const originalSource=await fs.readFile(source),stored=path.join(workspace,'.omniforge/cad/sketch.json');
const read=()=>fs.readFile(stored,'utf8').then(JSON.parse);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
let app,page,phase='launch';const errors=[];
const watchdog=setTimeout(()=>{console.error('[CAD DIMENSIONS] timeout phase='+phase);app?.process()?.kill();process.exit(1);},210000);
watchdog.unref();
const waitStatus=text=>page.waitForFunction(value=>document.querySelector('.cad-status')?.textContent.includes(value),text);
const countAnnotations=count=>page.waitForFunction(value=>document.querySelectorAll('[data-testid="cad-dimension-annotation"]').length===value,count);
// Selection and history commit before the inspector's effects populate its forms.
// Wait for exact observable values, including uniqueness, before reading or editing.
async function expectInspector(expected,id){
  let observed;
  try{
    await waitForState(async()=>{
      observed=await page.evaluate(labels=>({
        selected:[...document.querySelectorAll('[data-testid="cad-object-entry"][aria-selected="true"]')].map(entry=>entry.dataset.objectId),
        fields:Object.fromEntries(labels.map(label=>[label,[...document.querySelectorAll('.cad-inspection input[aria-label], .cad-inspection select[aria-label]')]
          .filter(input=>input.getAttribute('aria-label')===label).map(input=>input.value)]))
      }),Object.keys(expected));
      return observed.selected.length===1&&observed.selected[0]===id&&Object.entries(expected).every(([label,value])=>observed.fields[label].length===1&&observed.fields[label][0]===value);
    },{timeout:20000,description:`${phase}: inspetor de ${id} com ${JSON.stringify(expected)}`});
  }catch(error){
    error.message+=' Último estado observado: '+JSON.stringify(observed);throw error;
  }
}
const arcFields=(radius,{centerX=100,mode='fixed',offset=12}={})=>({
  'Raio (mm)':String(radius),'Centro X (mm)':String(centerX),
  'Valor da cota (mm)':String(radius),'Comportamento da cota':mode,'Afastamento da cota (mm)':String(offset)
});
async function select(id,expected){
  await page.locator(`[data-testid="cad-object-entry"][data-object-id="${id}"]`).click();
  await expectInspector(expected,id);
}
async function openCad(){
  await page.getByRole('button',{name:'Abrir projeto'}).click();await page.getByText('Projeto aberto:',{exact:false}).waitFor();
  await page.getByRole('button',{name:'CAD Sketch 2D'}).click();await page.getByTestId('cad-workbench').waitFor();
}
async function save(){await page.getByTestId('cad-save').click();await waitStatus('Desenho salvo:');}

try{
  app=await electron.launch({args:['.'],cwd:root,timeout:45000,
    env:{...process.env,OMNIFORGE_E2E:'1',OMNIFORGE_E2E_USER_DATA:profile,ELECTRON_RENDERER_URL:''}});
  page=await app.firstWindow({timeout:45000});page.setDefaultTimeout(20000);
  page.on('pageerror',error=>errors.push(error.message));
  assert.equal(path.normalize(await app.evaluate(({app})=>app.getPath('userData'))).toLowerCase(),path.normalize(profile).toLowerCase());
  await app.evaluate(({BrowserWindow,dialog},{workspace,source})=>{
    BrowserWindow.getAllWindows()[0].setSize(1440,900);
    dialog.showOpenDialog=async(_window,options)=>({canceled:false,filePaths:[options.title?.includes('DXF')?source:workspace]});
  },{workspace,source});
  await openCad();
  phase='import real mechanical DXF and create a fixed radius';
  await page.getByTestId('cad-import-dxf').click();await waitStatus('DXF importado:');
  assert.equal(await page.getByTestId('cad-object-entry').count(),8);
  const arcId=await page.getByTestId('cad-object-entry').nth(0).getAttribute('data-object-id');
  const lineId=await page.getByTestId('cad-object-entry').nth(1).getAttribute('data-object-id');
  await select(arcId,arcFields(40,{mode:'reference',offset:10}));
  await page.getByTestId('cad-dimension-mode').selectOption('fixed');
  await expectInspector(arcFields(40,{offset:10}),arcId);
  phase='invalid fields retain input, expose associated errors and focus the first invalid field';
  await page.getByTestId('cad-dimension-value').fill('');await page.getByTestId('cad-dimension-offset').fill('0');
  await page.getByTestId('cad-dimension-apply').click();
  await page.waitForFunction(()=>document.activeElement?.dataset.testid==='cad-dimension-value'&&document.activeElement.getAttribute('aria-invalid')==='true');
  assert.equal(await page.getByTestId('cad-dimension-value').inputValue(),'');
  assert.equal(await page.getByTestId('cad-dimension-offset').inputValue(),'0');
  for(const field of ['value','offset'])assert.equal(await page.getByTestId('cad-dimension-'+field).evaluate(input=>Boolean(document.getElementById(input.getAttribute('aria-describedby'))?.textContent)),true);
  assert.equal(await page.getByLabel('Raio (mm)',{exact:true}).inputValue(),'40');await countAnnotations(0);
  await page.getByTestId('cad-dimension-value').fill('30');
  await page.getByTestId('cad-dimension-apply').click();
  await page.waitForFunction(()=>document.activeElement?.dataset.testid==='cad-dimension-offset'&&document.activeElement.getAttribute('aria-invalid')==='true');
  assert.equal(await page.getByTestId('cad-dimension-value').getAttribute('aria-invalid'),null);
  await countAnnotations(0);
  phase='apply corrected fixed radius';
  await page.getByTestId('cad-dimension-offset').fill('12');
  await page.getByTestId('cad-dimension-apply').click();await waitStatus('Cota fixa aplicada');
  await countAnnotations(1);await expectInspector(arcFields(30),arcId);
  assert.match(await page.getByTestId('cad-dimension-annotation').textContent(),/R 30 mm/);
  await assert.rejects(fs.stat(stored),{code:'ENOENT'});

  phase='undo and redo geometry with its persistent constraint';
  await page.getByRole('button',{name:'Desfazer',exact:true}).click();await countAnnotations(0);
  await select(arcId,arcFields(40,{mode:'reference',offset:10}));
  assert.match(await page.locator(`path[data-entity-id="${arcId}"]`).getAttribute('d'),/A 40 40/);
  await page.getByRole('button',{name:'Refazer',exact:true}).click();await countAnnotations(1);
  await select(arcId,arcFields(30));
  assert.match(await page.locator(`path[data-entity-id="${arcId}"]`).getAttribute('d'),/A 30 30/);

  phase='reject incompatible direct geometry and scale while accepting translation';
  await page.getByLabel('Raio (mm)',{exact:true}).fill('31');
  await page.getByTestId('cad-apply-geometry').click();await waitStatus('Dimensão fixa');
  assert.match(await page.locator(`path[data-entity-id="${arcId}"]`).getAttribute('d'),/A 30 30/);
  await page.locator('.cad-property-section').filter({has:page.locator('summary').filter({hasText:/^Transformar$/})}).locator('summary').click();
  await page.getByLabel('Deslocamento X (mm)',{exact:true}).fill('5');
  await page.getByRole('button',{name:'Aplicar transformação',exact:true}).click();await waitStatus('Transformação aplicada.');
  await expectInspector({...arcFields(30,{centerX:105}),'Deslocamento X (mm)':'0','Escala uniforme':'1'},arcId);
  await page.getByLabel('Escala uniforme',{exact:true}).fill('2');
  await page.getByRole('button',{name:'Aplicar transformação',exact:true}).click();await waitStatus('Dimensão fixa');
  await expectInspector(arcFields(30,{centerX:105}),arcId);

  phase='reference dimension follows a resized line';
  await select(lineId,{'X inicial (mm)':'100','Y inicial (mm)':'0','X final (mm)':'100','Y final (mm)':'80',
    'Comportamento da cota':'reference','Valor da cota (mm)':'80','Afastamento da cota (mm)':'10'});
  await page.getByTestId('cad-dimension-offset').fill('-15');
  await page.getByTestId('cad-dimension-apply').click();await waitStatus('Cota de referência adicionada');
  await expectInspector({'Comportamento da cota':'reference','Valor da cota (mm)':'80','Afastamento da cota (mm)':'-15'},lineId);
  await page.getByLabel('Método de edição geométrica').selectOption('dimensions');
  await expectInspector({'Comprimento (mm)':'80','Ângulo (graus)':'90'},lineId);
  await page.getByLabel('Comprimento (mm)',{exact:true}).fill('100');
  await page.getByLabel('Ângulo (graus)',{exact:true}).fill('90');
  await page.getByTestId('cad-apply-geometry').click();await waitStatus('Dimensões aplicadas.');
  await countAnnotations(2);
  await expectInspector({'Comprimento (mm)':'100','Valor da cota (mm)':'100','Afastamento da cota (mm)':'-15'},lineId);
  assert.match(await page.locator('[data-testid="cad-dimension-annotation"][data-dimension-kind="length"]').textContent(),/100 mm/);
  await page.getByRole('button',{name:'Remover cota Comprimento',exact:true}).click();await waitStatus('Cota removida; geometria preservada.');
  await countAnnotations(1);await expectInspector({'Comprimento (mm)':'100','Valor da cota (mm)':'100','Afastamento da cota (mm)':'10'},lineId);
  await page.getByRole('button',{name:'Desfazer',exact:true}).click();await countAnnotations(2);

  phase='copy and delete carry dimensions with the object, including undo/redo';
  await select(arcId,arcFields(30,{centerX:105}));await page.getByTestId('cad-duplicate').click();await countAnnotations(3);
  assert.equal(await page.getByTestId('cad-object-entry').count(),9);
  assert.match(await page.getByTestId('cad-dimension-entry').textContent(),/R 30 mm/);
  await page.getByRole('button',{name:'Excluir entidade',exact:true}).click();await countAnnotations(2);
  await page.getByRole('button',{name:'Desfazer',exact:true}).click();await countAnnotations(3);
  await page.getByRole('button',{name:'Refazer',exact:true}).click();await countAnnotations(2);
  await save();const committed=await read();
  assert.equal(committed.schemaVersion,2);assert.equal(committed.entities.length,8);
  assert.deepEqual(committed.entities.find(entity=>entity.id===arcId).dimensions,[{kind:'radius',mode:'fixed',offset:12,value:30}]);
  assert.deepEqual(committed.entities.find(entity=>entity.id===arcId).source.blockPath,['FLANGE']);

  phase='recover an unsaved dimension value without overwriting the native source';
  await select(arcId,arcFields(30,{centerX:105}));await page.getByTestId('cad-dimension-value').fill('35');
  await page.getByTestId('cad-dimension-apply').click();await waitStatus('Cota fixa aplicada');
  await expectInspector(arcFields(35,{centerX:105}),arcId);
  await page.getByTestId('cad-draft-saved').waitFor();assert.deepEqual(await read(),committed);
  await page.reload();await openCad();await page.getByTestId('cad-recovery').waitFor();
  assert.deepEqual(await read(),committed);
  await page.getByTestId('cad-restore-draft').click();await countAnnotations(2);await select(arcId,arcFields(35,{centerX:105}));
  await save();const finalDocument=await read(),savedBytes=await fs.readFile(stored);
  assert.equal(finalDocument.entities.find(entity=>entity.id===arcId).dimensions[0].value,35);

  phase='export dimensioned SVG and cancel geometry-only DXF export';
  await page.getByRole('button',{name:'Exportar SVG',exact:true}).click();await waitStatus('Arquivo SVG real exportado:');
  const svg=await fs.readFile(path.join(workspace,'.omniforge/output/cad-sketch.svg'),'utf8');
  assert.match(svg,/>R 35 mm<\/text>/);assert.match(svg,/>100 mm<\/text>/);
  const exportedDxf=path.join(workspace,'.omniforge/output/cad-sketch.dxf');
  await page.getByRole('button',{name:'Exportar DXF',exact:true}).click();
  await answerConfirmation(page,false,{title:'Exportar DXF somente com geometria'});
  await waitStatus('Exportação DXF cancelada.');await assert.rejects(fs.stat(exportedDxf),{code:'ENOENT'});

  phase='accept explicit geometry-only DXF while keeping the v2 drawing intact';
  await page.getByRole('button',{name:'Exportar DXF',exact:true}).click();
  await answerConfirmation(page,true,{title:'Exportar DXF somente com geometria'});
  await waitStatus('Somente geometria; cotas mantidas');
  const dxf=await fs.readFile(exportedDxf,'utf8');assert.doesNotMatch(dxf,/\nTEXT\n|\nDIMENSION\n/);
  assert.deepEqual(cadBounds(parseCadDxf(dxf,{assumeMillimeters:true}).sketch),cadBounds(finalDocument));
  assert.deepEqual(await fs.readFile(stored),savedBytes);assert.deepEqual(await fs.readFile(source),originalSource);

  phase='reload v2, inspect real layout and capture evidence at desktop sizes';
  await page.reload();await openCad();await countAnnotations(2);await select(arcId,arcFields(35,{centerX:105}));
  assert.equal(await page.getByTestId('cad-save').isDisabled(),true);
  await page.getByRole('button',{name:'Ajustar desenho à tela',exact:true}).click();
  await page.getByTestId('cad-persistent-dimensions').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(artifacts,'cad-dimensions.png')});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1040,680));
  await page.getByTestId('cad-dimension-apply').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),true);
  await page.screenshot({path:path.join(artifacts,'cad-dimensions-compact.png')});
  assert.deepEqual(errors,[]);assert.deepEqual(await read(),finalDocument);
  await fs.writeFile(path.join(artifacts,'cad-dimensions.json'),JSON.stringify({
    schemaVersion:1,status:'passed',nativeDocumentVersion:finalDocument.schemaVersion,
    entities:finalDocument.entities.length,dimensions:finalDocument.entities.reduce((count,entity)=>count+(entity.dimensions?.length||0),0),
    fixedRadius:35,referenceLength:100,sourceSha256:hash(originalSource),savedDocumentSha256:hash(savedBytes),
    verified:['real-dxf-import','accessible-field-validation-and-focus','v2-persistence','fixed-geometry-invariants','reference-updates','copy-delete-undo-redo','explicit-recovery','annotated-svg','cancel-then-accept-geometry-only-dxf','native-reload'],rendererErrors:errors
  },null,2)+'\n');
  await fs.rm(path.join(artifacts,'cad-dimensions-failure.png'),{force:true});
  console.log('PASS CAD dimensions Electron: persistent reference/fixed dimensions, atomic edits, copies/undo, native save/recovery/reload, annotated SVG and explicit geometry-only DXF.');
  phase='pass';
}catch(error){
  console.error('[CAD DIMENSIONS] phase='+phase,error);process.exitCode=1;
  await fs.writeFile(path.join(artifacts,'cad-dimensions.json'),JSON.stringify({schemaVersion:1,status:'failed',phase,error:error.message,rendererErrors:errors},null,2)+'\n').catch(()=>{});
  if(page)try{await page.screenshot({path:path.join(artifacts,'cad-dimensions-failure.png')});}catch{}
}finally{
  if(app)try{const child=app.process();if(child&&child.exitCode===null)child.kill();await Promise.race([app.close().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,2800))]);}catch{}
  await fs.rm(folder,{recursive:true,force:true}).catch(()=>{});clearTimeout(watchdog);process.exit(process.exitCode||0);
}
