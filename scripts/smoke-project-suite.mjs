/** v0.9.0 acceptance: native creation, actual files, original templates and real data flows. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {_electron as electron} from 'playwright-core';
import {waitForState,waitForPageState} from './lib/wait-for-state.mjs';
import {fileTemplate,projectTemplate} from '../core/modules/ide/project-templates.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const lab=await fs.mkdtemp(path.join(os.tmpdir(),'omni-project-suite-'));
const profile=path.join(lab,'profile'),workspace=path.join(lab,'Oficina-Arquivos'),parent=path.join(lab,'Projetos');
await Promise.all([fs.mkdir(profile),fs.mkdir(workspace),fs.mkdir(parent)]);
const artifacts=path.join(root,'smoke-artifacts');await fs.mkdir(artifacts,{recursive:true});
let app,page,phase='boot',shots=0;const errors=[],checks=[];
const watchdog=setTimeout(()=>{console.error('[PROJECT SUITE] TIMEOUT '+phase);process.exit(1);},240000);watchdog.unref();
const screenshot=async name=>{await page.screenshot({path:path.join(artifacts,'project-suite-'+name+'-v090.png')});shots++;};
const nativePicker=async directory=>app.evaluate(({dialog},dir)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[dir]});},directory);
const create=async name=>{await page.locator('.studio-create-menu summary').click();await page.locator('.studio-create-menu').getByRole('button',{name,exact:true}).click();};
const docAction=async name=>{await page.locator('.code-commandbar summary').filter({hasText:'Documento'}).click();await page.locator('.code-commandbar').getByRole('button',{name,exact:true}).click();};
const modal=()=>page.getByTestId('authoring-dialog');
const waitClosed=()=>modal().waitFor({state:'hidden'});
const nav=async name=>page.getByTestId('primary-sidebar').getByRole('button',{name,exact:true}).click();
try{
  app=await electron.launch({args:['.'],cwd:root,timeout:45000,env:{...process.env,OMNIFORGE_E2E:'1',OMNIFORGE_E2E_USER_DATA:profile,ELECTRON_RENDERER_URL:''}});
  page=await app.firstWindow({timeout:45000});page.setDefaultTimeout(20000);
  page.on('pageerror',error=>{errors.push(error.message);console.error('[PROJECT SUITE renderer]',phase,error.stack||error.message);});
  // Electron owns native window.confirm dialogs. CDP dialog.accept can race
  // with that native adapter; fixture decisions are controlled explicitly,
  // as in the existing recovery/flow acceptance suites. Native file/task
  // consent stays separately asserted through dialog.showMessageBox below.
  await page.evaluate(()=>{window.confirm=message=>{
    if(!/^(?:Existem alterações não salvas\.|Carregar modelo de fluxo\?)/.test(message))
      throw new Error('Confirmação inesperada no teste: '+message);
    return true;
  };});
  assert.equal(path.normalize(await app.evaluate(({app})=>app.getPath('userData'))).toLowerCase(),path.normalize(profile).toLowerCase());
  await app.evaluate(({BrowserWindow,dialog})=>{BrowserWindow.getAllWindows()[0].setSize(1440,900);dialog.showMessageBox=async()=>({response:1});});
  await nativePicker(workspace);await page.getByTestId('workspace-overview').waitFor();
  phase='new document without existing project or file';
  await page.getByRole('button',{name:'Novo documento',exact:true}).click();
  await page.getByTestId('untitled-notice').waitFor();await page.locator('.code-live-editor .monaco-editor').waitFor();
  await page.locator('.code-live-editor .monaco-editor').click();
  // A fresh Monaco model uses the native platform EOL. Keep disk assertions
  // byte-exact: normalize neither the saved file nor the nonempty LF templates.
  const typedText='export const oficina = "Peça local";\n';
  const text=typedText.replace(/\n/g,os.EOL);await page.keyboard.type(typedText);
  assert.deepEqual(await fs.readdir(workspace),[]);await screenshot('untitled');checks.push('untitled-without-project');
  phase='Save As attaches the first selected project without losing typed text';
  await page.keyboard.press('Control+s');await modal().getByRole('button',{name:'Escolher pasta do projeto',exact:true}).click();
  await modal().getByLabel('Destino do arquivo').fill('src/oficina.ts');await modal().getByRole('button',{name:'Criar arquivo',exact:true}).click();await waitClosed();
  assert.equal(await fs.readFile(path.join(workspace,'src/oficina.ts'),'utf8'),text);
  await page.getByRole('tab',{name:'oficina.ts',exact:true,selected:true}).waitFor();assert.equal(await page.getByTestId('untitled-notice').count(),0);checks.push('save-as-exact-text-nested-parent');
  phase='template preview and real TypeScript file creation';
  await create('Arquivo de modelo…');await modal().getByLabel('Modelo de criação').selectOption('typescript');
  await screenshot('file-template');await modal().getByRole('button',{name:'Abrir modelo',exact:true}).click();await waitClosed();
  await page.getByTestId('untitled-notice').waitFor();await page.keyboard.press('Control+s');
  await modal().getByLabel('Destino do arquivo').fill('src/tipos.ts');await modal().getByRole('button',{name:'Criar arquivo',exact:true}).click();await waitClosed();
  assert.equal(await fs.readFile(path.join(workspace,'src/tipos.ts'),'utf8'),fileTemplate('typescript').content);checks.push('original-file-template');
  phase='file properties and copy collision guard';
  await docAction('Organizar / propriedades…');await modal().getByText('SHA-256',{exact:true}).waitFor();await screenshot('properties');
  await modal().getByRole('button',{name:'Duplicar',exact:true}).click();await modal().getByLabel('Destino do arquivo').fill('src/tipos.ts');
  await modal().getByRole('button',{name:'Duplicar',exact:true}).click();await modal().getByRole('alert').filter({hasText:'existe'}).waitFor();
  assert.equal(await fs.readFile(path.join(workspace,'src/tipos.ts'),'utf8'),fileTemplate('typescript').content);
  await modal().getByLabel('Destino do arquivo').fill('src/tipos-copia.ts');await modal().getByRole('button',{name:'Duplicar',exact:true}).click();await waitClosed();
  assert.equal(await fs.readFile(path.join(workspace,'src/tipos-copia.ts'),'utf8'),fileTemplate('typescript').content);checks.push('properties-copy-no-overwrite');
  phase='nested folder operation';
  await create('Pastas aninhadas…');await modal().getByLabel('Destino do arquivo').fill('lib/compartilhado');
  await modal().getByRole('button',{name:'Criar pastas',exact:true}).click();await waitClosed();assert.equal((await fs.stat(path.join(workspace,'lib/compartilhado'))).isDirectory(),true);checks.push('nested-folder');
  phase='rename is cancelled first and then explicitly approved';
  await docAction('Organizar / propriedades…');await modal().getByRole('button',{name:'Renomear',exact:true}).click();
  await modal().getByLabel('Destino do arquivo').fill('src/modelo.ts');
  await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:0});});
  await modal().getByRole('button',{name:'Confirmar caminho',exact:true}).click();
  await modal().getByRole('button',{name:'Confirmar caminho',exact:true}).waitFor();
  assert.equal(await fs.readFile(path.join(workspace,'src/tipos-copia.ts'),'utf8'),fileTemplate('typescript').content);
  await assert.rejects(fs.stat(path.join(workspace,'src/modelo.ts')),{code:'ENOENT'});
  await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});});
  await modal().getByRole('button',{name:'Confirmar caminho',exact:true}).click();await waitClosed();
  await assert.rejects(fs.stat(path.join(workspace,'src/tipos-copia.ts')),{code:'ENOENT'});assert.equal(await fs.readFile(path.join(workspace,'src/modelo.ts'),'utf8'),fileTemplate('typescript').content);
  phase='relocate saved file within project';
  await docAction('Organizar / propriedades…');await modal().getByRole('button',{name:'Mover',exact:true}).click();await modal().getByLabel('Destino do arquivo').fill('lib/compartilhado/modelo.ts');
  await modal().getByRole('button',{name:'Confirmar caminho',exact:true}).click();await waitClosed();
  assert.equal(await fs.readFile(path.join(workspace,'lib/compartilhado/modelo.ts'),'utf8'),fileTemplate('typescript').content);await assert.rejects(fs.stat(path.join(workspace,'src/modelo.ts')),{code:'ENOENT'});checks.push('native-consent-rename-relocate');
  phase='saved-tab management and reopening';
  await docAction('Fechar outras abas salvas');assert.equal(await page.getByTestId('code-document-tab').count(),1);
  await docAction('Reabrir aba fechada');await page.waitForFunction(()=>document.querySelectorAll('[data-testid="code-document-tab"]').length===2);
  await docAction('Fechar abas salvas');await page.getByRole('button',{name:'Criar documento vazio',exact:true}).waitFor();checks.push('reopen-and-close-only-saved-tabs');
  phase='new project wizard generates independent CLI with tests';
  await nativePicker(parent);await create('Novo projeto… Ctrl ⇧ N');await modal().getByLabel('Nome do projeto novo').fill('Oficina-CLI');await modal().getByLabel('Modelo de criação').selectOption('node-cli');
  await screenshot('project-wizard');await modal().getByRole('button',{name:'Criar projeto',exact:true}).click();await waitClosed();
  const cli=path.join(parent,'Oficina-CLI');
  for(const [relative,content]of Object.entries(projectTemplate('node-cli').files))assert.equal(await fs.readFile(path.join(cli,relative),'utf8'),content);
  await assert.rejects(fs.stat(path.join(cli,'node_modules')),{code:'ENOENT'});checks.push('independent-project-scaffold');
  phase='run real tests of the generated project through existing supervised task UI';
  await nav('Central de Tarefas');await page.getByTestId('project-task-center').waitFor();
  await page.getByRole('button',{name:'Selecionar tarefa test',exact:true}).click();await page.getByTestId('project-task-run').click();
  await waitForPageState(page,async()=>{const s=await window.omni.projectTaskState();return s?.name==='test'&&['completed','failed','cancelled','timeout'].includes(s.status);},null,{timeout:30000,description:'testes reais do projeto recém-criado'});
  const task=await page.evaluate(()=>window.omni.projectTaskState());assert.equal(task.exitCode,0,task.output);assert.equal(task.status,'completed');assert.match(task.output,/(?:# pass 2|pass 2|tests 2)/);await screenshot('generated-tests');checks.push('generated-node-tests-via-native-runner');
  phase='CSV automation performs actual parsing, typing and aggregate write';
  await nav('Modelos de fluxo');await page.locator('article').filter({hasText:'CSV: consolidar categorias'}).getByRole('button',{name:'Usar modelo',exact:true}).click();
  await page.locator('.react-flow__node').first().waitFor();await page.getByTestId('flow-fit').click();
  await page.getByRole('button',{name:'▶ Executar',exact:true}).click();
  await waitForState(async()=>{try{const v=JSON.parse(await fs.readFile(path.join(cli,'.omniforge/output/csv-consolidado.json'),'utf8'));return v[0]?.sum===140.5&&v[1]?.sum===80;}catch(e){if(e.code==='ENOENT')return false;throw e;}},{timeout:20000,description:'artefato CSV consolidado real'});
  await page.getByText('Execução real concluída.',{exact:false}).waitFor();await screenshot('csv-result');checks.push('csv-real-worker-result');
  phase='join, statistics and NDJSON templates execute through the UI';
  for(const item of [
    {title:'Conciliar duas tabelas',file:'conciliacao.json',check:v=>v.length===2&&v[0].right.descricao==='Parafuso M8'&&v[1].right===null},
    {title:'Estatística de medidas',file:'estatistica-medidas.json',check:v=>v.count===5&&Math.abs(v.mean-10.2)<1e-10},
    {title:'Inspecionar registros NDJSON',file:'inspecao-ndjson.json',check:v=>v.matching.length===1&&v.other.length===1&&v.matching[0].valor===12.5}
  ]){
    await nav('Modelos de fluxo');await page.locator('article').filter({hasText:item.title}).getByRole('button',{name:'Usar modelo',exact:true}).click();
    await page.getByRole('button',{name:'▶ Executar',exact:true}).click();
    await waitForState(async()=>{try{return item.check(JSON.parse(await fs.readFile(path.join(cli,'.omniforge/output',item.file),'utf8')));}catch(e){if(e.code==='ENOENT')return false;throw e;}},{timeout:20000,description:item.title});
    await page.getByText('Execução real concluída.',{exact:false}).waitFor();
  }
  await screenshot('ndjson-result');checks.push('join-statistics-ndjson-real-worker-results');
  phase='compact dialog and forged native request';
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1280,800));await create('Arquivo de modelo…');await modal().getByLabel('Modelo de criação').selectOption('python');await screenshot('compact-template');
  const box=await modal().boundingBox(),size=await page.evaluate(()=>({w:innerWidth,h:innerHeight}));assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=size.w+1&&box.y+box.height<=size.h+1);
  await modal().getByRole('button',{name:'Cancelar',exact:true}).click();
  await assert.rejects(page.evaluate(()=>window.omni.createAuthoredFile('C:/forged','no.txt','bad',false)),/Projeto alterado/);checks.push('compact-layout-native-root-pin');
  assert.equal(await fs.readFile(path.join(workspace,'src/oficina.ts'),'utf8'),text);assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(artifacts,'project-suite-v090-results.json'),JSON.stringify({schemaVersion:1,version:'0.9.0',result:'PASS',screenshots:shots,checks,
    fixtures:'Projetos locais temporários. Nenhum dado pessoal.',limitations:'Documentos sem título residem em memória até Salvar como; nenhum terminal interativo, Python LSP ou CAD 3D foi simulado.'},null,2)+'\n');
  console.log('PASS v0.9.0 Project/Data suite: '+checks.length+' end-to-end checks; '+shots+' real screenshots.');phase='pass';
}catch(error){console.error('[PROJECT SUITE] phase='+phase,error);process.exitCode=1;if(page&&!page.isClosed())await page.screenshot({path:path.join(artifacts,'project-suite-failure-v090.png')}).catch(()=>{});}
finally{if(app){try{const child=app.process();if(child&&child.exitCode===null)child.kill();await Promise.race([app.close().catch(()=>{}),new Promise(r=>setTimeout(r,2500))]);}catch{}}
  await fs.rm(lab,{recursive:true,force:true}).catch(()=>{});clearTimeout(watchdog);process.exit(process.exitCode||0);}
