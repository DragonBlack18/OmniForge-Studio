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
  await page.waitForFunction(async()=> (await window.omni.projectTaskState())===null);
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
  await page.waitForFunction(async()=>{
    const current=await window.omni.projectTaskState();
    return current?.name==='verify' && current?.status==='completed';
  },null,{timeout:30000});
  const final=await page.evaluate(()=>window.omni.projectTaskState());
  assert.equal(final.exitCode,0);
  assert.match(final.output,/TASK_REAL_PASS/);
  assert.equal(await fs.readFile(path.join(workspace,'task-result.txt'),'utf8'),'REAL_SUCCESS');
  assert.equal(await fs.readFile(path.join(workspace,'env-result.txt'),'utf8'),'SAFE');
  await assert.rejects(fs.stat(path.join(workspace,'unsafe-hook.txt')),{code:'ENOENT'});
  assert.match(await page.getByTestId('project-task-output').textContent(),/TASK_REAL_PASS/);

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
  await page.waitForFunction(async()=>{
    const current=await window.omni.projectTaskState();
    return current?.name==='hold' && current.output.includes('TASK_HOLD_READY');
  },null,{timeout:30000});
  assert.equal(await page.evaluate(async()=>{
    const current=await window.omni.projectTaskState();
    return window.omni.cancelProjectTask(current.id);
  }),true);
  await page.waitForFunction(async()=>{
    const current=await window.omni.projectTaskState();
    return current?.name==='hold' && current?.status==='cancelled';
  },null,{timeout:30000});
  const stopped=await page.evaluate(()=>window.omni.projectTaskState());
  assert.equal(stopped.status,'cancelled');
  assert.ok(stopped.finishedAt);

  stage='no workspace corruption after cancellation';
  const contents=JSON.parse(await fs.readFile(path.join(workspace,'package.json'),'utf8'));
  assert.equal(contents.scripts.verify,'node verify.cjs');
  assert.equal((await fs.readFile(path.join(workspace,'task-result.txt'),'utf8')),'REAL_SUCCESS');
  console.log('PASS Project Tasks Electron E2E: native deny/allow, real npm script, stdout, env filtering, lifecycle skip and process-tree cancellation.');
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
