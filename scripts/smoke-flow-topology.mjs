/** Real production Electron renderer: ELK worker, wires, undo and native output. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {_electron as electron} from 'playwright-core';
import {exampleFlow} from '../core/modules/automation/catalog.mjs';
import {saveFlow} from '../core/modules/workspace/workspace.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'of-flow-topology-'));
const workspace=path.join(temp,'workspace'),profile=path.join(temp,'profile'),artifacts=path.join(root,'smoke-artifacts');
await Promise.all([fs.mkdir(workspace),fs.mkdir(profile),fs.mkdir(artifacts,{recursive:true})]);
await saveFlow(workspace,exampleFlow(),null);
const source=path.join(workspace,'.omniforge/flows/principal.json');
let app,page,phase='boot';
const errors=[],workers=[];
const watchdog=setTimeout(()=>{console.error('[FLOW TOPOLOGY] watchdog',phase);process.exit(1);},150000);watchdog.unref();
const node=id=>page.locator(`.react-flow__node[data-id="${id}"]`);
const positions=()=>page.locator('.react-flow__node').evaluateAll(elements=>Object.fromEntries(elements.map(element=>[element.dataset.id,element.style.transform])));
const edgeCount=expected=>page.waitForFunction(count=>document.querySelectorAll('.react-flow__edge').length===count,expected);
async function expectPositions(expected){
  await page.waitForFunction(value=>JSON.stringify(Object.fromEntries([...document.querySelectorAll('.react-flow__node')].map(element=>[element.dataset.id,element.style.transform])))===JSON.stringify(value),expected);
}
async function reconnect(edgeId,side,nodeId,handleId){
  const origin=await page.locator(`.react-flow__edge[data-id="${edgeId}"] .react-flow__edgeupdater-${side}`).boundingBox();
  const target=await node(nodeId).locator(`.react-flow__handle[data-handleid="${handleId}"]`).boundingBox();
  assert.ok(origin&&target,'Endpoints need to be visible');
  await page.mouse.move(origin.x+origin.width/2,origin.y+origin.height/2);
  await page.mouse.down();
  await page.mouse.move(target.x+target.width/2,target.y+target.height/2,{steps:18});
  await page.mouse.up();
}

try{
  app=await electron.launch({args:['.'],cwd:root,timeout:45000,env:{...process.env,OMNIFORGE_E2E:'1',OMNIFORGE_E2E_USER_DATA:profile,ELECTRON_RENDERER_URL:''}});
  page=await app.firstWindow();page.setDefaultTimeout(20000);
  page.on('pageerror',error=>errors.push(error.message));page.on('worker',worker=>workers.push(worker.url()));
  await app.evaluate(({BrowserWindow,dialog},directory)=>{
    BrowserWindow.getAllWindows()[0].setSize(1440,900);dialog.showOpenDialog=async()=>({canceled:false,filePaths:[directory]});
  },workspace);
  await page.getByTestId('workspace-overview').waitFor();
  await page.getByRole('button',{name:'Abrir projeto',exact:true}).click();
  await page.getByText('Projeto aberto:',{exact:false}).waitFor();await edgeCount(2);
  const before=await positions();assert.equal(Object.keys(before).length,3);
  assert.equal(workers.some(url=>url.includes('flow-layout')),false,'ELK must not start with the editor');

  phase='real lazy worker and reversible organization';
  await page.getByTestId('flow-arrange').click();
  await page.getByText('Desfazer restaura as posições anteriores.',{exact:false}).waitFor();
  const arranged=await positions();assert.notDeepEqual(arranged,before);
  assert.ok(workers.some(url=>url.includes('flow-layout')),'ELK must execute in its real worker');
  await page.getByTestId('flow-undo').click();await expectPositions(before);
  await page.getByTestId('flow-redo').click();await expectPositions(arranged);
  await page.getByRole('button',{name:'Salvar fluxo',exact:true}).click();
  await page.getByText('Fluxo gravado em',{exact:false}).waitFor();
  const saved=JSON.parse(await fs.readFile(source,'utf8'));
  assert.deepEqual(saved.edges,exampleFlow().edges);
  assert.notDeepEqual(saved.nodes.map(item=>item.position),exampleFlow().nodes.map(item=>item.position));

  phase='actual connection inspector, keyboard tabs and upstream navigation';
  await node('selecionar').click();
  await page.getByRole('tab',{name:'Propriedades',exact:true}).focus();
  await page.keyboard.press('ArrowRight');
  await page.getByRole('tabpanel',{name:'Conexões do fluxo',exact:true}).waitFor();
  assert.equal(await page.getByTestId('flow-wire-e1').count(),1);assert.equal(await page.getByTestId('flow-wire-e2').count(),1);
  await page.getByRole('button',{name:'Ir para bloco inicio',exact:true}).click();
  assert.equal(await page.getByTestId('flow-connections').locator('.flow-connection-heading code').textContent(),'inicio');

  phase='disconnect and history retain nodes and native graph';
  await node('gravar').click();await page.getByRole('tab',{name:'Conexões',exact:true}).click();
  await page.getByRole('button',{name:'Desconectar e2',exact:true}).click();await edgeCount(1);
  assert.equal(await page.locator('.react-flow__node').count(),3);
  assert.match(await page.getByTestId('flow-port-inputs-in').textContent(),/ainda não conectada/);
  await page.getByTestId('flow-undo').click();await edgeCount(2);
  await page.getByTestId('flow-redo').click();await edgeCount(1);
  await page.getByTestId('flow-undo').click();await edgeCount(2);

  phase='endpoint reconnect preserves wire identity and remains undoable';
  await page.getByTestId('flow-fit').click();
  await page.waitForTimeout(220); // Finish the declared 180 ms viewport transition before using coordinates.
  await reconnect('e2','source','inicio','out');
  await page.waitForFunction(()=>document.querySelector('[data-testid="flow-wire-e2"]')?.textContent.includes('inicio'));
  await edgeCount(2);assert.equal(await page.getByTestId('rf__edge-e2').count(),1);
  await page.getByTestId('flow-undo').click();
  await page.waitForFunction(()=>document.querySelector('[data-testid="flow-wire-e2"]')?.textContent.includes('selecionar'));
  await page.getByTestId('flow-redo').click();
  await page.waitForFunction(()=>document.querySelector('[data-testid="flow-wire-e2"]')?.textContent.includes('inicio'));
  await page.getByTestId('flow-undo').click();
  await page.waitForFunction(()=>document.querySelector('[data-testid="flow-wire-e2"]')?.textContent.includes('selecionar'));

  phase='occupied target rejects reconnect without deleting its original wire';
  await reconnect('e2','target','selecionar','in');await edgeCount(2);
  assert.match(await page.getByTestId('flow-wire-e2').textContent(),/selecionar/);
  assert.deepEqual(JSON.parse(await fs.readFile(source,'utf8')),saved);

  phase='real execution after topology edits and undo';
  await page.getByRole('button',{name:'▶ Executar',exact:true}).click();
  await page.getByText('Execução real concluída.',{exact:false}).waitFor();
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(workspace,'.omniforge/output/venda.json'),'utf8')),JSON.parse(exampleFlow().nodes[0].config.payload).venda);
  await node('gravar').click();await page.getByRole('tab',{name:'Conexões',exact:true}).click();
  await page.screenshot({path:path.join(artifacts,'flow-topology-1440.png')});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1280,800));
  await page.waitForFunction(()=>innerWidth<=1280);
  await page.getByTestId('flow-fit').click();
  await page.waitForFunction(()=>{
    const canvas=document.querySelector('.react-flow')?.getBoundingClientRect();
    return canvas&&[...document.querySelectorAll('.react-flow__node')].every(element=>{
      const bounds=element.getBoundingClientRect();
      return bounds.left>=canvas.left&&bounds.right<=canvas.right&&bounds.top>=canvas.top&&bounds.bottom<=canvas.bottom;
    });
  });
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
  await page.screenshot({path:path.join(artifacts,'flow-topology-1280.png')});
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(artifacts,'flow-topology-results.json'),JSON.stringify({status:'PASS',
    checks:['lazy-real-ELK-worker','atomic-layout-undo-redo','saved-topology-preserved','keyboard-inspector-tabs',
      'port-navigation','disconnect-undo-redo','pointer-reconnection','occupied-port-rejected','actual-runner-output','compact-viewport-fit'],
    screenshots:['flow-topology-1440.png','flow-topology-1280.png'],rendererErrors:errors},null,2)+'\n');
  console.log('PASS flow topology: real lazy ELK worker, reversible layout, port navigation, native reconnect, occupied-port rejection, atomic undo and actual output.');
}catch(error){
  console.error('[FLOW TOPOLOGY] phase='+phase,error);process.exitCode=1;
  await page?.screenshot({path:path.join(artifacts,'flow-topology-failure.png')}).catch(()=>{});
  await fs.writeFile(path.join(artifacts,'flow-topology-failure.json'),JSON.stringify({phase,errors,workers,message:error.message},null,2));
}finally{
  if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await Promise.race([app.close().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,2500))]);}
  await fs.rm(temp,{recursive:true,force:true}).catch(()=>{});clearTimeout(watchdog);process.exit(process.exitCode||0);
}
