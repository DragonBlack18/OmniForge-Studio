import { useEffect, useState, useSyncExternalStore } from 'react';
import { createFlowRecoveryController } from './flow-recovery-controller.mjs';

export function useFlowRecovery({ workspace, graph, revision, dirty, execute, notify,
  replaceDocument, captureSaveToken, markSaved }) {
  const [controller] = useState(() => createFlowRecoveryController({
    readFlowDraft: (...args) => window.omni.readFlowDraft(...args),
    writeFlowDraft: (...args) => window.omni.writeFlowDraft(...args),
    discardFlowDraft: (...args) => window.omni.discardFlowDraft(...args)
  }));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  // The shell explicitly opens after native project activation, including when
  // re-opening the SAME path. Unmount invalidates pending callbacks and timers.
  useEffect(() => () => controller.close(), [controller]);
  useEffect(() => {
    controller.stage(workspace, graph, revision, dirty);
  }, [controller, workspace, graph, revision, dirty, state.stagingEpoch]);
  const locked = state.phase === 'loading' || Boolean(state.draft);
  const save = () => execute(async () => {
    if (!workspace) throw new Error('Abra uma pasta para salvar o fluxo.');
    const snapshot = captureSaveToken(), lease = await controller.beforeSave();
    let success = false, unchanged, result;
    try {
      result = await window.omni.saveFlow(graph, revision);
      unchanged = markSaved(snapshot, result.revision); success = true;
    } finally { await controller.afterSave(lease, success); }
    notify(unchanged ? `Fluxo gravado em ${result.path}` : 'Fluxo salvo; alterações recentes ainda precisam ser gravadas.');
  });
  const restore = () => execute(async () => {
    const flow = await controller.restore(revision);
    if (!flow) return;
    replaceDocument(flow, revision, true);
    notify('Fluxo restaurado no editor. Salvar e executar continuam sendo ações separadas.');
  });
  const discard = () => execute(async () => {
    if (!window.confirm('Descartar somente a cópia de recuperação do fluxo? O arquivo original não será alterado.')) return;
    await controller.discard();
    notify('Cópia de recuperação do fluxo descartada; original preservado.');
  });
  return { ...state, controller, locked, save, restore, discard };
}
