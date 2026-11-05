/** Real Electron: one navigator, Studio theme, CAD object editing and on-disk persistence. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {_electron as electron} from 'playwright-core';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const lab=await fs.mkdtemp(path.join(os.tmpdir(),'of-studio-e2e-'));
const workspace=path.join(lab,'workspace'),profile=path.join(lab,'profile');
await Promise.all([fs.mkdir(workspace),fs.mkdir(profile)]);
const pairs=(...v)=>v.join('\n')+'\n';
let dxf=pairs(0,'SECTION',2,'HEADER',9,'$INSUNITS',70,4,0,'ENDSEC',
  0,'SECTION',2,'TABLES',0,'TABLE',2,'LAYER',70,2,
  0,'LAYER',2,'Contorno',62,7,70,0,420,parseInt('C8515E',16),
  0,'LAYER',2,'Furos',62,7,70,0,420,parseInt('A6A0A6',16),
  0,'ENDTAB',0,'ENDSEC',0,'SECTION',2,'ENTITIES');
for(const [a,b] of [[[0,0],[180,0]],[[180,0],[180,110]],[[180,110],[0,110]],[[0,110],[0,0]],[[10,10],[170,10]],[[170,10],[170,100]],[[170,100],[10,100]],[[10,100],[10,10]]])dxf+=pairs(0,'LINE',8,'Contorno',10,a[0],20,a[1],11,b[0],21,b[1]);
for(const [x,y,r] of [[25,25,5],[155,25,5],[25,85,5],[155,85,5],[90,55,23]])dxf+=pairs(0,'CIRCLE',8,'Furos',10,x,20,y,40,r);
dxf+=pairs(0,'ENDSEC',0,'EOF');
const fixture=path.join(lab,'placa.dxf');await fs.writeFile(fixture,dxf);
const CAD=path.join(workspace,'.omniforge','cad','sketch.json');
let client,page,phase='boot';const errors=[];
const watchdog=setTimeout(()=>{console.error('[STUDIO E2E] timeout '+phase);process.exit(1);},180000);watchdog.unref();
const read=async()=>JSON.parse(await fs.readFile(CAD,'utf8'));
async function save(){
  await page.getByTestId('cad-save').click();
  await page.waitForFunction(()=>document.querySelector('[data-testid="cad-save"]')?.disabled&&document.querySelector('.cad-status')?.textContent.includes('Desenho salvo:'));
}
try{
  client=await electron.launch({args:['.'],cwd:root,timeout:45000,env:{...process.env,OMNIFORGE_E2E:'1',OMNIFORGE_E2E_USER_DATA:profile,ELECTRON_RENDERER_URL:''}});
  page=await client.firstWindow({timeout:45000});page.setDefaultTimeout(20000);
  page.on('pageerror',e=>errors.push(e.message));
  const actual=await client.evaluate(({app})=>app.getPath('userData'));
  assert.equal(path.normalize(actual).toLowerCase(),path.normalize(profile).toLowerCase());
  await client.evaluate(({dialog,BrowserWindow},{workspace,fixture})=>{
    BrowserWindow.getAllWindows()[0].setSize(1440,900);
    dialog.showOpenDialog=async(_w,opts)=>({canceled:false,filePaths:[opts.title?.includes('DXF')?fixture:workspace]});
  },{workspace,fixture});
  await page.getByTestId('workspace-overview').waitFor();
  assert.equal(await page.getByRole('navigation').count(),1,'A aplicação deve ter apenas um navegador global.');
  assert.equal(await page.getByTestId('activity-rail').count(),0);
  assert.equal(await page.locator('.overview-metrics,.start-workbench__domains').count(),0);
  const theme=await page.evaluate(()=>({accent:getComputedStyle(document.documentElement).getPropertyValue('--of-accent').trim(),bg:getComputedStyle(document.documentElement).getPropertyValue('--of-bg').trim()}));
  assert.deepEqual(theme,{accent:'#c8515e',bg:'#101012'});
  phase='import real fixture and inspect object hierarchy';
  await page.getByRole('button',{name:'Abrir projeto'}).click();await page.getByText('Projeto aberto:',{exact:false}).waitFor();
  await page.getByRole('button',{name:'CAD Sketch 2D'}).click();await page.getByTestId('cad-import-dxf').click();
  await page.getByText('DXF importado:',{exact:false}).waitFor();
  assert.equal(await page.getByTestId('cad-object-entry').count(),13);
  await assert.rejects(fs.stat(CAD),{code:'ENOENT'});
  await page.getByTestId('cad-object-entry').first().click();
  const originalId=await page.getByTestId('cad-object-entry').first().getAttribute('data-object-id');
  await page.getByLabel('Nome do objeto',{exact:true}).fill('Perfil externo');await page.getByLabel('Nome do objeto',{exact:true}).press('Tab');
  await page.getByText('Propriedades do objeto atualizadas.',{exact:true}).waitFor();
  await page.getByLabel('Método de edição geométrica').selectOption('dimensions');
  await page.getByLabel('Comprimento (mm)',{exact:true}).fill('180');await page.getByLabel('Ângulo (graus)').fill('0');
  await page.getByTestId('cad-apply-geometry').click();await page.getByText('Dimensões aplicadas.',{exact:true}).waitFor();
  await save();assert.equal((await read()).entities.find(e=>e.id===originalId).name,'Perfil externo');
  phase='undo layer creation restores a valid active layer';
  await page.getByLabel('Nome da nova camada').fill('Camada temporária');
  await page.getByRole('button',{name:'+ Criar',exact:true}).click();
  await page.getByText('Camada criada: Camada temporária',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Desfazer',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="Nome da camada ativa"]')?.value==='Contorno');
  assert.equal(await page.getByRole('treeitem',{name:/Camada temporária/}).count(),0);
  await page.getByRole('treeitem',{name:'Perfil externo',exact:true}).click();
  phase='duplicate, undo/redo and transform geometry';
  await page.getByTestId('cad-duplicate').click();await page.getByText('Objeto duplicado com deslocamento',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Desfazer',exact:true}).click();
  assert.equal(await page.getByTestId('cad-object-entry').count(),13);
  await page.getByRole('button',{name:'Refazer',exact:true}).click();
  assert.equal(await page.getByTestId('cad-object-entry').count(),14);
  await page.getByRole('treeitem',{name:'Perfil externo — cópia',exact:true}).click();
  const copiedId=await page.getByRole('treeitem',{name:'Perfil externo — cópia',exact:true}).getAttribute('data-object-id');
  await page.locator('.cad-property-section>summary').filter({hasText:/^Transformar$/}).click();
  await page.getByLabel('Deslocamento X (mm)',{exact:true}).fill('10');await page.getByLabel('Deslocamento Y (mm)',{exact:true}).fill('5');
  await page.getByLabel('Escala uniforme',{exact:true}).fill('0.5');
  await page.getByRole('button',{name:'Aplicar transformação',exact:true}).click();await page.getByText('Transformação aplicada.',{exact:true}).waitFor();
  await save();let document=await read();let copy=document.entities.find(e=>e.id===copiedId);
  assert.deepEqual(copy.a,{x:65,y:15});assert.deepEqual(copy.b,{x:155,y:15});
  phase='layer transfer, object locking and visibility';
  await page.getByLabel('Nome da nova camada').fill('Usinagem');await page.getByRole('button',{name:'+ Criar',exact:true}).click();
  await page.getByText('Camada criada: Usinagem',{exact:true}).waitFor();
  await page.getByLabel('Camada do objeto').selectOption({label:'Usinagem'});
  await page.getByRole('button',{name:'Bloquear objeto Perfil externo — cópia',exact:true}).click();
  assert.equal(await page.getByLabel('Nome do objeto',{exact:true}).isDisabled(),true);
  assert.equal(await page.getByTestId('cad-duplicate').isDisabled(),true);
  await page.getByRole('button',{name:'Desbloquear objeto Perfil externo — cópia',exact:true}).click();
  await page.getByRole('button',{name:'Ocultar objeto Perfil externo — cópia',exact:true}).click();
  assert.equal(await page.locator(`[data-entity-id="${copiedId}"]`).count(),0);
  await save();document=await read();copy=document.entities.find(e=>e.id===copiedId);
  assert.equal(copy.visible,false);assert.equal(document.layers.find(l=>l.id===copy.layerId).name,'Usinagem');
  await page.getByRole('button',{name:'Exportar SVG',exact:true}).click();await page.getByText('Arquivo SVG real exportado:',{exact:false}).waitFor();
  const exported=await fs.readFile(path.join(workspace,'.omniforge/output/cad-sketch.svg'),'utf8');
  assert.equal((exported.match(/<line /g)||[]).length,8,'Objeto oculto não pode aparecer no SVG.');
  phase='inspector width persists, compact layouts and real screenshots';
  const separator=page.getByRole('separator',{name:'Largura do inspetor CAD'});
  await separator.focus();await separator.press('End');assert.equal(await separator.getAttribute('aria-valuenow'),'420');
  await separator.press('Home');assert.equal(await separator.getAttribute('aria-valuenow'),'272');
  await separator.press('ArrowLeft');await separator.press('ArrowLeft');await separator.press('ArrowLeft');
  assert.equal(await separator.getAttribute('aria-valuenow'),'302');
  await page.getByRole('treeitem',{name:'Perfil externo',exact:true}).click();
  await page.getByRole('button',{name:'Ajustar desenho à tela',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Salvar fluxo',exact:true}).count(),0,
    'CAD deve mostrar somente o salvamento do desenho, não do fluxo inativo.');
  assert.equal(await page.locator('.cad-inspection').evaluate(el=>el.scrollTop),0);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await fs.mkdir(path.join(root,'smoke-artifacts'),{recursive:true});
  await page.screenshot({path:path.join(root,'smoke-artifacts','studio-cad-1440.png')});
  await client.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1280,800));
  await page.waitForFunction(()=>innerWidth<=1280);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const viewport=await page.getByTestId('cad-canvas').boundingBox();assert.ok(viewport.width>=500&&viewport.height>=400);
  await page.screenshot({path:path.join(root,'smoke-artifacts','studio-cad-1280.png')});
  phase='reload keeps saved CAD metadata and preference';
  await page.reload();await page.getByTestId('workspace-overview').waitFor();
  await page.getByRole('button',{name:'Abrir projeto'}).click();await page.getByText('Projeto aberto:',{exact:false}).waitFor();
  await page.locator('.react-flow__node').first().waitFor();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.screenshot({path:path.join(root,'smoke-artifacts','studio-automation.png')});
  await page.getByRole('button',{name:'CAD Sketch 2D'}).click();
  await page.getByRole('treeitem',{name:'Perfil externo',exact:true}).waitFor();
  assert.equal(await page.getByRole('separator',{name:'Largura do inspetor CAD'}).getAttribute('aria-valuenow'),'302');
  const persisted=await read();assert.equal(persisted.entities.length,14);assert.equal(persisted.entities.find(e=>e.id===copiedId).visible,false);
  assert.deepEqual(errors,[]);
  console.log('PASS Studio UX: one navigation, restrained theme, object tree, true CAD editing, undo/redo, locks, exports and persistence.');
}catch(e){console.error('[STUDIO E2E] '+phase,e);process.exitCode=1;
  if(page)try{await fs.mkdir(path.join(root,'smoke-artifacts'),{recursive:true});await page.screenshot({path:path.join(root,'smoke-artifacts','studio-failure.png')});}catch{}
}finally{
  if(client)try{const child=client.process();if(child&&child.exitCode===null)child.kill();await Promise.race([client.close().catch(()=>{}),new Promise(r=>setTimeout(r,2500))]);}catch{}
  await fs.rm(lab,{recursive:true,force:true}).catch(()=>{});clearTimeout(watchdog);process.exit(process.exitCode||0);
}
