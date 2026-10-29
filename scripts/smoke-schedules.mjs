/** Real Windows Electron E2E — schedule registry, native approval and actual worker output. */
import { _electron as electron } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const lab=await fs.mkdtemp(path.join(os.tmpdir(),'omniforge-schedule-e2e-'));
const workspace=path.join(lab,'workspace');
const profile=path.join(lab,'profile');
await Promise.all([fs.mkdir(workspace),fs.mkdir(profile)]);
const hash=source=>createHash('sha256').update(source).digest('hex');
let client,page,phase='boot';
const watchdog=setTimeout(()=>{console.error('[SCHEDULE E2E] timeout, phase='+phase);process.exit(1);},160_000);
watchdog.unref();
async function openDesktop() {
  client=await electron.launch({
    args:['.'],cwd:projectRoot,timeout:45000,
    env:{...process.env,OMNIFORGE_E2E:'1',OMNIFORGE_E2E_USER_DATA:profile,ELECTRON_RENDERER_URL:''}
  });
  page=await client.firstWindow({timeout:45000});
  page.setDefaultTimeout(20000);
  page.on('pageerror',error=>console.error('[renderer]',error.message));
  const actual=await client.evaluate(({app})=>app.getPath('userData'));
  assert.equal(path.normalize(actual).toLowerCase(),path.normalize(profile).toLowerCase());
  await client.evaluate(({dialog},folder)=>{
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});
    dialog.showMessageBox=async()=>({response:1});
  },workspace);
  await page.getByText('OMNIFORGE',{exact:false}).first().waitFor();
  await page.getByRole('button',{name:'Abrir projeto'}).click();
  await page.getByText('Projeto aberto:',{exact:false}).waitFor();
}
try {
  await openDesktop();
  phase='save flow and schedule';
  await page.getByRole('button',{name:'Salvar fluxo'}).click();
  await page.getByText('Fluxo gravado em',{exact:false}).waitFor();
  const originalFlow=path.join(workspace,'.omniforge','flows','principal.json');
  const saved=await fs.readFile(originalFlow,'utf8');
  const revision=hash(saved);
  await page.getByRole('button',{name:'Central de agendamentos'}).click();
  await page.getByTestId('schedule-center').waitFor();
  await page.getByLabel('Nome do agendamento').fill('Inspeção CI local');
  await page.getByLabel('Frequência do agendamento').selectOption('1');
  await page.getByRole('button',{name:'Criar agendamento'}).click();
  await page.getByText('Agendamento criado e PAUSADO.',{exact:false}).waitFor();
  const created=(await page.evaluate(()=>window.omni.listSchedules()))[0];
  assert.equal(created.flowRevision,revision);
  assert.equal(created.intervalMinutes,1);
  assert.equal(created.enabled,false);
  assert.equal(created.nextRunAt,null);
  await assert.rejects(fs.stat(path.join(workspace,'.omniforge/output/venda.json')),
    {code:'ENOENT'});
  phase='activate then run real';
  await page.getByRole('button',{name:'Ativar',exact:true}).click();
  await page.waitForFunction(async()=>{
    const jobs=await window.omni.listSchedules();
    return jobs[0]?.enabled===true;
  });
  await page.getByRole('button',{name:'Executar agora'}).click();
  await page.waitForFunction(async()=>{
    const jobs=await window.omni.listSchedules();
    return jobs[0]?.lastOutcome==='PASS' && jobs[0]?.runs===1;
  },{timeout:30000});
  const projects=await page.evaluate(()=>window.omni.listProjects());
  const schedules=await page.evaluate(()=>window.omni.listSchedules());
  const historyInfo=await page.evaluate(async()=>{
    const rows=await window.omni.listRunHistory();
    return Promise.all(rows.map(async item=>window.omni.readRunHistory(item.id)));
  });
  console.log('[SCHEDULE TRACE] project paths=',JSON.stringify(projects.map(x=>({id:x.id,path:x.path}))));
  console.log('[SCHEDULE TRACE] persisted state=',JSON.stringify(schedules.map(x=>({
    id:x.id,projectId:x.projectId,runs:x.runs,outcome:x.lastOutcome,lastHistoryId:x.lastHistoryId
  }))));
  console.log('[SCHEDULE TRACE] history artifacts=',JSON.stringify(historyInfo.map(x=>({
    ok:x.ok,stage:x.stage,artifacts:x.artifacts,steps:x.steps?.map(s=>({id:s.nodeId,status:s.status,type:s.type}))
  }))));
  const outputPath=path.join(workspace,'.omniforge/output/venda.json');
  console.log('[SCHEDULE TRACE] expected=',outputPath,
    'exists=',await fs.stat(outputPath).then(()=>true,()=>false),
    'workspace contents=',JSON.stringify(await fs.readdir(path.join(workspace,'.omniforge','output'))
      .catch(error=>({error:error.code}))));
  const output=JSON.parse(await fs.readFile(outputPath,'utf8'));
  assert.equal(output.id,1001);
  assert.equal((await page.evaluate(()=>window.omni.listRunHistory())).length,1);
  phase='pause and restart';
  await page.getByRole('button',{name:'Pausar',exact:true}).click();
  await page.waitForFunction(async()=>{
    const jobs=await window.omni.listSchedules();
    return jobs[0]?.enabled===false;
  });
  await client.close();client=null;
  await openDesktop();
  await page.getByRole('button',{name:'Central de agendamentos'}).click();
  await page.getByTestId('schedule-center').waitFor();
  const persisted=(await page.evaluate(()=>window.omni.listSchedules()))[0];
  assert.equal(persisted.id,created.id);
  assert.equal(persisted.enabled,false);
  assert.equal(persisted.runs,1);
  phase='revision protection';
  const flow=JSON.parse(await fs.readFile(originalFlow,'utf8'));
  flow.name='Fluxo revisado externamente';
  await fs.writeFile(originalFlow,JSON.stringify(flow,null,2)+'\n');
  await page.getByRole('button',{name:'Ativar',exact:true}).click();
  await page.getByText('O fluxo salvo foi alterado.',{exact:false}).waitFor();
  assert.equal((await page.evaluate(()=>window.omni.listSchedules()))[0].enabled,false);
  await page.getByRole('button',{name:'Aprovar revisão'}).click();
  await page.getByText('Nova revisão aprovada.',{exact:false}).waitFor();
  const afterApproval=(await page.evaluate(()=>window.omni.listSchedules()))[0];
  assert.notEqual(afterApproval.flowRevision,revision);
  assert.equal(afterApproval.enabled,false);
  phase='delete only schedule';
  await page.getByRole('button',{name:'Excluir agendamento Inspeção CI local'}).click();
  await page.getByText('Agendamento excluído.',{exact:false}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.omni.listSchedules()),[]);
  assert.equal(JSON.parse(await fs.readFile(originalFlow,'utf8')).name,'Fluxo revisado externamente');
  assert.equal(JSON.parse(await fs.readFile(
    path.join(workspace,'.omniforge/output/venda.json'),'utf8')).id,1001);
  console.log('SCHEDULE_E2E_PASS: native scheduling, real worker, history, pause, restart, revision pin and nondestructive removal.');
} catch(error) {
  console.error('[SCHEDULE E2E] failed at phase='+phase,error);
  process.exitCode=1;
} finally {
  if(client) {
    try {
      const child=client.process();
      if(child && child.exitCode===null)child.kill();
      await Promise.race([client.close().catch(()=>{}),
        new Promise(resolve=>setTimeout(resolve,2500))]);
    } catch {}
  }
  await fs.rm(lab,{recursive:true,force:true}).catch(()=>{});
  clearTimeout(watchdog);
  if(process.exitCode)process.exit(process.exitCode);
}
