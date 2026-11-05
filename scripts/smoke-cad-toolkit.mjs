/** Real Windows/Electron CAD v0.7.8: technical editing, measurement, and disk safety. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {_electron as electron} from 'playwright-core';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const lab=await fs.mkdtemp(path.join(os.tmpdir(),'of-cad-toolkit-'));
const workspace=path.join(lab,'workspace'),profile=path.join(lab,'profile');
await Promise.all([fs.mkdir(workspace),fs.mkdir(profile)]);
const pairs=(...vals)=>vals.join('\n')+'\n';
const dxftxt=pairs(0,'SECTION',2,'HEADER',9,'$INSUNITS',70,4,0,'ENDSEC',
  0,'SECTION',2,'ENTITIES',0,'LINE',8,'0',10,0,20,0,11,100,21,0,
  0,'CIRCLE',8,'0',10,30,20,30,40,10,0,'ENDSEC',0,'EOF');
const input=path.join(lab,'fixture.dxf');await fs.writeFile(input,dxftxt);
const CAD=path.join(workspace,'.omniforge','cad','sketch.json');
let client,page,phase='boot';
const errors=[];
const watchdog=setTimeout(()=>{console.error('[CAD TOOLKIT E2E] timeout phase='+phase);process.exit(1);},180000);
watchdog.unref();
const read=()=>fs.readFile(CAD,'utf8').then(JSON.parse);
const section=()=>page.getByTestId('cad-technical-operations');
async function openTool(operation){
  const details=section();
  if(!(await details.evaluate(node=>node.open)))await details.locator('summary').click();
  await details.getByLabel('Operação geométrica CAD').selectOption(operation);
}
async function applyAndCheck(label){
  await section().getByTestId('cad-operation-apply').click();
  await page.getByText(label,{exact:false}).waitFor();
}
async function save(){
  await page.getByTestId('cad-save').click();
  await page.waitForFunction(()=>document.querySelector('.cad-status')?.textContent.includes('Desenho salvo:'));
}
try {
 client=await electron.launch({args:['.'],cwd:root,timeout:45000,
  env:{...process.env,OMNIFORGE_E2E:'1',OMNIFORGE_E2E_USER_DATA:profile,ELECTRON_RENDERER_URL:''}});
 page=await client.firstWindow({timeout:45000});
 page.setDefaultTimeout(20000);
 page.on('pageerror',e=>errors.push(e.message));
 const actual=await client.evaluate(({app})=>app.getPath('userData'));
 assert.equal(path.normalize(actual).toLowerCase(),path.normalize(profile).toLowerCase());
 await client.evaluate(({dialog,BrowserWindow},{workspace,input})=>{
  BrowserWindow.getAllWindows()[0].setSize(1440,900);
  dialog.showOpenDialog=async(_win,opts)=>({canceled:false,filePaths:[opts.title?.includes('DXF')?input:workspace]});
 },{workspace,input});
 phase='import real DXF without auto save';
 await page.getByRole('button',{name:'Abrir projeto'}).click();
 await page.getByText('Projeto aberto:',{exact:false}).waitFor();
 await page.getByRole('button',{name:'CAD Sketch 2D'}).click();
 await page.getByTestId('cad-import-dxf').click();
 await page.getByText('DXF importado:',{exact:false}).waitFor();
 assert.equal(await page.getByTestId('cad-object-entry').count(),2);
 await assert.rejects(fs.stat(CAD),{code:'ENOENT'});
 const originalInput=await fs.readFile(input);
 phase='rotate original line with numeric CAD operation';
 await page.getByTestId('cad-object-entry').first().click();
 const firstId=await page.getByTestId('cad-object-entry').first().getAttribute('data-object-id');
 await openTool('rotate');
 await section().getByLabel('Pivô da operação CAD').selectOption('origin');
 await section().getByLabel('Ângulo de rotação (graus)').fill('90');
 await applyAndCheck('Rotação aplicada em geometria real');
 assert.equal(await page.getByTestId('cad-entity-count').textContent(),'2');
 await assert.rejects(fs.stat(CAD),{code:'ENOENT'});
 phase='parallel line, undo/redo, array copies';
 await openTool('offset');
 await section().getByLabel('Distância paralela (mm)').fill('20');
 await applyAndCheck('Paralela aplicada em geometria real');
 assert.equal(await page.getByTestId('cad-object-entry').count(),3);
 await page.getByRole('button',{name:'Desfazer',exact:true}).click();
 assert.equal(await page.getByTestId('cad-object-entry').count(),2);
 await page.getByRole('button',{name:'Refazer',exact:true}).click();
 assert.equal(await page.getByTestId('cad-object-entry').count(),3);
 await page.getByTestId('cad-object-entry').last().click();
 await openTool('array');
 await section().getByLabel('Linhas da matriz').fill('2');
 await section().getByLabel('Colunas da matriz').fill('3');
 await section().getByLabel('Passo horizontal (mm)').fill('30');
 await section().getByLabel('Passo vertical (mm)').fill('25');
 await applyAndCheck('Matriz aplicada em geometria real');
 assert.equal(await page.getByTestId('cad-object-entry').count(),8);
 await assert.rejects(fs.stat(CAD),{code:'ENOENT'});
 phase='save actual geometry and check source remains intact';
 await save();
 const stored=await read();
 assert.equal(stored.entities.length,8);
 assert.equal(stored.schemaVersion,1);
 assert.equal(stored.units,'mm');
 const line=stored.entities.find(item=>item.id===firstId);
 assert.deepEqual(line.a,{x:0,y:0});
 assert.deepEqual(line.b,{x:0,y:100});
 assert.equal(stored.entities.filter(item=>item.type==='line').length,7);
 assert.deepEqual(await fs.readFile(input),originalInput);
 const savedBytes=await fs.readFile(CAD);
 phase='measure two arbitrary visible points without changing CAD file';
 await page.getByTestId('cad-tool-measure').click();
 const box=await page.getByTestId('cad-canvas').boundingBox();
 assert.ok(box&&box.width>100&&box.height>100);
 await page.mouse.click(box.x+box.width*.4,box.y+box.height*.45);
 await page.mouse.click(box.x+box.width*.7,box.y+box.height*.62);
 await page.getByTestId('cad-measure-result').waitFor();
 assert.match(await page.getByTestId('cad-measure-result').textContent(),/mm/);
 assert.deepEqual(await fs.readFile(CAD),savedBytes);
 phase='save/reopen and inspect native object properties';
 await page.reload();
 await page.getByTestId('workspace-overview').waitFor();
 await page.getByRole('button',{name:'Abrir projeto'}).click();
 await page.getByText('Projeto aberto:',{exact:false}).waitFor();
 await page.getByRole('button',{name:'CAD Sketch 2D'}).click();
 await page.getByTestId('cad-workbench').waitFor();
 assert.equal(await page.getByTestId('cad-object-entry').count(),8);
 assert.deepEqual(await fs.readFile(CAD),savedBytes);
 assert.deepEqual(await fs.readFile(input),originalInput);
 assert.deepEqual(errors,[]);
 await fs.mkdir(path.join(root,'smoke-artifacts'),{recursive:true});
 await page.screenshot({path:path.join(root,'smoke-artifacts','cad-toolkit-v078.png')});
 console.log('PASS CAD Toolkit v0.7.8 Electron: imported DXF, rotate, parallel, undo/redo, array, measurement, save, reload, original unchanged.');
 phase='pass';
} catch(e) {
 console.error('[CAD TOOLKIT E2E] phase='+phase,e);
 process.exitCode=1;
} finally {
 if(client){try{
  const child=client.process();if(child&&child.exitCode===null)child.kill();
  await Promise.race([client.close().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,2800))]);
 }catch{}}
 await fs.rm(lab,{recursive:true,force:true}).catch(()=>{});
 clearTimeout(watchdog);
 process.exit(process.exitCode||0);
}
