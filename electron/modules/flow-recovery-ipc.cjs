'use strict';
/** Windows-only protected snapshots. No renderer-controlled paths or key material. */
function createFlowDraftCodec(safeStorage, platform = process.platform) {
  const available = async () => {
    if (platform !== 'win32' || typeof safeStorage?.isAsyncEncryptionAvailable !== 'function' ||
        !await safeStorage.isAsyncEncryptionAvailable())
      throw new Error('Recuperação protegida indisponível. Salve o fluxo manualmente (suporte Windows).');
  };
  return {
    available,
    encrypt: async text => { await available(); return safeStorage.encryptStringAsync(text); },
    decrypt: async bytes => { await available(); return (await safeStorage.decryptStringAsync(bytes)).result; }
  };
}
function installFlowRecoveryIpc({ register, core, safeStorage, getProfile, pinnedWorkspace }) {
  const codec = createFlowDraftCodec(safeStorage);
  register('readFlowDraft', claimed => core.readFlowDraft(getProfile(), pinnedWorkspace(claimed), codec));
  register('writeFlowDraft', (claimed, flow, baseRevision, expectedDraftRevision) =>
    core.writeFlowDraft(getProfile(), pinnedWorkspace(claimed), flow, baseRevision, expectedDraftRevision, codec));
  register('discardFlowDraft', (claimed, expectedDraftRevision) =>
    core.discardFlowDraft(getProfile(), pinnedWorkspace(claimed), expectedDraftRevision, codec));
}
module.exports = { createFlowDraftCodec, installFlowRecoveryIpc };
