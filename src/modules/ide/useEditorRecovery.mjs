import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Editor-only draft orchestration, independent from the CAD and automation UI.
 * Durable writes are sequenced, revision-pinned, and never touch the original
 * workspace file. An unresolved old draft blocks automatic replacement.
 */
export function useEditorRecovery({ workspace, fileName, fileContent, fileRevision, dirty }) {
  const [recoveryDraft, setRecoveryDraft] = useState(null);
  const [recoveryError, setRecoveryError] = useState('');
  const [protectionStatus, setProtectionStatus] = useState('idle');
  const [blocked, setBlocked] = useState(false);
  const keyRef = useRef('');
  const revisionRef = useRef(null);
  const queueRef = useRef(Promise.resolve());
  const keyOf = (root, relative) => root + '\0' + relative;

  const reset = useCallback(() => {
    keyRef.current = '';
    revisionRef.current = null;
    setRecoveryDraft(null);
    setRecoveryError('');
    setBlocked(false);
    setProtectionStatus('idle');
  }, []);

  const open = useCallback(async (root, relative) => {
    const key = keyOf(root, relative);
    keyRef.current = key;
    revisionRef.current = null;
    setRecoveryDraft(null);
    setRecoveryError('');
    setProtectionStatus('idle');
    setBlocked(false);
    try {
      const record = await window.omni.readEditorDraft(root, relative);
      if (keyRef.current !== key) return;
      revisionRef.current = record?.draftRevision || null;
      setRecoveryDraft(record);
      setProtectionStatus(record ? 'available' : 'idle');
    } catch (error) {
      if (keyRef.current !== key) return;
      setBlocked(true);
      setProtectionStatus('failed');
      setRecoveryError('Recuperação desativada para este arquivo: ' + (error?.message || 'erro local'));
    }
  }, []);

  useEffect(() => {
    if (!workspace || !fileName || !fileRevision || !dirty ||
        recoveryDraft || blocked || !window.omni?.writeEditorDraft) return;
    const key = keyOf(workspace, fileName);
    const content = fileContent;
    const revision = fileRevision;
    const timer = setTimeout(() => {
      queueRef.current = queueRef.current.catch(() => {}).then(async () => {
        if (keyRef.current !== key) return;
        const saved = await window.omni.writeEditorDraft(
          workspace, fileName, content, revision, revisionRef.current
        );
        if (keyRef.current === key) {
          revisionRef.current = saved.draftRevision;
          setProtectionStatus('saved');
          setRecoveryError('');
        }
      }).catch(error => {
        if (keyRef.current === key) {
          setProtectionStatus('failed');
          setRecoveryError('Não foi possível proteger o rascunho: ' + (error?.message || 'erro local'));
        }
      });
    }, 700);
    return () => clearTimeout(timer);
  }, [workspace, fileName, fileContent, fileRevision, dirty, recoveryDraft, blocked]);

  const restore = useCallback((currentRevision) => {
    if (!recoveryDraft || recoveryDraft.baseRevision !== currentRevision) return null;
    const content = recoveryDraft.content;
    setRecoveryDraft(null);
    setProtectionStatus('pending');
    return content;
  }, [recoveryDraft]);

  const discard = useCallback(async (root, relative) => {
    if (!recoveryDraft) return false;
    const key = keyOf(root, relative);
    const token = recoveryDraft.draftRevision;
    await queueRef.current.catch(() => {});
    const deleted = await window.omni.discardEditorDraft(root, relative, token);
    if (keyRef.current === key) {
      revisionRef.current = null;
      setRecoveryDraft(null);
      setRecoveryError('');
      setProtectionStatus('idle');
    }
    return deleted;
  }, [recoveryDraft]);

  const onSaved = useCallback(async (root, relative, sameContent) => {
    const key = keyOf(root, relative);
    await queueRef.current.catch(() => {});
    if (keyRef.current !== key || !sameContent) return;
    const token = revisionRef.current;
    if (token) {
      try {
        await window.omni.discardEditorDraft(root, relative, token);
        if (keyRef.current === key) {
          revisionRef.current = null;
          setProtectionStatus('idle');
          setRecoveryError('');
        }
      } catch (error) {
        if (keyRef.current === key) {
          setProtectionStatus('failed');
          setRecoveryError('Arquivo salvo, mas o rascunho antigo não foi limpo: ' +
            (error?.message || 'erro local'));
        }
      }
    }
  }, []);

  return {
    recoveryDraft, recoveryError, protectionStatus, reset, open, restore, discard, onSaved
  };
}
