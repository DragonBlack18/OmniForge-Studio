/** Real Electron editing + native runner. No mocked graph, output, or IPC implementation. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {_electron as electron} from 'playwright-core';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'of-flow-authoring-'));
const workspace=path.join(temp,'workspace'),profile=path.join(temp,'profile'),artifacts=path.join(root,'smoke-artifacts');
await Promise.all([fs.mkdir(workspace),fs.mkdir(profile),fs.mkdir(artifacts,{recursive:true})]);
const flowFile=path.join(workspace,'.omniforge/flows/principal.json');
let app,page,phase='boot';
const errors=[];
const watchdog=setTimeout(()=>{console.error('[FLOW AUTHORING] watchdog',phase);process.exit(1);},180000);watchdog.unref();
const nodes=()=>page.locator('.react-flow__node');
async function count(expected){await page.waitForFunction(n=>document.querySelectorAll('.react-flow__node').length===n,expected);}
async function connections(expected){
  // Undo replaces node geometry. React Flow measures the new nodes before
  // rendering their edges, so locator.count() immediately after click races
  // ResizeObserver. Keep the exact invariant, with a bounded observable wait.
  await page.waitForFunction(n=>{
    const edges=[...document.querySelectorAll('.react-flow__edge')];
    return edges.length===n&&edges.every(edge=>{
      const d=edge.querySelector('.react-flow__edge-path')?.getAttribute('d');
      return typeof d==='string'&&d.length>0&&!/NaN|Infinity/.test(d);
    });
  },expected,{timeout:15000});
  assert.equal(await page.locator('.react-flow__edge').count(),expected);
}
async function nav(name){await page.getByTestId('primary-sidebar').getByRole('button',{name,exact:true}).click();}
async function select(id){await page.locator('.react-flow__node[data-id="'+id+'"]').click();}
async function connect(source,target){
  const a=await page.locator('.react-flow__node[data-id="'+source+'"] .react-flow__handle[data-handleid="out"]').boundingBox();
  const b=await page.locator('.react-flow__node[data-id="'+target+'"] .react-flow__handle[data-handleid="in"]').boundingBox();
  assert.ok(a&&b,'Portas reais precisam estar visíveis.');
  await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:15});await page.mouse.up();
}
try{
  app=await electron.launch({args:['.'],cwd:root,timeout:45000,env:{...process.env,OMNIFORGE_E2E:'1',OMNIFORGE_E2E_USER_DATA:profile,ELECTRON_RENDERER_URL:''}});
  page=await app.firstWindow();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  await app.evaluate(({BrowserWindow,dialog},dir)=>{BrowserWindow.getAllWindows()[0].setSize(1440,900);dialog.showOpenDialog=async()=>({canceled:false,filePaths:[dir]});},workspace);
  assert.equal(path.normalize(await app.evaluate(({app})=>app.getPath('userData'))),path.normalize(profile));
  await page.getByTestId('workspace-overview').waitFor();
  phase='single searchable navigator';
  assert.equal(await page.getByRole('navigation',{name:'Navegação principal'}).count(),1);
  await page.getByLabel('Localizar ferramenta').fill('cad');assert.equal(await page.getByRole('button',{name:'CAD Sketch 2D',exact:true}).count(),1);
  assert.equal(await page.getByRole('button',{name:'Central de Tarefas',exact:true}).count(),0);await page.getByLabel('Localizar ferramenta').press('Escape');
  await page.getByRole('button',{name:'Abrir projeto',exact:true}).click();await page.getByText('Projeto aberto:',{exact:false}).waitFor();await count(3);await connections(2);
  await page.getByRole('button',{name:'Salvar fluxo',exact:true}).click();await page.getByText('Fluxo gravado em',{exact:false}).waitFor();
  const original=await fs.readFile(flowFile);
  assert.equal(await page.getByTestId('flow-undo').isDisabled(),true);
  phase='duplicate, structural diagnostic and node focus';
  await select('selecionar');await page.getByTestId('flow-duplicate').click();await count(4);
  const copy=await nodes().evaluateAll(elements=>elements.map(e=>e.dataset.id).find(id=>!['inicio','selecionar','gravar'].includes(id)));
  await page.getByRole('button',{name:'Validar',exact:true}).click();await page.getByRole('tabpanel',{name:'Diagnóstico do fluxo'}).waitFor();
  await page.getByTestId('flow-diagnostic').filter({hasText:copy}).first().click();await page.getByRole('tabpanel',{name:'Propriedades do fluxo'}).waitFor();
  assert.match(await page.locator('.flow-object-id').textContent(),new RegExp(copy));
  await page.getByTestId('flow-fit').click();
  await page.waitForTimeout(220); // Bound the explicit 180ms viewport transition before mouse coordinates.
  phase='native wire connection and duplicate-input rejection';
  await connect('selecionar',copy);await connections(3);
  await connect('inicio',copy);await connections(3);
  await page.getByTestId('flow-undo').click();await connections(2);
  phase='repeated undo/redo preserves real wires after node measurement';
  for(let cycle=0;cycle<3;cycle++){
    await page.getByTestId('flow-redo').click();await count(4);await connections(3);
    await page.getByTestId('flow-undo').click();await count(4);await connections(2);
  }
  phase='delete + undo restores incident edges as one operation';
  await page.getByTestId('flow-delete').click();await count(3);await connections(2);
  await page.getByTestId('flow-undo').click();await count(4);await connections(2);
  await page.getByTestId('flow-redo').click();await count(3);await connections(2);
  await select('selecionar');await page.keyboard.press('Delete');await count(2);await connections(0);
  await page.getByTestId('flow-undo').click();await count(3);await connections(2);
  phase='auto arrange and outline navigation do not write to disk';
  await page.getByTestId('flow-arrange').click();
  await page.getByRole('tab',{name:'Estrutura',exact:true}).click();await page.getByLabel('Localizar bloco no fluxo').fill('gravar');
  await page.getByTestId('flow-outline-gravar').click();assert.equal(await page.locator('.flow-object-id').textContent(),'gravar');
  assert.deepEqual(await fs.readFile(flowFile),original);
  phase='explicit save verifies undo-restored topology in the native file';
  await page.getByRole('button',{name:'Salvar fluxo',exact:true}).click();await page.getByText('Fluxo gravado em',{exact:false}).waitFor();
  const restored=JSON.parse(await fs.readFile(flowFile,'utf8')),baseline=JSON.parse(original.toString('utf8'));
  assert.deepEqual(restored.nodes.map(n=>n.id).sort(),baseline.nodes.map(n=>n.id).sort());
  assert.deepEqual(restored.edges,baseline.edges);
  phase='new template, real execution and file output';
  await page.evaluate(()=>{window.confirm=()=>true;});
  await nav('Modelos de fluxo');await page.locator('article').filter({hasText:'Preparar registros'}).getByRole('button',{name:'Usar modelo'}).click();await count(5);
  await page.getByRole('button',{name:'▶ Executar',exact:true}).click();await page.getByText('Execução real concluída.',{exact:false}).waitFor();
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(workspace,'.omniforge/output/registros.json'),'utf8')),[{codigo:1,total:120},{codigo:2,total:80}]);
  await page.getByRole('button',{name:'Salvar fluxo',exact:true}).click();await page.getByText('Fluxo gravado em',{exact:false}).waitFor();
  assert.equal(JSON.parse(await fs.readFile(flowFile,'utf8')).name,'Preparar registros');
  phase='capture actual window and verify compact size';
  await page.getByTestId('flow-fit').click();await page.screenshot({path:path.join(artifacts,'flow-authoring-1440.png')});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1280,800));
  await page.screenshot({path:path.join(artifacts,'flow-authoring-1280.png')});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2),false);
  phase='reload reads saved graph and no renderer errors';
  await page.reload();await page.getByTestId('workspace-overview').waitFor();await page.getByRole('button',{name:'Abrir projeto',exact:true}).click();await count(5);
  assert.equal(await page.getByTestId('flow-undo').isDisabled(),true);assert.deepEqual(errors,[]);
  console.log('PASS flow authoring: real wires, repeated history, persisted topology, diagnostics, search, layout, new runner tools and saved JSON.');
}catch(error){
  console.error('[FLOW AUTHORING] phase='+phase,error);process.exitCode=1;
  await page?.screenshot({path:path.join(artifacts,'flow-authoring-failure.png')}).catch(()=>{});
  await fs.writeFile(path.join(artifacts,'flow-authoring-failure.json'),JSON.stringify({phase,errors,message:error.message},null,2));
}finally{
  if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await Promise.race([app.close().catch(()=>{}),new Promise(r=>setTimeout(r,2500))]);}
  await fs.rm(temp,{recursive:true,force:true}).catch(()=>{});clearTimeout(watchdog);process.exit(process.exitCode||0);
}
