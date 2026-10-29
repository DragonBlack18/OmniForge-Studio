/**
 * OmniForge local-only interval scheduler coordinator.
 * One scheduler per Electron main process, one supervised execution at a time.
 * This is NOT an OS background service and does not replay missed jobs.
 */
import {
  listSchedules,listDueSchedules,claimSchedule,completeSchedule,blockSchedule,
  coalesceSchedules
} from './schedule-store.mjs';
import { getProject } from './projects.mjs';
import { readFlowDocument } from './workspace.mjs';
import { extensionSnapshot } from './extension-registry.mjs';
import { validateFlow } from './graph.mjs';
import { runSupervisedFlow } from './supervisor.mjs';
import { recordRunHistory } from './history.mjs';

const UNSAFE_NODES=new Set(['http.localJson','project.callLocalApi']);
export function assertOfflineScheduleFlow(flow) {
  if(!flow || !Array.isArray(flow.nodes))throw new Error('Fluxo agendado inválido.');
  if(flow.nodes.some(node=>UNSAFE_NODES.has(node?.type)))
    throw new Error('Agendamento automático só permite nós locais. HTTP e APIs de outros projetos exigem execução manual com consentimento.');
  return true;
}
export async function validateScheduledDocument(workspace,userData,expectedRevision) {
  const document=await readFlowDocument(workspace);
  if(!document.revision)
    throw new Error('Salve primeiro o fluxo do projeto antes de agendar.');
  if(expectedRevision && document.revision!==expectedRevision)
    throw new Error('O fluxo salvo foi alterado. Pause e aprove explicitamente a nova revisão.');
  assertOfflineScheduleFlow(document.flow);
  const extensions=await extensionSnapshot(userData,workspace);
  const validated=validateFlow(document.flow,{projects:[],extensions});
  if(!validated.valid)
    throw new Error('Fluxo salvo não está pronto para execução automática: '+validated.errors[0]);
  return {document,extensions};
}
export class LocalScheduleEngine {
  constructor({
    userData,
    acquireSlot,
    releaseSlot,
    onChange=()=>{},
    onProgress=()=>{},
    now=()=>Date.now(),
    pollMs=5000,
    projectResolver=getProject,
    validator=validateScheduledDocument,
    runner=runSupervisedFlow,
    historyRecorder=recordRunHistory
  }={}) {
    if(typeof userData!=='string'||!userData ||
       typeof acquireSlot!=='function'||typeof releaseSlot!=='function'||
       typeof onChange!=='function'||typeof onProgress!=='function'||
       typeof now!=='function'||typeof projectResolver!=='function'||
       typeof validator!=='function'||typeof runner!=='function'||
       typeof historyRecorder!=='function'||
       !Number.isInteger(pollMs)||pollMs<250||pollMs>60000)
      throw new Error('Configuração do agendador local inválida.');
    this.userData=userData;this.acquireSlot=acquireSlot;
    this.releaseSlot=releaseSlot;this.onChange=onChange;this.onProgress=onProgress;
    this.now=now;this.pollMs=pollMs;this.projectResolver=projectResolver;
    this.validator=validator;this.runner=runner;this.historyRecorder=historyRecorder;
    this.timer=null;this.busy=false;this.stopped=false;
  }
  emit(event) {
    try {this.onChange(event);} catch { /* UI must not influence scheduling */ }
  }
  async bootstrap() {
    const result=await coalesceSchedules(this.userData,{now:this.now(),recoverRunning:true});
    this.emit({kind:'recovered',...result});
    return result;
  }
  start() {
    if(this.timer)return;
    this.stopped=false;
    this.timer=setInterval(()=>this.tick().catch(error=>{
      this.emit({kind:'scheduler-error',message:'Falha ao consultar agendamentos locais.'});
    }),this.pollMs);
    // A background timer must not keep the desktop process alive on its own.
    this.timer.unref?.();
  }
  stop() {
    this.stopped=true;
    if(this.timer){clearInterval(this.timer);this.timer=null;}
  }
  async onResume() {
    const result=await coalesceSchedules(this.userData,{now:this.now(),recoverRunning:false});
    this.emit({kind:'resumed',...result});
    return result;
  }
  async tick() {
    if(this.stopped||this.busy)return {status:'busy'};
    const due=await listDueSchedules(this.userData,{now:this.now()});
    if(!due.length)return {status:'idle'};
    return this.runNow(due[0].id,{force:false});
  }
  async runNow(id,{force=true}={}) {
    if(this.stopped||this.busy)return {status:'busy'};
    // Acquire a synchronous shared slot in the Electron main process. Manual
    // runs and scheduled runs can never operate on the same live workspace.
    const controller=this.acquireSlot();
    if(!controller)return {status:'busy'};
    this.busy=true;
    let job;
    try {
      job=await claimSchedule(this.userData,id,{now:this.now(),force});
      this.emit({kind:'started',id:job.id,projectId:job.projectId});
      let workspace=null;
      try {
        const project=await this.projectResolver(this.userData,job.projectId);
        workspace=project.path;
        const {document,extensions}=await this.validator(
          workspace,this.userData,job.flowRevision
        );
        const result=await this.runner(document.flow,{
          workspace,dryRun:false,networkApproved:false,projects:[],extensions
        },{
          timeoutMs:120_000,signal:controller.signal,
          onProgress:step=>this.onProgress({scheduleId:job.id,step})
        });
        let history=null;
        try {history=await this.historyRecorder(workspace,result);}
        catch { /* execution result must not be disguised by failed logging */ }
        const outcome=result.ok===true?'PASS':'FAIL';
        const finished=await completeSchedule(this.userData,job.id,job.runToken,{
          outcome,historyId:history?.saved?history.id:null,
          message:result.ok?'Execução concluída.':
            'Execução falhou; consulte o histórico do projeto.'
        },{now:this.now()});
        this.emit({kind:'completed',id:job.id,outcome,historyId:finished.lastHistoryId});
        return {status:'completed',id:job.id,outcome,historySaved:Boolean(history?.saved)};
      } catch(error) {
        // Fail closed: missing projects, changed revision and revoked grants
        // require explicit human review, not background retries.
        const updated=await blockSchedule(this.userData,job.id,job.runToken,
          'Fluxo indisponível ou alterado. Verifique projeto, revisão e permissões antes de reativar.',
          {now:this.now()});
        this.emit({kind:'blocked',id:job.id,message:updated.lastMessage});
        return {status:'blocked',id:job.id};
      }
    } finally {
      this.busy=false;
      try {this.releaseSlot(controller);} catch { /* shutdown remains owned by main */ }
    }
  }
  async list() {return listSchedules(this.userData);}
}
