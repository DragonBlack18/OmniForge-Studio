/** Async session coordinator; no React Flow dependency and no hidden execution. */
export function createFlowRecoveryController(api, { delay = 900, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let session = null;
  let state = Object.freeze({ phase:'idle', draft:null, error:'', savedAt:null, stagingEpoch:0 });
  const listeners = new Set();
  const publish = (s, patch) => {
    if (s !== session) return;
    state = Object.freeze({ ...state, ...patch });
    for (const listener of listeners) listener();
  };
  const cancelTimer = s => { if (s?.timer != null) clearTimer(s.timer); if (s) s.timer = null; };
  const fail = (s, error) => {
    s.failed = true;
    publish(s, { phase:'error', error:error?.message || 'Não foi possível proteger o fluxo.' });
  };
  function enqueue(s) {
    const latest = s.latest;
    if (!latest?.dirty || !s.ready || s.draft || s.failed || s.paused || s !== session) return s.chain;
    const { flow, revision } = latest;
    s.chain = s.chain.catch(() => {}).then(async () => {
      if (session !== s || s.failed) return;
      const content = JSON.stringify(flow);
      if (content === s.lastContent && revision === s.lastBase) {
        publish(s, { phase:'saved', error:'' });
        return;
      }
      const saved = await api.writeFlowDraft(s.root, flow, revision, s.token);
      // Keep a token from an in-flight write even if a native save paused us.
      s.token = saved.draftRevision;
      s.lastContent = content; s.lastBase = revision;
      publish(s, { phase:s.paused?'saving':'saved', savedAt:saved.savedAt, error:'' });
    }).catch(error => fail(s, error));
    return s.chain;
  }
  function schedule(s) {
    cancelTimer(s);
    if (!s.latest?.dirty || !s.ready || s.draft || s.failed || s.paused) return;
    publish(s, { phase:'pending' });
    s.timer = setTimer(() => { s.timer = null; enqueue(s); }, delay);
  }
  const controller = {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    close() {
      cancelTimer(session);
      session = null;
      publish(null, { phase:'idle', draft:null, error:'', savedAt:null });
    },
    async open(root) {
      cancelTimer(session);
      if (!root) { controller.close(); return; }
      const s = { root, token:null, latest:null, timer:null, chain:Promise.resolve(),
        ready:false, failed:false, paused:false, draft:null, lastContent:null, lastBase:null };
      session = s;
      publish(s, { phase:'loading', draft:null, error:'', savedAt:null });
      try {
        const draft = await api.readFlowDraft(root);
        if (session !== s) return;
        s.ready = true; s.draft = draft; s.token = draft?.draftRevision ?? null;
        publish(s, { phase:draft?'available':'ready', draft, savedAt:draft?.savedAt ?? null });
        schedule(s);
      } catch (error) { s.ready = true; fail(s, error); }
    },
    stage(root, flow, revision, dirty) {
      const s = session;
      if (!s || s.root !== root) return;
      s.latest = { flow, revision, dirty };
      if (!dirty) {
        cancelTimer(s);
        if (s.ready && !s.draft && !s.failed && !s.paused) publish(s, { phase:'ready' });
        return;
      }
      schedule(s);
    },
    async flush() {
      const s = session;
      if (!s) return true;
      cancelTimer(s); await enqueue(s); return !s.failed;
    },
    async beforeSave() {
      const s = session;
      if (!s || !s.ready || s.draft || s.paused) throw new Error('Resolva a recuperação do fluxo antes de salvar.');
      // Protect the current buffer where possible before native save, but an
      // unavailable encrypted store must never prevent explicit original save.
      cancelTimer(s); const pending = enqueue(s); s.paused = true;
      publish(s, { phase:'saving' });
      await pending;
      if (session !== s) throw new Error('Projeto alterado durante salvamento.');
      return s;
    },
    async afterSave(lease, successful) {
      const s = session;
      if (!s || s !== lease) return;
      if (successful && s.token) {
        try {
          await api.discardFlowDraft(s.root, s.token);
          s.token = null; s.lastContent = null; s.lastBase = null; s.failed = false;
          publish(s, { savedAt:null, error:'' });
        } catch { fail(s, new Error('Fluxo salvo; checkpoint anterior preservado. Reabra o projeto para revisá-lo.')); }
      }
      if (session !== s) return;
      s.paused = false;
      // Do not schedule a pre-save graph with a post-save base revision here.
      // The React adapter stages the committed document after this epoch bump.
      publish(s, { phase:s.failed?'error':'ready', stagingEpoch:state.stagingEpoch + 1 });
    },
    async restore(currentRevision) {
      const s = session;
      if (!s?.draft) return null;
      await s.chain;
      const fresh = await api.readFlowDraft(s.root);
      if (session !== s) throw new Error('Projeto alterado durante restauração.');
      if (!fresh || fresh.draftRevision !== s.token)
        throw new Error('Rascunho atualizado por outra sessão. Reabra o projeto.');
      s.draft = fresh; publish(s, { draft:fresh });
      if (fresh.sourceUnavailable || fresh.baseRevision !== fresh.sourceRevision || fresh.baseRevision !== currentRevision)
        throw new Error('O fluxo no disco mudou. Restauração bloqueada; o rascunho foi preservado.');
      const flow = structuredClone(fresh.flow);
      s.draft = null; s.latest = null; s.failed = false;
      s.lastContent = JSON.stringify(flow); s.lastBase = fresh.baseRevision;
      publish(s, { phase:'saved', draft:null, error:'' });
      return flow;
    },
    async discard() {
      const s = session;
      if (!s?.draft) return;
      await s.chain;
      await api.discardFlowDraft(s.root, s.token);
      if (session !== s) return;
      s.draft = null; s.token = null; s.failed = false; s.lastContent = null;
      publish(s, { phase:'ready', draft:null, error:'', savedAt:null, stagingEpoch:state.stagingEpoch + 1 });
    },
    retry() {
      const s = session;
      if (!s || !s.ready || s.draft || s.paused) return;
      s.failed = false; publish(s, { phase:'ready', error:'' }); schedule(s);
    }
  };
  return controller;
}
