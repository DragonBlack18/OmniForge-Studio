import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * CAD-only recovery coordinator. The checkpoint is separate from sketch.json,
 * never restores automatically, and uses a CAS token on every IPC mutation.
 */
export function useCadRecovery({ workspace, sketch, revision, dirty }) {
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('idle');
  const [blocked, setBlocked] = useState(false);
  const currentRef = useRef(null);
  const tokenRef = useRef(null);
  const queueRef = useRef(Promise.resolve());
  const epochRef = useRef(0);

  const reset = useCallback(() => {
    epochRef.current += 1;
    currentRef.current = null;
    tokenRef.current = null;
    setDraft(null);
    setError('');
    setStatus('idle');
    setBlocked(false);
  }, []);

  const open = useCallback(async root => {
    epochRef.current += 1;
    currentRef.current = root;
    tokenRef.current = null;
    setDraft(null);
    setError('');
    setStatus('idle');
    setBlocked(false);
    try {
      const existing = await window.omni.readCadDraft(root);
      if (currentRef.current !== root) return;
      tokenRef.current = existing?.draftRevision ?? null;
      setDraft(existing);
      setStatus(existing ? 'available' : 'idle');
    } catch (cause) {
      if (currentRef.current !== root) return;
      setBlocked(true);
      setStatus('failed');
      setError('Recuperação CAD indisponível: ' + (cause?.message || 'erro local'));
    }
  }, []);

  useEffect(() => {
    if (!workspace || !dirty || draft || blocked || !window.omni?.writeCadDraft ||
        currentRef.current !== workspace) return;
    const root = workspace;
    const snapshot = sketch;
    const baseRevision = revision;
    const epoch = epochRef.current;
    setStatus('pending');
    const timer = setTimeout(() => {
      if (epochRef.current !== epoch) return;
      queueRef.current = queueRef.current.catch(() => {}).then(async () => {
        if (currentRef.current !== root || epochRef.current !== epoch) return;
        const saved = await window.omni.writeCadDraft(
          root, snapshot, baseRevision, tokenRef.current
        );
        if (currentRef.current === root) {
          // A save can invalidate the timer while an IPC write is in flight;
          // retain its CAS token so the completed native save can clean it.
          tokenRef.current = saved.draftRevision;
          if (epochRef.current === epoch) {
            setStatus('saved');
            setError('');
          }
        }
      }).catch(cause => {
        if (currentRef.current === root && epochRef.current === epoch) {
          setStatus('failed');
          setError('Falha ao proteger desenho CAD: ' + (cause?.message || 'erro local'));
        }
      });
    }, 900);
    return () => clearTimeout(timer);
  }, [workspace, sketch, revision, dirty, draft, blocked]);

  const restore = useCallback(currentRevision => {
    if (!draft || draft.baseRevision !== currentRevision) return null;
    const value = structuredClone(draft.sketch);
    setDraft(null);
    setStatus('pending');
    return value;
  }, [draft]);

  const discard = useCallback(async root => {
    if (!draft || currentRef.current !== root) return false;
    await queueRef.current.catch(() => {});
    const removed = await window.omni.discardCadDraft(root, draft.draftRevision);
    if (currentRef.current === root) {
      tokenRef.current = null;
      setDraft(null);
      setStatus('idle');
      setError('');
    }
    return removed;
  }, [draft]);

  const beforeSave = useCallback(async root => {
    if (currentRef.current !== root) throw new Error('Workspace CAD alterado.');
    epochRef.current += 1; // Cancel pending debounce from the pre-save snapshot.
    await queueRef.current.catch(() => {});
  }, []);

  const onSaved = useCallback(async root => {
    await queueRef.current.catch(() => {});
    if (currentRef.current !== root) return;
    const token = tokenRef.current;
    if (!token) {
      setStatus('idle');
      return;
    }
    try {
      await window.omni.discardCadDraft(root, token);
      if (currentRef.current === root) {
        tokenRef.current = null;
        setStatus('idle');
        setError('');
      }
    } catch (cause) {
      if (currentRef.current === root) {
        setStatus('failed');
        setError('Desenho salvo, mas checkpoint antigo preservado: ' +
          (cause?.message || 'erro local'));
      }
    }
  }, []);

  return { draft, error, status, reset, open, restore, discard, beforeSave, onSaved };
}
