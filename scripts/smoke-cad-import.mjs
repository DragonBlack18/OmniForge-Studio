/** Real Windows Electron smoke: native DXF chooser, parse, unsaved state and persistence. */
import { _electron as electron } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'omni-dxf-electron-'));
const dxf=path.join(workspace,'desenho-mm.dxf');
const invalid=path.join(workspace,'unsupported-arc.dxf');
const pairs=(...values)=>values.join('\n')+'\n';
const header=pairs(0,'SECTION',2,'HEADER',9,'$INSUNITS',70,4,0,'ENDSEC');
const source=header+pairs(0,'SECTION',2,'ENTITIES',
  0,'LINE',8,'placas',10,0,20,0,11,45,21,15,
  0,'CIRCLE',8,'furos',10,20,20,20,40,10,
  0,'ENDSEC',0,'EOF');
const unsafe=header+pairs(0,'SECTION',2,'ENTITIES',
  0,'LINE',10,0,20,0,11,10,21,0,
  0,'ARC',10,0,20,0,40,10,50,0,51,90,
  0,'ENDSEC',0,'EOF');
await fs.writeFile(dxf,source,'utf8');
await fs.writeFile(invalid,unsafe,'utf8');
const original=await fs.readFile(dxf);
let client,page;
let selected=dxf;
let nativeUnitChoice=1;
const timeout=setTimeout(()=>{console.error('[DXF SMOKE] global timeout');process.exit(1);},115000);
timeout.unref();
try {
  client=await electron.launch({
    args:['.'],cwd:root,timeout:45000,
    env:{...process.env,ELECTRON_RENDERER_URL:''}
  });
  page=await client.firstWindow({timeout:45000});
  page.setDefaultTimeout(20000);
  page.on('pageerror',e=>console.error('[Renderer]',e.message));
  await page.getByText('OMNIFORGE',{exact:false}).first().waitFor();
  await client.evaluate(({dialog},{workspace,dxf})=>{
    // A real file is used; only the native chooser interaction is stubbed.
    dialog.showOpenDialog=async (_window,opts)=>({
      canceled:false,filePaths:[opts.title?.includes('DXF')?dxf:workspace]
    });
  },{workspace,dxf});
  await page.getByRole('button',{name:'Abrir projeto'}).click();
  await page.getByText('Projeto aberto:',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Salvar fluxo'}).click();
  await page.getByText('Fluxo gravado em',{exact:false}).waitFor();
  await page.getByRole('button',{name:'CAD Sketch 2D'}).click();
  await page.getByTestId('cad-workbench').waitFor();
  await page.getByTestId('cad-import-dxf').click();
  await page.getByText('DXF importado:',{exact:false}).waitFor();
  await page.waitForFunction(()=>
    document.querySelector('[data-testid="cad-entity-count"]')?.textContent?.trim()==='2');
  const CAD=path.join(workspace,'.omniforge','cad','sketch.json');
  await assert.rejects(fs.stat(CAD),{code:'ENOENT'});
  assert.equal(await page.getByTestId('cad-save').isEnabled(),true);
  await page.getByTestId('cad-save').click();
  await page.getByText('Desenho salvo:',{exact:false}).waitFor();
  const persisted=JSON.parse(await fs.readFile(CAD,'utf8'));
  assert.equal(persisted.entities.length,2);
  assert.equal(persisted.layers.length,2);
  assert.equal(persisted.entities[0].b.x,45);
  assert.equal(persisted.entities[1].radius,10);
  await page.getByRole('button',{name:'Exportar DXF'}).click();
  await page.getByText('Arquivo DXF real exportado:',{exact:false}).waitFor();
  const exported=await fs.readFile(path.join(workspace,'.omniforge/output/cad-sketch.dxf'),'utf8');
  assert.match(exported,/\nLINE\n/);
  assert.match(exported,/\nCIRCLE\n/);
  assert.deepEqual(await fs.readFile(dxf),original);

  // Refuse partial import of an ARC and do not dirty or overwrite the CAD.
  await client.evaluate(({dialog},file)=>{
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});
  },invalid);
  await page.getByTestId('cad-import-dxf').click();
  await page.getByText('Importação DXF recusada:',{exact:false}).waitFor();
  assert.equal((await page.evaluate(()=>window.omni.loadCadSketch())).sketch.entities.length,2);
  assert.equal(await page.getByTestId('cad-save').isDisabled(),true);

  // Unknown R12 units require native consent. Cancelling does not mutate buffers.
  const unknown=path.join(workspace,'no-units.dxf');
  await fs.writeFile(unknown,pairs(0,'SECTION',2,'ENTITIES',
    0,'LINE',10,0,20,0,11,100,21,0,0,'ENDSEC',0,'EOF'),'utf8');
  await client.evaluate(({dialog},file)=>{
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});
    dialog.showMessageBox=async()=>({response:0});
  },unknown);
  await page.getByTestId('cad-import-dxf').click();
  await page.getByText('Importação cancelada.',{exact:false}).waitFor();
  assert.equal(await page.getByTestId('cad-save').isDisabled(),true);
  assert.equal((await page.evaluate(()=>window.omni.loadCadSketch())).sketch.entities.length,2);

  await client.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});});
  await page.getByTestId('cad-import-dxf').click();
  await page.getByText('DXF importado:',{exact:false}).waitFor();
  await page.waitForFunction(()=>
    document.querySelector('[data-testid="cad-entity-count"]')?.textContent?.trim()==='1');
  assert.equal(await page.getByTestId('cad-save').isEnabled(),true);
  await page.getByTestId('cad-save').click();
  await page.getByText('Desenho salvo:',{exact:false}).waitFor();
  assert.equal(JSON.parse(await fs.readFile(CAD,'utf8')).entities.length,1);
  console.log('PASS DXF Electron: native import, no auto-save, persisted geometry, rollback on errors and unit consent.');
} catch(error) {
  console.error(error);
  process.exitCode=1;
  if(page)try{await page.screenshot({path:path.join(root,'dxf-smoke-failure.png')});}catch{}
} finally {
  if(client) {
    try{
      // Kill only the isolated test child, never a user's application.
      const proc=client.process();
      if(proc && proc.exitCode===null)proc.kill();
      await Promise.race([client.close().catch(()=>{}),new Promise(r=>setTimeout(r,2500))]);
    }catch{}
  }
  await fs.rm(workspace,{recursive:true,force:true});
  clearTimeout(timeout);
}
