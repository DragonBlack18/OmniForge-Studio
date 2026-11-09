/** Real Electron renderer: catalogue, fixed native URLs and keyboard confirmation. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {_electron as electron} from 'playwright-core';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const lab=await fs.mkdtemp(path.join(os.tmpdir(),'omni-capabilities-'));
const profile=path.join(lab,'profile');await fs.mkdir(profile);
const artifacts=path.join(root,'smoke-artifacts');await fs.mkdir(artifacts,{recursive:true});
let app,page,stage='boot';const errors=[],checks=[];
const watchdog=setTimeout(()=>{console.error('[CAPABILITIES] timeout '+stage);process.exit(1);},120000);watchdog.unref();
try{
  app=await electron.launch({args:['.'],cwd:root,timeout:45000,env:{...process.env,ELECTRON_RENDERER_URL:'',OMNIFORGE_E2E:'1',OMNIFORGE_E2E_USER_DATA:profile}});
  page=await app.firstWindow({timeout:45000});page.setDefaultTimeout(15000);
  page.on('pageerror',error=>errors.push(error.message));
  await app.evaluate(({BrowserWindow,shell})=>{BrowserWindow.getAllWindows()[0].setSize(1440,900);globalThis.referenceOpens=[];shell.openExternal=async url=>{globalThis.referenceOpens.push(url);};});
  await page.getByTestId('workspace-overview').waitFor();
  const sidebar=page.getByTestId('primary-sidebar');
  stage='150 references and honest availability';
  await sidebar.getByRole('button',{name:'Ferramentas e referências',exact:true}).click();
  const center=page.getByTestId('capability-center');await center.waitFor();
  assert.equal(await center.locator('tbody tr').count(),150);
  await center.getByLabel('Estado',{exact:true}).selectOption('integrated');assert.equal(await center.locator('tbody tr').count(),8);
  await center.getByLabel('Buscar referência').fill('organizacao worker');assert.equal(await center.locator('tbody tr').count(),1);
  await center.getByRole('heading',{name:'ELK.js',exact:true}).waitFor();
  await center.getByRole('button',{name:'Abrir fonte no navegador',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.capability-detail button[aria-busy]')?.getAttribute('aria-busy')==='false');
  assert.deepEqual(await app.evaluate(()=>globalThis.referenceOpens),['https://github.com/kieler/elkjs']);
  await assert.rejects(page.evaluate(()=>window.omni.openReference('https://example.invalid/')),/Referência inválida/);
  await assert.rejects(page.evaluate(()=>window.omni.openReference(151)),/Referência não encontrada/);
  checks.push('150-references-8-actual-integrations-fixed-native-url');
  await center.getByLabel('Buscar referência').fill('no-such-tool');await center.getByRole('heading',{name:'Nenhuma referência encontrada'}).waitFor();
  await center.getByRole('button',{name:'Limpar filtros',exact:true}).click();assert.equal(await center.locator('tbody tr').count(),150);
  await center.locator('summary').click();
  assert.equal(await center.getByRole('button',{name:'Planejado · indisponível'}).count(),6);
  for(const button of await center.getByRole('button',{name:'Planejado · indisponível'}).all())assert.equal(await button.isDisabled(),true);
  checks.push('empty-filter-clear-disabled-preparation');
  await center.locator('summary').click();
  for(const width of [1440,1280,1040]){
    await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setContentSize(width,900),width);
    await page.waitForFunction(width=>window.innerWidth===width,width);
    assert.equal(await center.evaluate(element=>element.scrollWidth<=element.clientWidth+1),true,'No horizontal overflow at '+width);
    await page.screenshot({path:path.join(artifacts,'capabilities-'+width+'-v0100.png')});
  }
  checks.push('desktop-layout-1440-1280-1040');
  stage='keyboard cancellation and explicit template load';
  await sidebar.getByRole('button',{name:'Modelos de fluxo',exact:true}).click();
  const trigger=page.getByRole('button',{name:'Usar modelo',exact:true}).first();await trigger.click();
  const modal=page.getByTestId('workbench-confirm-dialog');await modal.waitFor();
  assert.equal(await modal.getByRole('button',{name:'Cancelar',exact:true}).evaluate(element=>element===document.activeElement),true);
  await page.keyboard.press('Shift+Tab');assert.equal(await modal.evaluate(element=>element.contains(document.activeElement)),true);
  await page.keyboard.press('Escape');await modal.waitFor({state:'hidden'});
  assert.equal(await trigger.evaluate(element=>element===document.activeElement),true);
  await trigger.click();await modal.waitFor();await page.keyboard.press('Tab');await page.keyboard.press('Enter');
  await modal.waitFor({state:'hidden'});await page.getByText('Modelo carregado:',{exact:false}).waitFor();
  checks.push('focus-contained-escape-cancel-focus-restored-explicit-accept');
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(artifacts,'capabilities-v0100-results.json'),JSON.stringify({ok:true,checks,rendererErrors:errors},null,2));
  console.log('PASS capabilities:',checks.join(', '));
}catch(error){console.error('[CAPABILITIES] stage='+stage,error);process.exitCode=1;await page?.screenshot({path:path.join(artifacts,'capabilities-failure-v0100.png')}).catch(()=>{});}
finally{clearTimeout(watchdog);if(app){await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});}).catch(()=>{});await app.close().catch(()=>{});}await fs.rm(lab,{recursive:true,force:true}).catch(()=>{});}
