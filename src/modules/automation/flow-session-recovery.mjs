/** The exact save/restore transaction used by React, also exercised without DOM. */
export async function saveFlowSession({session,controller,workspace,saveFlow}) {
  if(!workspace)throw new Error('Abra uma pasta para salvar o fluxo.');
  const token=session.captureSaveToken(),snapshot=session.getSnapshot();
  const flow=JSON.parse(token.key),revision=snapshot.flowRevision;
  controller.stage(workspace,flow,revision,snapshot.flowDirty&&snapshot.recoveryEligible);
  const lease=await controller.beforeSave();
  let success=false,unchanged=false,result;
  try {
    if(!session.isCurrentDocument(token))throw new Error('Projeto alterado durante salvamento.');
    result=await saveFlow(flow,revision);
    if(session.isCurrentDocument(token)) {
      unchanged=session.markSaved(token,result.revision);success=true;
    }
  } finally {
    const current=session.getSnapshot();
    await controller.afterSave(lease,success,success?{
      flow:current.graph,revision:current.flowRevision,dirty:current.flowDirty&&current.recoveryEligible
    }:null);
  }
  return {result,unchanged,currentDocument:success};
}
export async function restoreFlowSession({session,controller}) {
  const before=session.getSnapshot();
  const flow=await controller.restore(before.flowRevision,()=>session.getSnapshot().documentEpoch===before.documentEpoch,
    recovered=>session.restoreRecovered(recovered));
  if(!flow)return false;
  return true;
}
