import React, { useEffect, useState } from 'react';
import './FlowRecoveryNotice.css';

export default function FlowRecoveryNotice({ recovery, revision, busy, onRestore, onDiscard }) {
  const [inspect, setInspect] = useState(false);
  const { draft, error } = recovery;
  useEffect(() => setInspect(false), [draft?.draftRevision]);
  if (!draft && !error) return null;
  const conflict = draft && (draft.sourceUnavailable || draft.baseRevision !== draft.sourceRevision || draft.baseRevision !== revision);
  return <section className="flow-recovery" aria-label="Recuperação de fluxo" data-testid="flow-recovery">
    <div className="flow-recovery__row">
      <span><strong>{draft ? (conflict ? 'Conflito com o fluxo salvo' : 'Fluxo não salvo recuperável') : 'Proteção local indisponível'}</strong>
        <small>{draft ? (conflict ? 'O original mudou. Inspecione a cópia antes de descartá-la.' : 'Restaurar abre a cópia no editor; não salva nem executa o fluxo.') : error}</small></span>
      {draft ? <>
        <button type="button" disabled={busy || conflict} onClick={onRestore} data-testid="flow-restore-draft">Restaurar</button>
        <button type="button" disabled={busy} onClick={onDiscard}>Descartar cópia</button>
        <button type="button" aria-expanded={inspect} onClick={() => setInspect(v => !v)}>Inspecionar JSON</button>
      </> : <button type="button" disabled={busy} onClick={recovery.controller.retry}>Tentar proteger novamente</button>}
    </div>
    {draft && error && <p role="alert">{error}</p>}
    {draft && inspect && <label className="flow-recovery__json">Configurações podem conter dados sensíveis. Exibição somente local.
      <textarea className="resize-none" aria-label="JSON do fluxo recuperável" readOnly value={JSON.stringify(draft.flow, null, 2)} />
    </label>}
  </section>;
}
