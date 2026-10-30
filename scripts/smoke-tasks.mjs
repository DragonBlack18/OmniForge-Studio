/** Real Windows Electron E2E for supervised project scripts. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'omni-task-e2e-'));
const workspace = path.join(sandbox,'workspace');
const profile = path.join(sandbox,'profile');
await Promise.all([fs.mkdir(workspace),fs.mkdir(profile)]);
await fs.writeFile(path.join(workspace,'package.json'),JSON.stringify({
  name:'real-task-project',version:'1.0.0',
  scripts:{
    verify:'node verify.cjs',
    hold:'node hold.cjs',
    preverify:'node hook.cjs'
  }
},null,2));
await fs.writeFile(path.join(workspace,'verify.cjs'),[
  "const fs=require('node:fs');",
  "fs.writeFileSync('task-result.txt','REAL_SUCCESS');",
  "fs.writeFileSync('env-result.txt',process.env.OMNIFORGE_TEST_SECRET?'LEAK':'SAFE');",
  "console.log('TASK_REAL_PASS');"
].join('\n'));
await fs.writeFile(path.join(workspace,'hold.cjs'),
  "console.log('TASK_HOLD_READY'); setInterval(()=>{},250);");
await fs.writeFile(path.join(workspace,'hook.cjs'),
  "require('node:fs').writeFileSync('unsafe-hook.txt','HOOK_EXECUTED');");

let client, stage='boot';
const watchdog=setTimeout(()=>{
  console.error('[TASK E2E] global watchdog stage='+stage);
  process.exit(1);
},150000);
watchdog.unref();
try {
  client=await electron.launch({
    args:['.'],cwd:root,timeout:45000,
    env:{...process.env,ELECTRON_RENDERER_URL:'',OMNIFORGE_E2E:'1',
      OMNIFORGE_E2E_USER_DATA:profile,OMNIFORGE_TEST_SECRET:'NEVER_EXPOSE'}
  });
  const page=await client.firstWindow({timeout:45000});
  page.setDefaultTimeout(18000);
  page.on('pageerror',e=>console.error('[TASK renderer]',e.message));
  // Wait at the test-process boundary. Playwright waitForFunction can treat
  // an async browser predicate as truthy before its Promise resolves, which
  // previously yielded a stale "running" snapshot and a false FAIL.
  const waitForTask = async (name, predicate, timeoutMs = 30000) => {
    const deadline = Date.now() + timeoutMs;
    let last = null;
    while (Date.now() < deadline) {
      last = await page.evaluate(() => window.omni.projectTaskState());
      if (last?.name === name && predicate(last)) return last;
      await new Promise(resolve => setTimeout(resolve, 160));
    }
    throw new Error('Estado da tarefa não atingido: ' +
      JSON.stringify({ name, last }));
  };
  const waitForHistory = async (minimum, timeoutMs = 15000) => {
    const deadline = Date.now() + timeoutMs;
    let last = [];
    while (Date.now() < deadline) {
      last = await page.evaluate(() => window.omni.listProjectTaskHistory());
      if (last.length >= minimum) return last;
      await new Promise(resolve => setTimeout(resolve, 140));
    }
    throw new Error('Histórico de tarefas não registrado: '+JSON.stringify(last));
  };
  const actualProfile=await client.evaluate(({app})=>app.getPath('userData'));
  assert.equal(path.normalize(actualProfile).toLowerCase(),path.normalize(profile).toLowerCase());
  await client.evaluate(({dialog},dir)=>{
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[dir]});
    dialog.showMessageBox=async()=>({response:0});
  },workspace);

  stage='open workspace and browse real package scripts';
  await page.getByRole('button',{name:'Abrir projeto'}).click();
  await page.getByText('Projeto aberto:',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Central de Tarefas'}).click();
  await page.getByTestId('project-task-center').waitFor();
  await page.getByRole('button',{name:'Selecionar tarefa verify'}).waitFor();
  const catalog=await page.evaluate(()=>window.omni.listProjectTasks());
  assert.equal(catalog.available,true);
  assert.ok(catalog.toolchain.available,'Toolchain Node/npm deve estar instalado.');
  assert.ok(catalog.scripts.some(x=>x.id==='verify'));
  assert.ok(catalog.scripts.some(x=>x.id==='hold'));

  stage='native consent rejection must not launch anything';
  await page.getByRole('button',{name:'Selecionar tarefa verify'}).click();
  await page.getByTestId('project-task-run').click();
  await page.getByText('Execução cancelada. Nenhum processo foi iniciado.',{exact:false}).waitFor();
  assert.equal(await page.evaluate(() => window.omni.projectTaskState()),null);
  await assert.rejects(fs.stat(path.join(workspace,'task-result.txt')),{code:'ENOENT'});

  stage='native approval and real stdout/artifacts';
  await client.evaluate(({dialog})=>{
    dialog.showMessageBox=async(_window,opts)=>{
      if(opts?.title!=='Executar tarefa do projeto' ||
         !String(opts.detail).includes('node verify.cjs')) {
        throw Error('Confirmação nativa deve exibir script real.');
      }
      return {response:1};
    };
  });
  await page.getByTestId('project-task-run').click();
  const final=await waitForTask('verify',task=>task.status==='completed');
  console.log('[TASK E2E] completed snapshot: '+JSON.stringify({
    name:final.name,status:final.status,exitCode:final.exitCode,
    finishedAt:final.finishedAt,message:final.message,
    outputLength:final.output?.length,hasOutput:final.output?.includes('TASK_REAL_PASS')
  }));
  assert.equal(final.exitCode,0);
  assert.match(final.output,/TASK_REAL_PASS/);
  assert.equal(await fs.readFile(path.join(workspace,'task-result.txt'),'utf8'),'REAL_SUCCESS');
  assert.equal(await fs.readFile(path.join(workspace,'env-result.txt'),'utf8'),'SAFE');
  await assert.rejects(fs.stat(path.join(workspace,'unsafe-hook.txt')),{code:'ENOENT'});
  assert.match(await page.getByTestId('project-task-output').textContent(),/TASK_REAL_PASS/);
  stage='persist successful task metadata, without recording stdout or secrets';
  const firstHistory=await waitForHistory(1);
  assert.equal(firstHistory[0].name,'verify');
  assert.equal(firstHistory[0].status,'completed');
  assert.equal(firstHistory[0].exitCode,0);
  assert.equal(typeof firstHistory[0].durationMs,'number');
  assert.equal('output' in firstHistory[0],false);
  await page.getByTestId('project-task-history').getByText('npm run verify').waitFor();

  stage='cancel running script and release execution slot';
  await page.getByRole('button',{name:'Selecionar tarefa hold'}).click();
  await client.evaluate(({dialog})=>{
    dialog.showMessageBox=async(_window,opts)=>{
      if(opts?.title!=='Executar tarefa do projeto' ||
          !String(opts.detail).includes('node hold.cjs'))
        throw Error('Script hold não exibido na confirmação.');
      return {response:1};
    };
  });
  await page.getByTestId('project-task-run').click();
  await waitForTask('hold',task=>task.status==='running' &&
    task.output.includes('TASK_HOLD_READY'));
  assert.equal(await page.evaluate(async()=>{
    const current=await window.omni.projectTaskState();
    return window.omni.cancelProjectTask(current.id);
  }),true);
  const stopped=await waitForTask('hold',task=>task.status==='cancelled');
  assert.equal(stopped.status,'cancelled');
  assert.ok(stopped.finishedAt);

  stage='cancelled task history and actual on-disk metadata survive renderer reload';
  const fullHistory=await waitForHistory(2);
  assert.equal(fullHistory[0].name,'hold');
  assert.equal(fullHistory[0].status,'cancelled');
  assert.equal(fullHistory[1].name,'verify');
  const directory=path.join(profile,'project-task-history');
  const files=await fs.readdir(directory);
  assert.equal(files.length,1);
  const body=await fs.readFile(path.join(directory,files[0]),'utf8');
  assert.ok(!body.includes('TASK_REAL_PASS'));
  assert.ok(!body.includes('TASK_HOLD_READY'));
  assert.ok(!body.includes('node verify.cjs'));
  assert.ok(!body.includes('NEVER_EXPOSE'));
  await page.reload();
  await page.getByRole('button',{name:'Central de Tarefas'}).click();
  await page.getByTestId('project-task-history').getByText('npm run hold').waitFor();

  stage='no workspace corruption after cancellation';
  const contents=JSON.parse(await fs.readFile(path.join(workspace,'package.json'),'utf8'));
  assert.equal(contents.scripts.verify,'node verify.cjs');
  assert.equal((await fs.readFile(path.join(workspace,'task-result.txt'),'utf8')),'REAL_SUCCESS');
  console.log('PASS Project Tasks Electron E2E: native deny/allow, real npm, stdout, secret filtering, cancellation and persistent metadata after renderer reload.');
} catch(error) {
  console.error('[TASK E2E] stage='+stage,error);
  process.exitCode=1;
} finally {
  if(client){
    try{
      const child=client.process();
      if(child && child.exitCode===null) child.kill();
      await Promise.race([client.close().catch(()=>{}),
        new Promise(resolve=>setTimeout(resolve,3000))]);
    }catch{}
  }
  await fs.rm(sandbox,{recursive:true,force:true}).catch(()=>{});
  clearTimeout(watchdog);
  process.exit(process.exitCode||0);
}
