import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { exampleFlow } from '../core/catalog.mjs';
import { saveFlow } from '../core/workspace.mjs';
import { registerProject } from '../core/projects.mjs';
import {
  assertScheduleSpec,createSchedule,listSchedules,getSchedule,setScheduleEnabled,
  rebindSchedule,removeSchedule,listDueSchedules,claimSchedule,completeSchedule,
  blockSchedule,coalesceSchedules
} from '../core/schedule-store.mjs';
import { LocalScheduleEngine,assertOfflineScheduleFlow } from '../core/schedule-engine.mjs';
import { readRunHistory,listRunHistory } from '../core/history.mjs';

let CLOCK=Date.parse('2026-10-29T15:00:00.000Z');
const SHA='a'.repeat(64);
async function fixture(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'omni-schedule-'));
  const data=path.join(root,'profile');
  const workspace=path.join(root,'workspace');
  await fs.mkdir(data);await fs.mkdir(workspace);
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const project=await registerProject(data,workspace);
  return {root,data,workspace,project};
}
function spec(project,extra={}) {
  return {label:'Inspeção local',intervalMinutes:1,
    projectId:project.id,flowRevision:SHA,...extra};
}
test('especificação exige projeto UUID, revisão salva, frequência e título seguros',()=>{
  assert.equal(assertScheduleSpec(spec({id:randomUUID()})).intervalMinutes,1);
  assert.throws(()=>assertScheduleSpec(spec({id:'not-a-project'})),/Projeto/);
  assert.throws(()=>assertScheduleSpec(spec({id:randomUUID()},{flowRevision:null})),/Salve/);
  assert.throws(()=>assertScheduleSpec(spec({id:randomUUID()},{intervalMinutes:0})),/Intervalo/);
  assert.throws(()=>assertScheduleSpec(spec({id:randomUUID()},{intervalMinutes:1441})),/Intervalo/);
  assert.throws(()=>assertScheduleSpec(spec({id:randomUUID()},{label:'X\nY'})),/Nome/);
});
test('criação persiste desativada sem alterar arquivos do projeto',async t=>{
  const {data,workspace,project}=await fixture(t);
  const job=await createSchedule(data,spec(project),{now:CLOCK});
  assert.equal(job.enabled,false);
  assert.equal(job.nextRunAt,null);
  assert.equal((await listSchedules(data)).length,1);
  assert.deepEqual(await fs.readdir(workspace),[]);
  const duplicate=createSchedule(data,spec(project),{now:CLOCK});
  await assert.rejects(duplicate,/já existe/);
  assert.ok((await fs.stat(path.join(data,'local-schedules','schedules.json'))).isFile());
});
test('habilitação agenda no futuro, disparo é reclamado uma vez e dupla claim falha',async t=>{
  const {data,project}=await fixture(t);
  const created=await createSchedule(data,spec(project),{now:CLOCK});
  const enabled=await setScheduleEnabled(data,created.id,true,{now:CLOCK});
  assert.equal(enabled.nextRunAt,new Date(CLOCK+60_000).toISOString());
  assert.deepEqual(await listDueSchedules(data,{now:CLOCK}),[]);
  assert.equal((await listDueSchedules(data,{now:CLOCK+60_000})).length,1);
  await assert.rejects(claimSchedule(data,created.id,{now:CLOCK+59_000}),/Horário/);
  const running=await claimSchedule(data,created.id,{now:CLOCK+60_000});
  assert.equal(running.state,'running');
  assert.equal(running.runs,1);
  await assert.rejects(claimSchedule(data,created.id,{now:CLOCK+60_000}),/executando/);
  await assert.rejects(completeSchedule(data,created.id,randomUUID(),{outcome:'PASS'},
    {now:CLOCK+60_100}),/token/);
  const done=await completeSchedule(data,created.id,running.runToken,{outcome:'PASS'},
    {now:CLOCK+60_100});
  assert.equal(done.lastOutcome,'PASS');
  assert.equal(done.state,'idle');
  await assert.rejects(completeSchedule(data,created.id,running.runToken,{outcome:'PASS'},
    {now:CLOCK+60_100}),/duplicada/);
});
test('pausar durante execução não cancela a operação atual, mas impede futuro disparo',async t=>{
  const {data,project}=await fixture(t);
  const s=await createSchedule(data,spec(project),{now:CLOCK});
  await setScheduleEnabled(data,s.id,true,{now:CLOCK});
  const claimed=await claimSchedule(data,s.id,{now:CLOCK+60_000});
  const paused=await setScheduleEnabled(data,s.id,false,{now:CLOCK+60_005});
  assert.equal(paused.enabled,false);
  assert.equal(paused.state,'running');
  const done=await completeSchedule(data,s.id,claimed.runToken,{outcome:'PASS'},
    {now:CLOCK+61_000});
  assert.equal(done.state,'paused');
  assert.equal(done.nextRunAt,null);
  assert.deepEqual(await listDueSchedules(data,{now:CLOCK+3_600_000}),[]);
});
test('startup não dispara trabalho perdido; coalescência e retomada são limitadas',async t=>{
  const {data,project}=await fixture(t);
  const s=await createSchedule(data,spec(project),{now:CLOCK});
  await setScheduleEnabled(data,s.id,true,{now:CLOCK});
  const state=await coalesceSchedules(data,{now:CLOCK+3_600_000});
  assert.deepEqual(state,{skipped:1,interrupted:0});
  const latest=await getSchedule(data,s.id);
  assert.equal(latest.lastOutcome,'MISSED');
  assert.equal(latest.misses,1);
  assert.equal(latest.nextRunAt,new Date(CLOCK+3_660_000).toISOString());
  assert.deepEqual(await listDueSchedules(data,{now:CLOCK+3_600_000}),[]);
  const again=await coalesceSchedules(data,{now:CLOCK+3_600_100});
  assert.equal(again.skipped,0);
});
test('crash após claim pausa a tarefa e exige revisão manual antes de reiniciar',async t=>{
  const {data,project}=await fixture(t);
  const s=await createSchedule(data,spec(project),{now:CLOCK});
  await setScheduleEnabled(data,s.id,true,{now:CLOCK});
  await claimSchedule(data,s.id,{now:CLOCK+60_000});
  const recovery=await coalesceSchedules(data,{now:CLOCK+65_000});
  assert.equal(recovery.interrupted,1);
  const recovered=await getSchedule(data,s.id);
  assert.equal(recovered.enabled,false);
  assert.equal(recovered.lastOutcome,'INTERRUPTED');
  assert.equal(recovered.runToken,null);
  assert.equal(recovered.state,'paused');
  assert.deepEqual(await listDueSchedules(data,{now:CLOCK+3_600_000}),[]);
});
test('Windows resume não marca um worker ativo como interrompido',async t=>{
  const {data,project}=await fixture(t);
  const s=await createSchedule(data,spec(project),{now:CLOCK});
  await setScheduleEnabled(data,s.id,true,{now:CLOCK});
  const running=await claimSchedule(data,s.id,{now:CLOCK+60_000});
  const resumed=await coalesceSchedules(data,{
    now:CLOCK+3_600_000,recoverRunning:false
  });
  assert.equal(resumed.interrupted,0);
  assert.equal((await getSchedule(data,s.id)).state,'running');
  const completed=await completeSchedule(data,s.id,running.runToken,
    {outcome:'PASS'},{now:CLOCK+3_600_000});
  assert.equal(completed.nextRunAt,new Date(CLOCK+3_660_000).toISOString());
  assert.equal(completed.misses,1);
});
test('erros consecutivos pausam agendamento e não apagam histórico/saídas',async t=>{
  const {data,workspace,project}=await fixture(t);
  const file=path.join(workspace,'dados-usuarios.txt');
  await fs.writeFile(file,'protegido');
  const s=await createSchedule(data,spec(project),{now:CLOCK});
  await setScheduleEnabled(data,s.id,true,{now:CLOCK});
  for(let i=0;i<3;i++){
    const now=CLOCK+(i+1)*60_000;
    const claimed=await claimSchedule(data,s.id,{now});
    await completeSchedule(data,s.id,claimed.runToken,
      {outcome:'FAIL',message:'Execução falhou. Token:abc123',historyId:null},
      {now:now+10});
  }
  const result=await getSchedule(data,s.id);
  assert.equal(result.enabled,false);
  assert.equal(result.failures,3);
  assert.equal(result.state,'paused');
  assert.equal(await fs.readFile(file,'utf8'),'protegido');
});
test('bloqueio de fluxo alterado impede reexecução e atualização exige pausa',async t=>{
  const {data,project}=await fixture(t);
  const s=await createSchedule(data,spec(project),{now:CLOCK});
  await setScheduleEnabled(data,s.id,true,{now:CLOCK});
  await assert.rejects(rebindSchedule(data,s.id,'b'.repeat(64),{now:CLOCK}),/Pause/);
  const claimed=await claimSchedule(data,s.id,{now:CLOCK+60_000});
  const blocked=await blockSchedule(data,s.id,claimed.runToken,'Fluxo modificado',
    {now:CLOCK+60_005});
  assert.equal(blocked.lastOutcome,'BLOCKED');
  assert.equal(blocked.enabled,false);
  const updated=await rebindSchedule(data,s.id,'b'.repeat(64),{now:CLOCK+60_100});
  assert.equal(updated.flowRevision,'b'.repeat(64));
  assert.equal(updated.enabled,false);
  assert.equal(updated.failures,0);
});
test('exclusão de agenda é não destrutiva e não apaga arquivo salvo',async t=>{
  const {data,workspace,project}=await fixture(t);
  const filename=path.join(workspace,'user.txt');
  await fs.writeFile(filename,'important');
  const s=await createSchedule(data,spec(project),{now:CLOCK});
  assert.deepEqual(await removeSchedule(data,s.id),{removed:true,id:s.id});
  assert.deepEqual(await listSchedules(data),[]);
  assert.equal(await fs.readFile(filename,'utf8'),'important');
});
test('catálogo adulterado/symlink é bloqueado sem abrir arquivo externo',async t=>{
  const {data,root,project}=await fixture(t);
  const s=await createSchedule(data,spec(project),{now:CLOCK});
  const filename=path.join(data,'local-schedules','schedules.json');
  const db=JSON.parse(await fs.readFile(filename,'utf8'));
  db.schedules[0].projectId='../../path';
  await fs.writeFile(filename,JSON.stringify(db));
  await assert.rejects(listSchedules(data),/inválido|adulterado/);
  await fs.rm(filename);
  const target=path.join(root,'outside.txt');
  await fs.writeFile(target,'SECRET');
  try {await fs.symlink(target,filename,'file');}
  catch(e){if(['EPERM','EACCES'].includes(e.code))return t.skip('Symlink indisponível');throw e;}
  await assert.rejects(listSchedules(data),/substituído|inválido/);
  assert.equal(await fs.readFile(target,'utf8'),'SECRET');
});
test('agendador nunca aceita chamadas HTTP ou APIs de outros projetos',()=>{
  assert.throws(()=>assertOfflineScheduleFlow({
    nodes:[{type:'http.localJson'}]
  }),/HTTP/);
  assert.throws(()=>assertOfflineScheduleFlow({
    nodes:[{type:'project.callLocalApi'}]
  }),/HTTP/);
  assert.equal(assertOfflineScheduleFlow(exampleFlow()),true);
});
test('motor integrado dispara um fluxo salvo e registra histórico real',async t=>{
  const {data,workspace,project}=await fixture(t);
  const saved=await saveFlow(workspace,exampleFlow(),null);
  const s=await createSchedule(data,spec(project,{flowRevision:saved.revision}),{now:CLOCK});
  await setScheduleEnabled(data,s.id,true,{now:CLOCK});
  let now=CLOCK,locked=false;
  const events=[];
  const engine=new LocalScheduleEngine({
    userData:data,now:()=>now, pollMs:60000,
    acquireSlot:()=>{
      if(locked)return null;
      locked=true;
      return new AbortController();
    },
    releaseSlot:()=>{locked=false;},
    onChange:event=>events.push(event)
  });
  await engine.bootstrap();
  now+=60_000;
  const result=await engine.tick();
  assert.equal(result.status,'completed');
  assert.equal(result.outcome,'PASS');
  assert.equal(locked,false);
  assert.equal((await getSchedule(data,s.id)).runs,1);
  const output=JSON.parse(await fs.readFile(
    path.join(workspace,'.omniforge','output','venda.json'),'utf8'));
  assert.equal(output.id,1001);
  const rows=await listRunHistory(workspace);
  assert.equal(rows.length,1);
  assert.equal((await readRunHistory(workspace,rows[0].id)).ok,true);
  assert.ok(events.some(e=>e.kind==='started'));
  assert.ok(events.some(e=>e.kind==='completed'));
  assert.equal((await engine.tick()).status,'idle');
  engine.stop();
});
test('mutex do desktop impede execução paralela e não reclama tarefa antes de liberar',async t=>{
  const {data,workspace,project}=await fixture(t);
  const saved=await saveFlow(workspace,exampleFlow(),null);
  const s=await createSchedule(data,spec(project,{flowRevision:saved.revision}),{now:CLOCK});
  await setScheduleEnabled(data,s.id,true,{now:CLOCK});
  let now=CLOCK+60_000,busy=true,acquires=0;
  const engine=new LocalScheduleEngine({
    userData:data,now:()=>now,acquireSlot:()=>{
      acquires++;
      return busy?null:new AbortController();
    },releaseSlot:()=>{},pollMs:60000
  });
  const defer=await engine.tick();
  assert.equal(defer.status,'busy');
  assert.equal((await getSchedule(data,s.id)).runs,0);
  busy=false;
  assert.equal((await engine.tick()).outcome,'PASS');
  assert.equal((await getSchedule(data,s.id)).runs,1);
  assert.equal(acquires,2);
  engine.stop();
});
test('alteração do fluxo no disco pausa execução até nova revisão explícita',async t=>{
  const {data,workspace,project}=await fixture(t);
  const saved=await saveFlow(workspace,exampleFlow(),null);
  const s=await createSchedule(data,spec(project,{flowRevision:saved.revision}),{now:CLOCK});
  await setScheduleEnabled(data,s.id,true,{now:CLOCK});
  const changed=exampleFlow();changed.name='Outra revisão';
  const newer=await saveFlow(workspace,changed,saved.revision);
  const engine=new LocalScheduleEngine({
    userData:data,now:()=>CLOCK+60_000,pollMs:60000,
    acquireSlot:()=>new AbortController(),releaseSlot:()=>{}
  });
  const outcome=await engine.tick();
  assert.equal(outcome.status,'blocked');
  assert.equal((await getSchedule(data,s.id)).enabled,false);
  await assert.rejects(fs.stat(path.join(workspace,'.omniforge','output','venda.json')),
    {code:'ENOENT'});
  await rebindSchedule(data,s.id,newer.revision,{now:CLOCK+60_050});
  const job=await getSchedule(data,s.id);
  assert.equal(job.enabled,false);
  engine.stop();
});
