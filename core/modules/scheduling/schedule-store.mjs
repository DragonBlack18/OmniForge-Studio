/**
 * OmniForge Local Scheduler — persistence and state machine.
 *
 * A schedule contains only a registered project UUID and an approved SHA256
 * revision of its saved flow. It NEVER stores a flow payload or credentials.
 * A crash must not replay an interrupted run automatically.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomicWrite } from '../workspace/workspace.mjs';

const FOLDER='local-schedules', FILE='schedules.json';
const MAX_RECORDS=50, MAX_BYTES=512_000, MAX_MINUTES=1440, MIN_MINUTES=1;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH=/^[a-f0-9]{64}$/;
const STATES=new Set(['idle','running','paused']);
const OUTCOMES=new Set(['PASS','FAIL','BLOCKED','MISSED','INTERRUPTED']);
const EMPTY=()=>({schemaVersion:1,schedules:[]});
const mutex=new Map();
const date=ms=>new Date(ms).toISOString();
const validTimestamp=value=>
  typeof value==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) && date(Date.parse(value))===value;
const maybeDate=value=>value===null||validTimestamp(value);
const clampMessage=value=>String(value||'').replace(/https?:\/\/\S+/gi,'[endereço oculto]')
  .replace(/\b(token|password|secret|authorization|api[_-]?key)\s*[:=]\s*\S+/gi,'$1=[oculto]')
  .replace(/[\r\n\t]/g,' ').slice(0,180);
function checkNow(now) {
  if(!Number.isSafeInteger(now)||now<946684800000||now>4102444800000)
    throw new Error('Relógio de agendamento inválido.');
  return now;
}
function checkId(id,label) {
  if(typeof id!=='string'||!UUID.test(id))throw new Error(label+' inválido.');
  return id;
}
function checkLabel(label) {
  if(typeof label!=='string'||!label.trim()||label.length>72||
     /[\u0000-\u001f\u007f]/.test(label))
    throw new Error('Nome de agendamento inválido.');
  return label.trim();
}
function checkInterval(minutes) {
  if(!Number.isInteger(minutes)||minutes<MIN_MINUTES||minutes>MAX_MINUTES)
    throw new Error('Intervalo permitido: 1 até 1440 minutos.');
  return minutes;
}
function checkRevision(revision) {
  if(typeof revision!=='string'||!HASH.test(revision))
    throw new Error('Salve o fluxo e obtenha uma revisão válida antes de agendar.');
  return revision;
}
async function safeDir(userData,{create=false}={}) {
  if(typeof userData!=='string'||!path.isAbsolute(userData)||userData.length>4096)
    throw new Error('Perfil local do aplicativo inválido.');
  const base=path.resolve(userData),target=path.join(base,FOLDER);
  for(const dir of [base,target]) {
    try {
      const st=await fs.lstat(dir);
      if(st.isSymbolicLink()||!st.isDirectory())
        throw new Error('Diretório de agendamentos inseguro.');
    } catch(err) {
      if(err.code!=='ENOENT')throw err;
      if(!create)return null;
      await fs.mkdir(dir,{mode:0o700});
    }
  }
  return target;
}
function validateRecord(job) {
  if(!job||typeof job!=='object'||Array.isArray(job)||
     !UUID.test(job.id||'')||!UUID.test(job.projectId||'')||
     !HASH.test(job.flowRevision||'')||!checkName(job.label)||
     !Number.isInteger(job.intervalMinutes)||job.intervalMinutes<MIN_MINUTES||
     job.intervalMinutes>MAX_MINUTES||typeof job.enabled!=='boolean'||
     !STATES.has(job.state)||!validTimestamp(job.createdAt)||
     !validTimestamp(job.updatedAt)||!maybeDate(job.nextRunAt)||
     !maybeDate(job.lastStartedAt)||!maybeDate(job.lastFinishedAt)||
     (job.lastOutcome!==null&&!OUTCOMES.has(job.lastOutcome))||
     typeof job.lastMessage!=='string'||job.lastMessage.length>180||
     !Number.isSafeInteger(job.runs)||job.runs<0||
     !Number.isSafeInteger(job.misses)||job.misses<0||
     !Number.isSafeInteger(job.failures)||job.failures<0||
     (job.lastHistoryId!==null &&
       (typeof job.lastHistoryId!=='string'||job.lastHistoryId.length>100))||
     (job.runToken!==null && !UUID.test(job.runToken||'')))
    throw new Error('Registro de agendamento inválido ou adulterado.');
  if((job.state==='running')!==Boolean(job.runToken))
    throw new Error('Agendamento possui estado de execução inconsistente.');
  if(job.enabled && job.state==='paused')
    throw new Error('Agendamento pausado não pode permanecer habilitado.');
  if(!job.enabled && job.nextRunAt!==null)
    throw new Error('Agendamento desabilitado não pode conservar próximo disparo.');
  if(job.enabled && job.nextRunAt===null)
    throw new Error('Agendamento ativo sem próximo disparo.');
  return job;
}
function checkName(value) {
  return typeof value==='string'&&Boolean(value.trim())&&value.length<=72&&
    !/[\u0000-\u001f\u007f]/.test(value);
}
function validateDatabase(db) {
  if(!db||db.schemaVersion!==1||!Array.isArray(db.schedules)||
     db.schedules.length>MAX_RECORDS)
    throw new Error('Catálogo de agendamentos corrompido ou incompatível.');
  const ids=new Set();
  for(const item of db.schedules) {
    validateRecord(item);
    if(ids.has(item.id))throw new Error('Agendamentos com IDs duplicados.');
    ids.add(item.id);
  }
  return db;
}
async function readDb(userData) {
  const dir=await safeDir(userData);
  if(!dir)return EMPTY();
  const filename=path.join(dir,FILE);
  try {
    const st=await fs.lstat(filename);
    if(st.isSymbolicLink()||!st.isFile()||st.size>MAX_BYTES||st.size<1)
      throw new Error('Arquivo de agendamentos substituído ou inválido.');
    return validateDatabase(JSON.parse(await fs.readFile(filename,'utf8')));
  } catch(err) {
    if(err.code==='ENOENT')return EMPTY();
    throw err;
  }
}
async function writeDb(userData,db) {
  validateDatabase(db);
  const data=JSON.stringify(db,null,2)+'\n';
  if(Buffer.byteLength(data,'utf8')>MAX_BYTES)
    throw new Error('Catálogo de agendamentos maior que 512 KB.');
  const dir=await safeDir(userData,{create:true});
  const filename=path.join(dir,FILE);
  try {
    const st=await fs.lstat(filename);
    if(st.isSymbolicLink()||!st.isFile())
      throw new Error('Registro de agendamentos inseguro.');
  } catch(err) {if(err.code!=='ENOENT')throw err;}
  await atomicWrite(filename,data);
}
async function transaction(userData,operation) {
  const key=path.resolve(userData);
  const predecessor=mutex.get(key)||Promise.resolve();
  let unlock;
  const current=new Promise(resolve=>{unlock=resolve;});
  mutex.set(key,current);
  await predecessor;
  try {
    const db=await readDb(userData);
    const result=await operation(db);
    await writeDb(userData,db);
    return result;
  } finally {
    unlock();
    if(mutex.get(key)===current)mutex.delete(key);
  }
}
function required(db,id) {
  checkId(id,'Identificador do agendamento');
  const item=db.schedules.find(job=>job.id===id);
  if(!item)throw new Error('Agendamento não encontrado.');
  return item;
}
function scheduleNext(now,minutes) {
  return date(now+minutes*60_000);
}
export function assertScheduleSpec({label,intervalMinutes,projectId,flowRevision}) {
  return {
    label:checkLabel(label),intervalMinutes:checkInterval(intervalMinutes),
    projectId:checkId(projectId,'Projeto'),flowRevision:checkRevision(flowRevision)
  };
}
export async function listSchedules(userData) {
  return (await readDb(userData)).schedules.map(job=>({...job}))
    .sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
export async function getSchedule(userData,id) {
  const db=await readDb(userData);
  return {...required(db,id)};
}
export async function createSchedule(userData,details,{now=Date.now()}={}) {
  checkNow(now);
  const spec=assertScheduleSpec(details);
  return transaction(userData,db=>{
    if(db.schedules.length>=MAX_RECORDS)
      throw new Error('Limite de 50 agendamentos.');
    if(db.schedules.some(x=>x.projectId===spec.projectId &&
        x.flowRevision===spec.flowRevision && x.intervalMinutes===spec.intervalMinutes &&
        x.label.toLowerCase()===spec.label.toLowerCase()))
      throw new Error('Este agendamento já existe para o mesmo projeto e revisão.');
    const item={
      id:randomUUID(),...spec,createdAt:date(now),updatedAt:date(now),
      enabled:false,state:'paused',nextRunAt:null,
      lastStartedAt:null,lastFinishedAt:null,lastOutcome:null,lastMessage:'',
      lastHistoryId:null,runToken:null,runs:0,misses:0,failures:0
    };
    db.schedules.push(item);
    return {...item};
  });
}
export async function setScheduleEnabled(userData,id,enabled,{now=Date.now()}={}) {
  checkNow(now);
  if(typeof enabled!=='boolean')throw new Error('Estado de agendamento inválido.');
  return transaction(userData,db=>{
    const job=required(db,id);
    if(job.state==='running') {
      if(enabled)throw new Error('Agendamento está executando.');
      // Pausing prevents future runs but does not erase a completed side effect.
      job.enabled=false;job.nextRunAt=null;
    } else {
      job.enabled=enabled;job.state=enabled?'idle':'paused';
      job.nextRunAt=enabled?scheduleNext(now,job.intervalMinutes):null;
    }
    job.updatedAt=date(now);
    return {...job};
  });
}
export async function rebindSchedule(userData,id,flowRevision,{now=Date.now()}={}) {
  checkNow(now);checkRevision(flowRevision);
  return transaction(userData,db=>{
    const job=required(db,id);
    if(job.state==='running'||job.enabled)
      throw new Error('Pause o agendamento antes de atualizar a revisão.');
    job.flowRevision=flowRevision;
    job.state='paused';job.nextRunAt=null;job.updatedAt=date(now);
    job.lastMessage='Nova revisão aprovada. Ative novamente para agendar.';
    job.failures=0;
    return {...job};
  });
}
export async function removeSchedule(userData,id) {
  return transaction(userData,db=>{
    const job=required(db,id);
    if(job.state==='running')throw new Error('Pause e finalize a execução antes de excluir.');
    db.schedules=db.schedules.filter(item=>item.id!==id);
    return {removed:true,id};
  });
}
export async function listDueSchedules(userData,{now=Date.now()}={}) {
  checkNow(now);
  return (await listSchedules(userData)).filter(job=>job.enabled &&
    job.state==='idle' && Date.parse(job.nextRunAt)<=now)
    .sort((a,b)=>a.nextRunAt.localeCompare(b.nextRunAt));
}
/**
 * A durable claim precedes any side effect. If the OS dies after a claim,
 * recovery disables the job. At-most-once *automatic attempt*, not exactly
 * once external effects or transactions.
 */
export async function claimSchedule(userData,id,{now=Date.now(),force=false}={}) {
  checkNow(now);
  if(typeof force!=='boolean')throw new Error('Execução forçada inválida.');
  return transaction(userData,db=>{
    const job=required(db,id);
    if(!job.enabled||job.state!=='idle')
      throw new Error('Agendamento não está ativo ou já está executando.');
    if(!force && Date.parse(job.nextRunAt)>now)
      throw new Error('Horário de disparo ainda não atingido.');
    job.state='running';
    job.runToken=randomUUID();
    job.lastStartedAt=date(now);
    job.lastMessage='Execução iniciada pelo agendador.';
    job.updatedAt=date(now);
    job.nextRunAt=scheduleNext(now,job.intervalMinutes);
    job.runs+=1;
    return {...job};
  });
}
export async function completeSchedule(userData,id,token,{
  outcome,historyId=null,message=''
},{now=Date.now()}={}) {
  checkNow(now);
  if(!['PASS','FAIL','BLOCKED'].includes(outcome))
    throw new Error('Resultado de agendamento inválido.');
  if(historyId!==null && (typeof historyId!=='string'||historyId.length>100))
    throw new Error('Identificador de histórico inválido.');
  return transaction(userData,db=>{
    const job=required(db,id);
    if(job.state!=='running'||job.runToken!==token)
      throw new Error('Conclusão duplicada ou token de execução incompatível.');
    job.state=job.enabled?'idle':'paused';
    job.runToken=null;job.lastFinishedAt=date(now);job.lastHistoryId=historyId;
    job.lastOutcome=outcome;job.lastMessage=clampMessage(message);
    job.failures=outcome==='PASS'?0:job.failures+1;
    if(outcome==='BLOCKED'||job.failures>=3) {
      job.enabled=false;job.state='paused';job.nextRunAt=null;
      if(job.failures>=3 && outcome!=='BLOCKED')
        job.lastMessage='Três falhas consecutivas: agendamento pausado automaticamente.';
    }
    if(job.enabled && Date.parse(job.nextRunAt)<=now) {
      // A long execution or system suspension must not immediately produce
      // another run: coalesce already-passed interval ticks.
      job.nextRunAt=scheduleNext(now,job.intervalMinutes);
      job.misses+=1;
    }
    job.updatedAt=date(now);
    return {...job};
  });
}
/**
 * Never replay missed intervals on startup, resume from suspend, clock shift,
 * or recovery from a crashed in-flight run.
 */
export async function coalesceSchedules(userData,{now=Date.now(),recoverRunning=true}={}) {
  checkNow(now);
  if(typeof recoverRunning!=='boolean')throw new Error('Modo de recuperação inválido.');
  return transaction(userData,db=>{
    let skipped=0,interrupted=0;
    for(const job of db.schedules) {
      if(job.state==='running' && recoverRunning) {
        job.enabled=false;job.state='paused';job.nextRunAt=null;job.runToken=null;
        job.lastOutcome='INTERRUPTED';job.lastFinishedAt=date(now);
        job.lastMessage='Execução anterior interrompida: verifique os efeitos realizados antes de reativar.';
        job.failures+=1;interrupted++;job.updatedAt=date(now);
      } else if(job.state!=='running' && job.enabled && Date.parse(job.nextRunAt)<=now) {
        // No catch-up storms: coalesce any number of missed cycles into one.
        job.nextRunAt=scheduleNext(now,job.intervalMinutes);
        job.lastOutcome='MISSED';
        job.lastMessage='Disparos perdidos enquanto o aplicativo esteve indisponível; nenhum replay automático.';
        job.misses+=1;skipped++;job.updatedAt=date(now);
      }
    }
    return {skipped,interrupted};
  });
}
export async function blockSchedule(userData,id,token,reason,{now=Date.now()}={}) {
  return completeSchedule(userData,id,token,{outcome:'BLOCKED',message:reason},{now});
}
