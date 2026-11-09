import {confirmAction} from '../../shared/confirm-action.mjs';
import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { createFlowRecoveryController } from './flow-recovery-controller.mjs';
import { saveFlowSession, restoreFlowSession } from './flow-session-recovery.mjs';

export function useFlowRecovery({workspace,graph,revision,dirty,execute,notify,session,busy}) {
  const [controller]=useState(()=>createFlowRecoveryController({
    readFlowDraft:(...args)=>window.omni.readFlowDraft(...args),
    writeFlowDraft:(...args)=>window.omni.writeFlowDraft(...args),
    discardFlowDraft:(...args)=>window.omni.discardFlowDraft(...args)
  }));
  const state=useSyncExternalStore(controller.subscribe,controller.getSnapshot);
  useEffect(()=>()=>controller.close(),[controller]);
  useEffect(()=>{controller.stage(workspace,graph,revision,dirty);},[controller,workspace,graph,revision,dirty,state.stagingEpoch]);
  const locked=state.phase==='loading'||Boolean(state.draft);
  useLayoutEffect(()=>{session.setInteractionLocked(locked||busy);},[session.setInteractionLocked,locked,busy]);
  const save=()=>execute(async()=>{
    const {result,unchanged,currentDocument}=await saveFlowSession({session,controller,workspace,saveFlow:window.omni.saveFlow});
    if(!currentDocument)throw new Error('Documento alterado; a sessão atual foi preservada.');
    notify(unchanged?`Fluxo gravado em ${result.path}`:'Fluxo salvo; alterações recentes ainda precisam ser gravadas.');
  });
  const restore=()=>execute(async()=>{
    if(await restoreFlowSession({session,controller}))
      notify('Fluxo restaurado no editor. Salvar e executar continuam sendo ações separadas.');
  });
  const discard=()=>execute(async()=>{
    if(!await confirmAction({title:'Descartar recuperação do fluxo',message:'Descartar somente a cópia de recuperação do fluxo? O arquivo original não será alterado.',confirmLabel:'Descartar cópia'}))return;
    await controller.discard();
    notify('Cópia de recuperação do fluxo descartada; original preservado.');
  });
  return {...state,controller,locked,save,restore,discard};
}
