/** Real Electron E2E: unsaved Monaco content survives renderer reload without source overwrite. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lab = await fs.mkdtemp(path.join(os.tmpdir(), 'omni-recovery-e2e-'));
const workspace = path.join(lab, 'workspace');
const profile = path.join(lab, 'profile');
await Promise.all([fs.mkdir(workspace), fs.mkdir(profile)]);
await fs.mkdir(path.join(workspace, 'src'));
const file = path.join(workspace, 'src', 'source.js');
const original = 'export const original = true;\n';
await fs.writeFile(file, original);
let client, page, phase = 'boot';
const watchdog = setTimeout(() => {
  console.error('[RECOVERY E2E] watchdog phase='+phase);
  process.exit(1);
}, 150000);
watchdog.unref();
async function openEditor() {
  await page.getByRole('button', {name:'Abrir projeto'}).click();
  await page.getByText('Projeto aberto:', {exact:false}).waitFor();
  await page.getByRole('button', {name:'Editor de código'}).click();
  await page.getByRole('button', {name:'ARQUIVOS',exact:true}).click();
  await page.getByRole('treeitem', {name:'source.js'}).click();
  await page.locator('.monaco-editor').first().waitFor();
}
async function readDraft() {
  // Windows can express the same temp path with different casing or an alias.
  // The IPC intentionally accepts ONLY the canonical active project returned
  // by Electron; obtain that project rather than passing the Node fixture path.
  return page.evaluate(async () => {
    const projects = await window.omni.listProjects();
    if (projects.length !== 1) throw Error('Workspace E2E não está isolado.');
    return window.omni.readEditorDraft(projects[0].path, 'src/source.js');
  });
}
try {
  client = await electron.launch({
    args:['.'],cwd:root,timeout:45000,
    env:{...process.env,OMNIFORGE_E2E:'1',OMNIFORGE_E2E_USER_DATA:profile,
      ELECTRON_RENDERER_URL:''}
  });
  page = await client.firstWindow({timeout:45000});
  page.setDefaultTimeout(20000);
  page.on('pageerror', err => console.error('[RECOVERY renderer]',err.name));
  const actualProfile = await client.evaluate(({app}) => app.getPath('userData'));
  assert.equal(path.normalize(actualProfile).toLowerCase(),path.normalize(profile).toLowerCase());
  await client.evaluate(({dialog},folder) => {
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});
    dialog.showMessageBox=async()=>({response:0});
  },workspace);

  phase='open real project and modify Monaco unsaved buffer';
  await openEditor();
  await page.locator('.monaco-editor').first().click();
  await page.keyboard.insertText('\n// UNSAVED_RECOVERY_CANARY_A');
  await page.getByTestId('editor-draft-saved').waitFor();
  const first = await readDraft();
  assert.match(first.content,/UNSAVED_RECOVERY_CANARY_A/);
  assert.match(first.draftRevision,/^[a-f0-9]{64}$/);
  assert.equal(await fs.readFile(file,'utf8'),original);

  phase='simulate lost renderer state and reopen editor';
  await page.reload();
  await openEditor();
  await page.getByTestId('editor-recovery').waitFor();
  await page.getByText('Rascunho de recuperação disponível').waitFor();
  assert.equal(await fs.readFile(file,'utf8'),original);

  phase='restore only to Monaco and explicitly save original';
  await page.getByRole('button',{name:'Restaurar no editor'}).click();
  await page.getByRole('button',{name:'Salvar arquivo'}).click();
  await page.getByText('Arquivo atualizado: src/source.js',{exact:false}).waitFor();
  const saved = await fs.readFile(file,'utf8');
  assert.match(saved,/UNSAVED_RECOVERY_CANARY_A/);
  assert.equal(await readDraft(),null,'Rascunho deve sumir após salvar no disco');

  phase='new draft with externally edited source must fail closed';
  await page.locator('.monaco-editor').first().click();
  await page.keyboard.insertText('\n// UNSAVED_RECOVERY_CANARY_B');
  await page.getByTestId('editor-draft-saved').waitFor();
  const second = await readDraft();
  assert.match(second.content,/UNSAVED_RECOVERY_CANARY_B/);
  await fs.writeFile(file,'// EXTERNAL_CHANGE_DO_NOT_OVERWRITE\n');
  await page.reload();
  await openEditor();
  await page.getByTestId('editor-recovery').waitFor();
  await page.getByText('Conflito: arquivo alterado externamente').waitFor();
  assert.equal(await page.getByRole('button',{name:'Restaurar no editor'}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Salvar arquivo'}).isDisabled(),true);
  assert.equal(await fs.readFile(file,'utf8'),'// EXTERNAL_CHANGE_DO_NOT_OVERWRITE\n');

  phase='explicit discard only touches local recovery copy';
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button',{name:'Descartar rascunho'}).click();
  await page.getByText('Cópia de recuperação descartada',{exact:false}).waitFor();
  assert.equal(await readDraft(),null);
  assert.equal(await fs.readFile(file,'utf8'),'// EXTERNAL_CHANGE_DO_NOT_OVERWRITE\n');
  assert.deepEqual((await fs.readdir(workspace)).sort(),['src']);
  console.log('PASS Recovery Electron E2E: real Monaco draft, renderer reload, explicit save, conflict guard and non-destructive discard.');
  phase='pass';
} catch(error) {
  console.error('[RECOVERY E2E] phase='+phase,error);
  process.exitCode=1;
} finally {
  if (client) {
    try {
      const child=client.process();
      if(child && child.exitCode===null)child.kill();
      await Promise.race([client.close().catch(()=>{}),
        new Promise(resolve=>setTimeout(resolve,3000))]);
    } catch {}
  }
  await fs.rm(lab,{recursive:true,force:true}).catch(()=>{});
  clearTimeout(watchdog);
  process.exit(process.exitCode||0);
}
