/** v0.8.1: real Electron layout, per-project persistence, focus and non-destructive documents. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {_electron as electron} from 'playwright-core';
import {exampleFlow} from '../core/modules/automation/catalog.mjs';
import {saveFlow} from '../core/modules/workspace/workspace.mjs';
import {initialCadSketch,makeCadEntity,addCadEntity} from '../core/modules/cad/cad2d.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const lab=await fs.mkdtemp(path.join(os.tmpdir(),'of-layout-e2e-'));
const a=path.join(lab,'Oficina-A'),b=path.join(lab,'Oficina-B'),profile=path.join(lab,'profile');
const artifacts=path.join(root,'smoke-artifacts');
await Promise.all([fs.mkdir(a),fs.mkdir(b),fs.mkdir(profile),fs.mkdir(artifacts,{recursive:true})]);
await saveFlow(a,exampleFlow(),null);await saveFlow(b,exampleFlow(),null);
const code='// Oficina local: cálculo de materiais\nexport function massa(volume, densidade) {\n  return volume * densidade;\n}\n';
await fs.writeFile(path.join(a,'materiais.js'),code);
let sketch=initialCadSketch();
sketch=addCadEntity(sketch,{...makeCadEntity('rectangle',{x:0,y:0},{x:180,y:110}),name:'Placa de montagem'});
for(const [x,y] of [[25,25],[155,25],[25,85],[155,85]])sketch=addCadEntity(sketch,{...makeCadEntity('circle',{x,y},{x:x+6,y}),name:`Furo ${x}/${y}`});
sketch=addCadEntity(sketch,{...makeCadEntity('circle',{x:90,y:55},{x:116,y:55}),name:'Abertura central'});
await fs.mkdir(path.join(a,'.omniforge','cad'));const cadPath=path.join(a,'.omniforge','cad','sketch.json');await fs.writeFile(cadPath,JSON.stringify(sketch,null,2)+'\n');
const flowPath=path.join(a,'.omniforge','flows','principal.json');
const baseline={cad:await fs.readFile(cadPath),flow:await fs.readFile(flowPath)};
let app,page,phase='boot';const errors=[],shots=[];
const watchdog=setTimeout(()=>{console.error('[LAYOUT] timeout',phase);process.exit(1);},200000);watchdog.unref();
const nav=()=>page.getByTestId('primary-sidebar');
async function openProject(folder) {
  // Windows temp paths may use an 8.3 alias; compare the same canonical path as the core.
  folder=await fs.realpath(folder);
  await app.evaluate(({dialog},dir)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[dir]});},folder);
  await page.getByRole('button',{name:'Abrir projeto',exact:true}).click();
  await page.waitForFunction(dir=>document.querySelector('.topbar-workspace')?.title===dir,folder);
  await page.locator('.app-shell[data-layout-mode="canvas"]').waitFor();
  await page.locator('.react-flow__node').first().waitFor();
}
async function paint(){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function snapshot(name) {
  await paint();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Sem overflow horizontal.');
  const filename=`layout-${name}-v081.png`;await page.screenshot({path:path.join(artifacts,filename)});shots.push({file:filename,viewport:await page.evaluate(()=>({width:innerWidth,height:innerHeight})),phase});
}
async function options(){await page.getByTestId('layout-open').click();await page.getByTestId('layout-options').waitFor();}
async function start(){
 app=await electron.launch({args:['.'],cwd:root,timeout:45000,env:{...process.env,OMNIFORGE_E2E:'1',OMNIFORGE_E2E_USER_DATA:profile,ELECTRON_RENDERER_URL:''}});
 page=await app.firstWindow({timeout:45000});page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
 const actual=await app.evaluate(({app,BrowserWindow})=>{BrowserWindow.getAllWindows()[0].setSize(1440,900);return app.getPath('userData');});
 assert.equal(path.normalize(actual).toLowerCase(),path.normalize(profile).toLowerCase());
 await page.getByTestId('workspace-overview').waitFor();
}
async function stop(){
 const client=app;if(!client)return;app=null;const child=client.process();
 const exit=new Promise(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',resolve);});
 await client.evaluate(({app})=>app.exit(0)).catch(()=>{});
 await Promise.race([exit,new Promise(r=>setTimeout(r,4000))]);if(child.exitCode===null)child.kill();await client.close().catch(()=>{});
}
try {
 await start();assert.equal(await page.getByRole('navigation').count(),1);await openProject(a);
 const scopeA=await page.locator('.app-shell').getAttribute('data-layout-scope');assert.notEqual(scopeA,'global');
 phase='real pointer resize and keyboard bounds';
 let separator=page.getByRole('separator',{name:'Largura da navegação',exact:true});
 const box=await separator.boundingBox();const initial=Number(await separator.getAttribute('aria-valuenow'));
 await page.mouse.move(box.x+3,box.y+150);await page.mouse.down();await page.mouse.move(box.x+43,box.y+150,{steps:8});await page.mouse.up();
 await page.waitForFunction(value=>Number(document.querySelector('[aria-label="Largura da navegação"]').getAttribute('aria-valuenow'))===value,initial+40);
 let context=page.getByRole('separator',{name:'Largura do painel de ferramentas',exact:true});await context.focus();await context.press('ArrowRight');await context.press('ArrowRight');
 let inspector=page.getByRole('separator',{name:'Largura do inspetor de automações',exact:true});await inspector.focus();await inspector.press('ArrowLeft');await inspector.press('ArrowLeft');
 assert.equal(await context.getAttribute('aria-valuenow'),'244');assert.equal(await inspector.getAttribute('aria-valuenow'),'298');
 const savedLayout=await page.evaluate(()=>localStorage.getItem('of.workbench.layout.v1'));
 phase='cancel pointer gesture without writing preferences';
 const before=Number(await separator.getAttribute('aria-valuenow')),rect=await separator.boundingBox();
 await page.mouse.move(rect.x+3,rect.y+160);await page.mouse.down();await page.mouse.move(rect.x+33,rect.y+160,{steps:4});
 await page.keyboard.press('Escape');await page.mouse.up();await paint();assert.equal(Number(await separator.getAttribute('aria-valuenow')),before);
 assert.equal(await page.evaluate(()=>localStorage.getItem('of.workbench.layout.v1')),savedLayout);
 phase='focus preserves unsaved graph, selection, inspector tab and history';
 await page.locator('.react-flow__node').first().click();await page.getByTestId('flow-duplicate').click();
 await page.waitForFunction(()=>document.querySelectorAll('.react-flow__node').length===4);
 await page.getByRole('tab',{name:'Estrutura',exact:true}).click();await page.getByLabel('Localizar bloco no fluxo').fill('manual');
 const canvasBefore=await page.locator('.react-flow').boundingBox();
 await page.keyboard.press('Control+Shift+F11');await page.getByTestId('layout-exit-focus').waitFor();
 assert.equal(await nav().isVisible(),false);assert.equal(await page.getByRole('navigation').count(),0);
 assert.equal(await page.locator('.react-flow__node').count(),4);assert.ok((await page.locator('.react-flow').boundingBox()).width>canvasBefore.width+500);
 await page.getByTestId('layout-exit-focus').click();
 assert.equal(await page.getByRole('tab',{name:'Estrutura',exact:true}).getAttribute('aria-selected'),'true');
 assert.equal(await page.getByLabel('Localizar bloco no fluxo').inputValue(),'manual');
 assert.equal(await page.evaluate(()=>localStorage.getItem('of.workbench.layout.v1')),savedLayout);
 await page.getByTestId('flow-undo').click();await page.waitForFunction(()=>document.querySelectorAll('.react-flow__node').length===3);
 await page.getByRole('tab',{name:'Propriedades',exact:true}).click();await snapshot('automation-1440');
 await options();await snapshot('preferences-1440');await page.keyboard.press('Escape');assert.equal(await page.getByTestId('layout-open').evaluate(el=>el===document.activeElement),true);
 phase='CAD focus preserves selected object and edits without remount';
 await nav().getByRole('button',{name:'CAD Sketch 2D',exact:true}).click();await page.getByRole('treeitem',{name:'Placa de montagem',exact:true}).click();
 const name=page.getByLabel('Nome do objeto',{exact:true});await name.fill('Placa revisada');await name.press('Tab');
 await page.getByText('Propriedades do objeto atualizadas.',{exact:true}).waitFor();
 let cadSeparator=page.getByRole('separator',{name:'Largura do inspetor CAD',exact:true});await cadSeparator.focus();await cadSeparator.press('ArrowLeft');await cadSeparator.press('ArrowLeft');
 await page.getByRole('button',{name:'Ajustar desenho à tela',exact:true}).click();await snapshot('cad-1440');
 await page.keyboard.press('Control+Shift+F11');assert.equal(await page.locator('#cad-properties').isVisible(),false);await snapshot('cad-focus-1440');
 await page.getByTestId('layout-exit-focus').click();assert.equal(await name.inputValue(),'Placa revisada');assert.equal(await cadSeparator.getAttribute('aria-valuenow'),'330');
 await page.getByRole('button',{name:'Desfazer',exact:true}).click();
 phase='Monaco stays mounted with unsaved source through focus and compact view';
 await page.keyboard.press('Control+p');await page.getByRole('searchbox',{name:'Pesquisar arquivos'}).fill('materiais.js');await page.getByRole('option',{name:/materiais.js/}).click();
 await page.locator('.monaco-editor').first().waitFor();await page.locator('.monaco-editor').first().click();await page.keyboard.press('Control+End');await page.keyboard.type('\n// revisao local');
 const saveFile=page.getByRole('button',{name:'Salvar arquivo',exact:true});await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(el=>el.textContent==='Salvar arquivo'&&!el.disabled));
 await page.evaluate(()=>{window.__layoutMonacoElement=document.querySelector('.monaco-editor');});
 await page.keyboard.press('Control+Shift+F11');await page.getByTestId('layout-exit-focus').waitFor();await page.getByTestId('layout-exit-focus').click();assert.equal(await saveFile.isEnabled(),true);
 assert.equal(await page.evaluate(()=>window.__layoutMonacoElement===document.querySelector('.monaco-editor')),true,'Foco não deve remontar Monaco.');
 assert.match(await page.locator('.monaco-editor .view-lines').first().innerText(),/revisao[\s\u00a0]+local/);
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1280,800));await page.waitForFunction(()=>innerWidth<=1280);await snapshot('code-1280');
 assert.equal(await fs.readFile(path.join(a,'materiais.js'),'utf8'),code);
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,900));
 phase='separate project profiles and actual process restart';
 await openProject(b);const scopeB=await page.locator('.app-shell').getAttribute('data-layout-scope');assert.notEqual(scopeA,scopeB);
 assert.equal(await separator.getAttribute('aria-valuenow'),'184');assert.equal(await inspector.getAttribute('aria-valuenow'),'278');
 await options();await page.getByRole('button',{name:'Área ampla',exact:true}).click();await page.keyboard.press('Escape');
 assert.equal(await page.getByTestId('context-sidebar').count(),0);assert.match(await nav().getAttribute('class'),/collapsed/);
 await openProject(a);assert.equal(await separator.getAttribute('aria-valuenow'),String(before));assert.equal(await inspector.getAttribute('aria-valuenow'),'298');
 await stop();await start();assert.equal(await page.locator('.app-shell').getAttribute('data-layout-scope'),'global');
 // A restarted Electron process has a new Page; never query locators from the closed session.
 separator=page.getByRole('separator',{name:'Largura da navegação',exact:true});
 context=page.getByRole('separator',{name:'Largura do painel de ferramentas',exact:true});
 inspector=page.getByRole('separator',{name:'Largura do inspetor de automações',exact:true});
 cadSeparator=page.getByRole('separator',{name:'Largura do inspetor CAD',exact:true});
 await openProject(a);assert.equal(await separator.getAttribute('aria-valuenow'),String(before));assert.equal(await context.getAttribute('aria-valuenow'),'244');assert.equal(await inspector.getAttribute('aria-valuenow'),'298');
 // Focus is intentionally never persisted. Recoverable drafts remain separate.
 assert.equal(await page.getByTestId('layout-exit-focus').count(),0);
 await nav().getByRole('button',{name:'CAD Sketch 2D',exact:true}).click();await cadSeparator.waitFor();assert.equal(await cadSeparator.getAttribute('aria-valuenow'),'330');
 await options();await page.getByRole('button',{name:'Restaurar layout deste projeto',exact:true}).click();assert.equal(await cadSeparator.getAttribute('aria-valuenow'),'310');
 const profiles=await page.evaluate(()=>JSON.parse(localStorage.getItem('of.workbench.layout.v1')).profiles);
 assert.equal(profiles.find(p=>p.scope===scopeB).layout.canvas.contextOpen,false);
 assert.deepEqual(await fs.readFile(cadPath),baseline.cad);assert.deepEqual(await fs.readFile(flowPath),baseline.flow);assert.equal(await fs.readFile(path.join(a,'materiais.js'),'utf8'),code);
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(artifacts,'layout-v081-results.json'),JSON.stringify({version:'0.8.1',status:'PASS',screenshots:shots,
   checks:['pointer-resize','keyboard-resize','escape-cancels-gesture','scope-isolation','native-process-restart','focus-no-remount','graph-undo','CAD-unsaved-properties','Monaco-unsaved-source','reset-selected-scope','source-bytes-unchanged'],
   screenshotData:'Local test fixtures, not user projects; captured from real Electron.'},null,2)+'\n');
 console.log('PASS v0.8.1 layouts: real pointer/keyboard, two projects, process restart, focus, graph/CAD/Monaco retention, original files unchanged.');
} catch(error){console.error('[LAYOUT] phase='+phase,error);process.exitCode=1;if(page)await page.screenshot({path:path.join(artifacts,'layout-failure-v081.png')}).catch(()=>{});}
finally{await stop();await fs.rm(lab,{recursive:true,force:true}).catch(()=>{});clearTimeout(watchdog);process.exit(process.exitCode||0);}
