import { buildFlowLayoutGraph, readFlowLayoutPositions } from '../../../core/modules/automation/layout.mjs';

/** One cancellable request, one worker, one undo entry. The worker is terminated
 * on completion, edits, workspace replacement, cancellation, failure or timeout.
 */
export function createFlowLayoutController({session,createWorker,onComplete,onError,timeoutMs=10_000}) {
  if (typeof session?.getSnapshot !== 'function' || typeof createWorker !== 'function' ||
    !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    throw new TypeError('Configuração da organização de fluxo inválida.');
  }
  let pending = null,sequence = 0;
  let snapshot = {running:false,status:'',requestId:null};
  const listeners = new Set();
  const emit = update => {snapshot={...snapshot,...update};for(const listener of listeners)listener();};
  const inform = (callback,value) => {try {callback?.(value);} catch { /* UI callbacks never change document outcomes. */ }};
  function release(request) {
    clearTimeout(request.timer);request.unsubscribe?.();
    request.worker.onmessage=null;request.worker.onerror=null;request.worker.onmessageerror=null;
    try {request.worker.terminate();} catch { /* Already terminated. */ }
  }
  function finish(request,{layout,error,reason}={}) {
    if (pending !== request) return;
    pending=null;release(request);
    if (reason) {
      const status = reason==='changed' ? 'Documento alterado; organização cancelada.' : 'Organização cancelada.';
      emit({running:false,status,requestId:null});request.resolve({applied:false,reason});return;
    }
    try {
      if(error)throw error;
      const positions=readFlowLayoutPositions(layout,request.nodeIds);
      const applied=session.applyLayout(positions,request.token);
      const result={applied,nodeCount:positions.length,reason:applied?'complete':'changed'};
      emit({running:false,status:applied?'Fluxo organizado.':'Documento alterado; resultado descartado.',requestId:null});
      if(applied)inform(onComplete,result);
      request.resolve(result);
    }catch(failure){
      const safeError=new Error(String(failure?.message || 'Não foi possível organizar o fluxo.').slice(0,250));
      emit({running:false,status:safeError.message,requestId:null});inform(onError,safeError);
      request.resolve({applied:false,reason:'error',error:safeError});
    }
  }
  function cancel(reason='cancelled') {if(pending)finish(pending,{reason});}
  async function arrange() {
    cancel('replaced');
    let graph,worker;
    const state=session.getSnapshot();
    const token=session.captureLayoutToken();
    try {
      graph=buildFlowLayoutGraph(state.nodes,state.edges);
      if(!graph.children.length)return {applied:false,reason:'empty'};
      worker=createWorker();
    }catch(error){
      emit({running:false,status:error.message,requestId:null});inform(onError,error);
      return {applied:false,reason:'error',error};
    }
    return new Promise(resolve=>{
      const id=++sequence;
      const request={id,worker,resolve,token,nodeIds:state.nodes.map(node=>node.id)};
      pending=request;
      worker.onmessage=event=>{
        const message=event?.data;
        if(message?.id!==id)return;
        finish(request,message.error?{error:new Error(message.error)}:{layout:message.layout});
      };
      worker.onerror=event=>{
        event?.preventDefault?.();finish(request,{error:new Error('Não foi possível iniciar o organizador de fluxo.')});
      };
      worker.onmessageerror=()=>finish(request,{error:new Error('O organizador retornou uma resposta ilegível.')});
      request.unsubscribe=session.subscribe(()=>{
        const current=session.captureLayoutToken();
        if(current.document!==token.document||current.edit!==token.edit)finish(request,{reason:'changed'});
      });
      request.timer=setTimeout(()=>finish(request,{error:new Error('Tempo limite de organização excedido. O fluxo foi preservado.')}),timeoutMs);
      emit({running:true,status:'Organizando conexões…',requestId:id});
      try {worker.postMessage({id,graph});}
      catch(error){finish(request,{error});}
    });
  }
  return {arrange,cancel,getSnapshot:()=>snapshot,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);}};
}
