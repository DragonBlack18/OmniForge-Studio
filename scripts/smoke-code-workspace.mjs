/** v0.8.2: real Monaco multi-document editing, TS services, diff and guarded saves. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {_electron as electron} from 'playwright-core';
import {waitForPageState} from './lib/wait-for-state.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const lab=await fs.mkdtemp(path.join(os.tmpdir(),'omni-ide-workspace-'));
const workspace=path.join(lab,'Oficina-Engenharia'),profile=path.join(lab,'profile');
await Promise.all([fs.mkdir(workspace),fs.mkdir(profile)]);await fs.mkdir(path.join(workspace,'src'));
const sourceA=["import { massa } from './geometria';",'export const resultado: number = massa(2, 3);',
  'export const descricao: string = 42;',''].join('\n');
const sourceB='export function massa(volume: number, densidade: number): number {\n  return volume * densidade;\n}\n';
const sourcePy='def custo(quantidade, preco):\n    return quantidade * preco\n';
await fs.writeFile(path.join(workspace,'src','main.ts'),sourceA);
await fs.writeFile(path.join(workspace,'src','geometria.ts'),sourceB);
await fs.writeFile(path.join(workspace,'src','calculo.py'),sourcePy);
let app,page,phase='boot';const pageErrors=[];const artifacts=path.join(root,'smoke-artifacts');
await fs.mkdir(artifacts,{recursive:true});
const watchdog=setTimeout(()=>{console.error('[CODE WORKSPACE] timeout '+phase);process.exit(1);},200000);watchdog.unref();
async function shot(name){await page.screenshot({path:path.join(artifacts,'ide-workspace-'+name+'-v082.png')});}
async function openFile(relative){await page.getByRole('treeitem').filter({hasText:relative.split('/').at(-1)}).click();await page.locator('.code-live-editor .monaco-editor').waitFor();}
async function checkpoint(relative,content){
  await waitForPageState(page,async({workspace,relative,content})=>{
    const record=await window.omni.readEditorDraft(workspace,relative);
    return record?.content===content;
  },{workspace,relative,content},{timeout:20000,description:'checkpoint integral de '+relative});
}
try{
  app=await electron.launch({args:['.'],cwd:root,timeout:45000,env:{...process.env,OMNIFORGE_E2E:'1',OMNIFORGE_E2E_USER_DATA:profile,ELECTRON_RENDERER_URL:''}});
  page=await app.firstWindow({timeout:45000});page.setDefaultTimeout(20000);
  page.on('pageerror',error=>pageErrors.push(error.message));
  assert.equal(path.normalize(await app.evaluate(({app})=>app.getPath('userData'))).toLowerCase(),path.normalize(profile).toLowerCase());
  await app.evaluate(({BrowserWindow,dialog},workspace)=>{
    BrowserWindow.getAllWindows()[0].setSize(1440,900);
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[workspace]});
    dialog.showMessageBox=async()=>({response:0});
  },workspace);
  await page.getByRole('button',{name:'Abrir projeto',exact:true}).click();
  await page.getByText('Projeto aberto:',{exact:false}).waitFor();
  await page.getByTestId('primary-sidebar').getByRole('button',{name:'Editor de código',exact:true}).click();
  phase='real TypeScript diagnostic and multi-model definition';
  await openFile('src/geometria.ts');await openFile('src/main.ts');
  await page.getByTestId('code-problem').filter({hasText:'2322'}).waitFor({timeout:30000});
  assert.equal(await page.getByTestId('code-document-tab').count(),2);
  await shot('diagnostics');
  await page.locator('.code-live-editor .monaco-editor').click();
  await page.keyboard.press('Control+Home');
  for(let i=0;i<10;i++)await page.keyboard.press('ArrowRight');
  await page.keyboard.press('F12');
  await page.getByRole('tab',{name:'geometria.ts',exact:true,selected:true}).waitFor();
  phase='navigation tree uses real TypeScript language service';
  await page.getByRole('tab',{name:'Estrutura',exact:true}).click();
  await page.getByTestId('code-symbol').filter({hasText:'massa'}).first().waitFor();
  await page.getByTestId('code-symbol').filter({hasText:'massa'}).first().click();
  await shot('structure');

  phase='unsaved tabs, retained undo and whole text checkpoints';
  await page.getByRole('tab',{name:'main.ts',exact:true}).click();
  await page.locator('.code-live-editor .monaco-editor').click();await page.keyboard.press('Control+End');
  await page.keyboard.type('// revisao local A');
  const changedA=sourceA+'// revisao local A';
  await checkpoint('src/main.ts',changedA);
  await openFile('src/calculo.py');
  await page.locator('.code-live-editor .monaco-editor').click();await page.keyboard.press('Control+End');
  await page.keyboard.insertText('# revisao local B');const changedPy=sourcePy+'# revisao local B';
  await checkpoint('src/calculo.py',changedPy);
  assert.equal(await fs.readFile(path.join(workspace,'src','main.ts'),'utf8'),sourceA);
  assert.equal(await fs.readFile(path.join(workspace,'src','calculo.py'),'utf8'),sourcePy);
  await page.getByRole('tab',{name:/^main.ts/}).click();
  await page.locator('.code-live-editor .monaco-editor').click();
  await page.keyboard.press('Control+z');
  await page.waitForFunction(()=>!document.querySelector('.code-live-editor .view-lines')?.textContent.includes('revisao'));
  await page.keyboard.press('Control+y');await checkpoint('src/main.ts',changedA);
  await page.getByTestId('primary-sidebar').getByRole('button',{name:'CAD Sketch 2D'}).click();
  await page.getByTestId('cad-workbench').waitFor();
  await page.getByTestId('primary-sidebar').getByRole('button',{name:'Editor de código',exact:true}).click();
  assert.equal(await page.getByTestId('code-document-tab').count(),3);
  await page.getByRole('button',{name:'Comparar alterações',exact:true}).click();
  await page.getByTestId('code-review').waitFor();
  await page.locator('.code-review .monaco-diff-editor').waitFor();
  await shot('review');
  await page.getByRole('button',{name:'Voltar ao editor',exact:true}).click();
  await page.getByRole('button',{name:'Salvar todos',exact:true}).click();
  await page.getByText('2 arquivo(s) salvos.',{exact:false}).waitFor();
  assert.equal(await fs.readFile(path.join(workspace,'src','main.ts'),'utf8'),changedA);
  assert.equal(await fs.readFile(path.join(workspace,'src','calculo.py'),'utf8'),changedPy);

  phase='cancel and discard only the selected tab without erasing originals';
  await page.getByRole('tab',{name:'calculo.py',exact:true}).click();
  await page.locator('.code-live-editor .monaco-editor').click();await page.keyboard.press('Control+End');
  await page.keyboard.insertText('\n# descartar somente esta edicao');
  await page.getByRole('button',{name:'Fechar src/calculo.py',exact:true}).click();
  await page.getByRole('dialog',{name:'Fechar documento com alterações'}).waitFor();
  await shot('close-guard');
  await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  assert.equal(await page.getByTestId('code-document-tab').count(),3);
  await page.getByRole('button',{name:'Fechar src/calculo.py',exact:true}).click();
  await page.getByRole('button',{name:'Descartar alterações',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('[data-testid="code-document-tab"]').length===2);
  assert.equal(await fs.readFile(path.join(workspace,'src','calculo.py'),'utf8'),changedPy);

  phase='disk conflict refuses overwrite and preserves live editor text';
  await page.getByRole('tab',{name:'main.ts',exact:true}).click();
  await page.locator('.code-live-editor .monaco-editor').click();await page.keyboard.press('Control+End');
  await page.keyboard.insertText('\n// edicao posterior');
  const outside=changedA+'\n// alterado fora do OmniForge';await fs.writeFile(path.join(workspace,'src','main.ts'),outside);
  await page.getByRole('button',{name:'Salvar arquivo',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Salvamento recusado:'}).waitFor();
  assert.equal(await fs.readFile(path.join(workspace,'src','main.ts'),'utf8'),outside);
  const visible=await page.locator('.code-live-editor .view-lines').textContent();assert.match(visible,/edicao\s+posterior/);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1280,800));
  await page.getByRole('tab',{name:/Problemas/}).click();
  await shot('compact-conflict');
  assert.deepEqual(pageErrors,[],'Exceções de renderer não podem ser ignoradas.');
  await fs.writeFile(path.join(artifacts,'ide-workspace-v082-results.json'),JSON.stringify({
    schemaVersion:1,version:'0.8.2',result:'PASS',screenshots:5,
    checks:['typescript-real-error-2322','cross-document-F12','semantic-outline','independent-dirty-tabs',
      'native-model-undo-after-tab-switch','two-real-draft-checkpoints','CAD-navigation-retains-tabs','read-only-diff',
      'explicit-save-all-real-files','cancel-dirty-close','discard-only-selected-tab','external-change-refuses-overwrite'],
    data:'Synthetic temporary engineering workspace, no personal content.',limitations:'JS/TS services cover opened models; Python LSP/DAP and terminal are not part of this test.'
  },null,2)+'\n');
  console.log('PASS IDE workspace: multi-document editing, real TypeScript services, diff, checkpoints, save-all and conflicts.');
  phase='pass';
}catch(error){
  console.error('[CODE WORKSPACE] phase='+phase,error);process.exitCode=1;
  if(page&&!page.isClosed())await page.screenshot({path:path.join(artifacts,'ide-workspace-failure-v082.png')}).catch(()=>{});
}finally{
  if(app){try{const child=app.process();if(child&&child.exitCode===null)child.kill();await Promise.race([app.close().catch(()=>{}),new Promise(r=>setTimeout(r,2500))]);}catch{}}
  await fs.rm(lab,{recursive:true,force:true}).catch(()=>{});clearTimeout(watchdog);process.exit(process.exitCode||0);
}
