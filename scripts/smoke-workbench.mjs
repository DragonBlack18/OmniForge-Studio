/** v0.7.5 desktop workbench E2E: real navigation, quick-open and no project mutations. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const lab=await fs.mkdtemp(path.join(os.tmpdir(),'omni-workbench-e2e-'));
const workspace=path.join(lab,'workspace'),profile=path.join(lab,'profile');
await Promise.all([fs.mkdir(workspace),fs.mkdir(profile)]);
const source='export const WORKBENCH_REAL_FILE = 75;\n';
await fs.writeFile(path.join(workspace,'main.js'),source);
let app,page,phase='startup';
const watchdog=setTimeout(()=>{console.error('[WORKBENCH E2E] watchdog='+phase);process.exit(1);},160000);
watchdog.unref();
try {
  app=await electron.launch({args:['.'],cwd:root,timeout:45000,
    env:{...process.env,OMNIFORGE_E2E:'1',OMNIFORGE_E2E_USER_DATA:profile,ELECTRON_RENDERER_URL:''}});
  page=await app.firstWindow({timeout:45000});
  page.setDefaultTimeout(20000);
  page.on('pageerror',error=>console.error('[WORKBENCH renderer]',error.message));
  const isolated=await app.evaluate(({app})=>app.getPath('userData'));
  assert.equal(path.normalize(isolated).toLowerCase(),path.normalize(profile).toLowerCase());
  await app.evaluate(({dialog},folder)=>{
    // Native chooser only: every tool command and filesystem operation is real.
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});
  },workspace);

  phase='desktop start surface and domain navigation';
  await page.getByTestId('workspace-overview').waitFor();
  await page.getByTestId('primary-sidebar').waitFor();
  assert.equal(await page.getByTestId('activity-rail').count(),0);
  assert.equal(await page.locator('.overview-metrics').count(),0,'A Home não é um dashboard.');
  await page.getByRole('button',{name:'Abrir projeto'}).click();
  await page.getByText('Projeto aberto:',{exact:false}).waitFor();
  assert.equal(await page.getByRole('navigation',{name:'Navegação principal'}).count(),1);
  await page.getByRole('button',{name:'Recolher grupo DESENVOLVIMENTO'}).click();
  assert.equal(await page.getByRole('button',{name:'Controle de versão Git'}).count(),0);
  await page.getByRole('button',{name:'Expandir grupo DESENVOLVIMENTO'}).click();
  assert.equal(await page.getByRole('button',{name:'Controle de versão Git'}).count(),1);
  assert.equal(await page.getByRole('button',{name:'CAD Sketch 2D'}).count(),1);

  phase='command palette navigates to CAD without executing external code';
  await page.keyboard.press('Control+Shift+P');
  await page.getByRole('dialog',{name:'Paleta de comandos'}).waitFor();
  await page.getByRole('searchbox',{name:'Pesquisar comandos'}).fill('cad sketch');
  await page.getByRole('option',{name:/CAD Sketch 2D/}).click();
  await page.getByTestId('cad-workbench').waitFor();
  assert.equal(await page.getByRole('dialog',{name:'Paleta de comandos'}).count(),0);
  await assert.rejects(fs.stat(path.join(workspace,'.omniforge','cad','sketch.json')),{code:'ENOENT'});

  phase='quick-file search uses real allowlisted path and existing editor';
  await page.keyboard.press('Control+p');
  await page.getByRole('dialog',{name:'Abrir arquivo rapidamente'}).waitFor();
  await page.getByRole('searchbox',{name:'Pesquisar arquivos'}).fill('main.js');
  await page.getByRole('option',{name:/main.js/}).click();
  await page.locator('.monaco-editor').first().waitFor();
  assert.match(await page.evaluate(()=>window.omni.readFile('main.js')).then(r=>r.content),/WORKBENCH_REAL_FILE/);
  assert.equal(await fs.readFile(path.join(workspace,'main.js'),'utf8'),source);

  phase='sidebar preference survives reload and command palette dismisses safely';
  await page.keyboard.press('Control+b');
  assert.match(await page.getByTestId('primary-sidebar').getAttribute('class'),/collapsed/);
  await page.reload();
  await page.getByTestId('primary-sidebar').waitFor();
  assert.equal(await page.getByTestId('activity-rail').count(),0);
  // Initial Home is its own profile; reopening the project restores its own layout.
  assert.doesNotMatch(await page.getByTestId('primary-sidebar').getAttribute('class'),/collapsed/);
  await page.getByRole('button',{name:'Abrir projeto'}).click();
  await page.getByText('Projeto aberto:',{exact:false}).waitFor();
  assert.match(await page.getByTestId('primary-sidebar').getAttribute('class'),/collapsed/);
  // Repeated immediate dismissals exercise focus on a newly mounted lazy
  // dialog, not just the already-loaded/warm palette from earlier commands.
  for (let attempt=0;attempt<6;attempt++) {
    await page.keyboard.press('F1');
    await page.getByRole('dialog',{name:'Paleta de comandos'}).waitFor();
    assert.equal(await page.getByRole('searchbox',{name:'Pesquisar comandos'})
      .evaluate(element=>element===document.activeElement),true,
      'A paleta deve receber foco antes de ficar visível.');
    await page.keyboard.press('Escape');
    await page.getByTestId('command-palette').waitFor({state:'detached',timeout:3000});
  }
  await page.keyboard.press('Control+b');

  await page.getByTestId('primary-sidebar').getByRole('button',{name:'Visão geral',exact:true}).click();
  phase='capture real workbench layout';
  await fs.mkdir(path.join(root,'smoke-artifacts'),{recursive:true});
  await page.getByTestId('workspace-overview').waitFor();
  await page.screenshot({path:path.join(root,'smoke-artifacts','workbench-v075.png')});
  assert.deepEqual((await fs.readdir(workspace)).sort(),['main.js']);
  console.log('PASS Workbench v0.7.5 E2E: domain hierarchy, quick commands, real IDE, local-only and preference reload.');
  phase='pass';
} catch(error) {
  console.error('[WORKBENCH E2E] phase='+phase,error);
  if(page) {
    await fs.mkdir(path.join(root,'smoke-artifacts'),{recursive:true});
    await page.screenshot({path:path.join(root,'smoke-artifacts','workbench-failure.png')}).catch(()=>{});
  }
  process.exitCode=1;
} finally {
  if(app) {
    try { const child=app.process();if(child&&child.exitCode===null)child.kill();
      await Promise.race([app.close().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,2800))]);
    } catch {}
  }
  await fs.rm(lab,{recursive:true,force:true}).catch(()=>{});
  clearTimeout(watchdog);
  process.exit(process.exitCode||0);
}
