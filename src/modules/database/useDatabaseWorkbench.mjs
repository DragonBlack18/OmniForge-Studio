import { useCallback, useEffect, useRef, useState } from 'react';
import { newerDatabaseState as update, reconcileDatabaseBootstrap } from './database-bootstrap.mjs';

const NOOP = () => {};

export function useDatabaseWorkbench(workspace, onNotice = NOOP) {
  const [state, setState] = useState(null), [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(false), [acting, setActing] = useState(false);
  const [error, setError] = useState(''), [result, setResult] = useState(null), [message, setMessage] = useState('');
  const generation = useRef(0), mutex = useRef(false), notice = useRef(onNotice);
  notice.current = onNotice;

  useEffect(() => {
    const token = ++generation.current;
    setState(null); setCatalog(null); setResult(null); setError(''); setMessage(''); setLoading(false);
    mutex.current = false; setActing(false);
    if (!workspace) return;
    if (!window.omni?.databaseState) { setError('Banco SQLite está disponível no aplicativo desktop.'); return; }
    let snapshotReady = false, buffered = [];
    const dispose = window.omni.onDatabaseEvent(event => {
      if (token !== generation.current || (event.state && event.state.workspace !== workspace)) return;
      if (!snapshotReady) buffered.push(event);
      else setState(previous => update(previous, event.state));
    });
    setLoading(true);
    Promise.allSettled([window.omni.databaseState(), window.omni.listDatabaseFiles()]).then(([snapshot, files]) => {
      if (token !== generation.current) return;
      const initial = reconcileDatabaseBootstrap(workspace, snapshot, files, buffered);
      setState(initial.state); setCatalog(initial.catalog); setError(initial.error);
      snapshotReady = true; buffered = [];
    }).catch(err => { if (token === generation.current) setError(err.message); })
      .finally(() => {
        if (token === generation.current) { snapshotReady = true; buffered = []; setLoading(false); }
      });
    return () => { generation.current++; dispose?.(); };
  }, [workspace]);

  const run = useCallback(async action => {
    if (mutex.current || !workspace) return null;
    mutex.current = true; setActing(true); setError('');
    const token = generation.current;
    try { return await action(token); }
    catch (err) {
      if (token === generation.current) {
        const text = String(err.message || err).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
        setError(text);
      }
      return null;
    } finally { if (token === generation.current) { mutex.current = false; setActing(false); } }
  }, [workspace]);

  const refresh = () => run(async token => {
    const files = await window.omni.listDatabaseFiles();
    if (token === generation.current) { setCatalog(files); setMessage('Lista de bancos atualizada.'); }
    return files;
  });
  const open = path => run(async token => {
    const next = path ? await window.omni.openDatabase(path) : await window.omni.createDatabase();
    if (token === generation.current && next) {
      setState(previous => update(previous, next)); setResult(null);
      setMessage(path ? 'Cópia da origem aberta em memória.' : 'Banco vazio criado em memória.');
    }
    return next;
  });
  const execute = (sql, params, mode) => run(async token => {
    const request = { sessionId: state.sessionId, revision: state.revision, requestId: crypto.randomUUID(), sql, params };
    const next = await window.omni[mode === 'apply' ? 'applyDatabaseSql' : 'queryDatabase'](request);
    if (token !== generation.current) return next;
    if (!next) { setMessage('Operação cancelada antes de aplicar.'); return null; }
    setState(previous => update(previous, next.state));
    if (next.result) setResult({ ...next.result, sql, revision: request.revision, elapsedMs: next.elapsedMs });
    else setResult(null);
    const text = next.result ? next.result.rowCount + ' linha(s) exibida(s) em ' + next.elapsedMs + ' ms.' :
      'Transação aplicada: ' + next.changes + ' alteração(ões) de linha. Revise e salve uma cópia.';
    setMessage(text); notice.current(text); return next;
  });
  const cancel = async () => {
    if (!state?.running || !state.requestId) return;
    try { await window.omni.cancelDatabaseQuery({ sessionId: state.sessionId, requestId: state.requestId }); }
    catch (err) { setError(err.message); }
  };
  const save = relativePath => run(async token => {
    const next = await window.omni.saveDatabaseCopy({ sessionId: state.sessionId, revision: state.revision, relativePath });
    if (token !== generation.current) return next;
    if (!next) { setMessage('Cópia não salva: confirmação cancelada.'); return null; }
    setState(previous => update(previous, next.state));
    const text = 'Cópia salva: ' + next.copy.path;
    setMessage(text); notice.current(text);
    try {
      const files = await window.omni.listDatabaseFiles();
      if (token === generation.current) setCatalog(files);
    } catch { /* The copy is already committed; a listing error must not report save failure. */ }
    return next;
  });
  const close = () => run(async token => {
    const closed = await window.omni.closeDatabase(state.sessionId);
    if (token === generation.current && closed) { setState(null); setResult(null); setMessage('Sessão SQLite fechada.'); }
    return closed;
  });
  return { state, catalog, loading, acting, error, result, message, setError, refresh, open, execute, cancel, save, close };
}
