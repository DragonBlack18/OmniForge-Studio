import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { NavGlyph } from '../../shared/NavGlyph.jsx';
import { useDatabaseWorkbench } from './useDatabaseWorkbench.mjs';
import { DatabaseResults, DatabaseSchema } from './DatabaseResults.jsx';
import './DatabaseWorkbench.css';

const NOOP = () => {};
const formatSize = value => value >= 1048576 ? (value / 1048576).toFixed(1) + ' MiB' : (value / 1024).toFixed(0) + ' KiB';

export function DatabaseWorkbench({ workspace, visible = true, busy = false, onNotice = NOOP }) {
  const db = useDatabaseWorkbench(workspace, onNotice), id = useId();
  const [sql, setSql] = useState(''), [parameters, setParameters] = useState('');
  const [destination, setDestination] = useState('database.sqlite'), [selected, setSelected] = useState('');
  const [filter, setFilter] = useState(''), [parameterError, setParameterError] = useState('');
  const sqlRef = useRef(null), parameterRef = useRef(null), filterRef = useRef(null);
  const { state } = db;
  const blocked = busy || db.loading || db.acting || state?.running;
  const files = useMemo(() => (db.catalog?.files || []).filter(item => item.path.toLocaleLowerCase('pt-BR').includes(filter.toLocaleLowerCase('pt-BR'))), [db.catalog, filter]);

  useEffect(() => { setSql(''); setParameters(''); setSelected(''); setFilter(''); setParameterError(''); }, [workspace]);
  useEffect(() => {
    if (!state) { setSelected(''); return; }
    if (!state.schema.objects.some(item => item.name === selected)) setSelected(state.schema.objects.find(item => item.type === 'table')?.name || '');
  }, [state?.sessionId, state?.revision, selected]);
  useEffect(() => {
    if (state?.sessionId) {
      const source = state.sourcePath;
      setDestination(source ? source.replace(/\.(sqlite3?|db)$/i, '-copy.sqlite') : 'database.sqlite');
    }
  }, [state?.sessionId]);

  function boundParameters() {
    try {
      const value = parameters.trim() ? JSON.parse(parameters) : [];
      if (value === null || typeof value !== 'object' || (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype)) throw new Error();
      setParameterError(''); return value;
    } catch {
      setParameterError('Informe um array ou objeto JSON válido. Exemplo: ["Ana", 42] ou {"nome":"Ana"}.');
      parameterRef.current?.focus(); return undefined;
    }
  }
  async function execute(mode) {
    if (blocked || !state) return;
    const params = boundParameters();
    if (params !== undefined) await db.execute(sql, params, mode);
  }
  function editorKeys(event) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.shiftKey && !event.altKey) {
      event.preventDefault(); execute('query');
    }
  }
  const preview = name => db.execute('SELECT * FROM "' + name.replaceAll('"', '""') + '" LIMIT 1000;', [], 'query');

  return <section className="database-workbench" data-testid="database-workbench" aria-label="Banco SQLite" aria-hidden={!visible}>
    <header className="database-workbench__heading">
      <div><span className="eyebrow">DESENVOLVIMENTO</span><h2>Banco SQLite</h2>
        <p>Consulte, modele e edite uma cópia em memória. Salve o resultado em um novo arquivo do projeto.</p></div>
      <div className="database-workbench__heading-actions">
        <button type="button" className="button button--outline" disabled={blocked || !workspace} onClick={db.refresh}
          data-testid="database-refresh"><NavGlyph name="history" size={14}/> Atualizar arquivos</button>
        {!state && <button type="button" className="button button--solid" disabled={blocked || !workspace} onClick={() => db.open()}
          data-testid="database-create">Novo banco</button>}
        {state && <button type="button" className="button button--outline" disabled={blocked} onClick={db.close}
          data-testid="database-close">Fechar sessão</button>}
      </div>
    </header>
    <div className="database-workbench__feedback" aria-live="polite" data-testid="database-feedback">
      {db.error ? <p role="alert">{db.error}</p> : <p>{db.loading ? 'Lendo bancos do projeto…' : state?.running ?
        'SQLite em execução. Você pode interromper sem perder a última alteração aceita.' : db.acting ?
          'Aguardando a operação ou confirmação…' : db.message || 'Arquivos de até 32 MiB. Feche outras conexões antes de abrir uma origem.'}</p>}
    </div>
    {!workspace ? <div className="database-workbench__empty"><NavGlyph name="folder" size={30}/><h3>Abra uma pasta de projeto</h3>
      <p>Crie um banco vazio ou abra um arquivo .sqlite, .sqlite3 ou .db do projeto.</p></div> : !state ?
      <div className="database-workbench__opening">
        <section className="database-files" aria-label="Bancos no projeto">
          <header><h3>Bancos no projeto</h3><span>{db.catalog?.files.length || 0}</span></header>
          <label htmlFor={id + '-filter'}>Filtrar bancos</label>
          <div className="database-files__filter"><input id={id + '-filter'} ref={filterRef} value={filter}
            onChange={event => setFilter(event.target.value)} placeholder="Nome ou caminho"/>
            {filter && <button type="button" aria-label="Limpar filtro de bancos" onClick={() => { setFilter(''); filterRef.current?.focus(); }}>×</button>}</div>
          <div className="database-files__list">
            {files.map(item => <button key={item.path} type="button" disabled={blocked} onClick={() => db.open(item.path)}
              data-testid="database-file"><code>{item.path}</code><span>{formatSize(item.bytes)}</span><span>Abrir</span></button>)}
            {!db.loading && !files.length && <p className="database-workbench__hint">{filter ? 'Nenhum banco corresponde ao filtro.' :
              'Nenhum banco encontrado. Crie um novo banco ou coloque uma cópia SQLite offline no projeto.'}</p>}
          </div>
          {(db.catalog?.truncated || db.catalog?.skipped > 0) && <p className="database-workbench__hint">Lista limitada a 150 bancos. Arquivos vinculados, grandes ou em pastas geradas ficam fora da seleção.</p>}
        </section>
        <section className="database-workbench__intro"><h3>Uma sessão, uma cópia</h3>
          <p>A origem é lida uma vez e permanece intacta. Consultas usam SQLite nativo; alterações só entram no rascunho depois que a transação inteira termina.</p>
          <p>Use <strong>Salvar cópia</strong> para criar um novo arquivo. Fechar o aplicativo sem salvar descarta o rascunho após confirmação.</p>
          <p>Bancos WAL, arquivos auxiliares presentes, extensões e anexos de outros bancos não são aceitos nesta etapa.</p>
          <dl><div><dt>Consultas</dt><dd>1.000 linhas · 1 MiB de resultado</dd></div><div><dt>Tempo</dt><dd>Até 10 segundos por operação</dd></div>
            <div><dt>Parâmetros</dt><dd>Array ou objeto JSON vinculado</dd></div></dl>
        </section>
      </div> : <>
        <div className="database-workbench__session" data-testid="database-session">
          <div><strong>{state.sourcePath || 'Novo banco'}</strong><span>{state.sourcePath ? 'Snapshot da origem' : 'Rascunho em memória'} · SQLite {state.sqliteVersion}</span></div>
          <span>Rev. {state.revision} · {formatSize(state.bytes)}</span>
          <strong className="database-workbench__dirty" data-testid="database-dirty">{state.dirty ? 'Alterações sem cópia salva' : 'Sem alterações pendentes'}</strong>
        </div>
        <div className="database-workbench__layout">
          <DatabaseSchema state={state} selected={selected} onSelect={setSelected} onPreview={preview} blocked={blocked}/>
          <div className="database-workbench__workarea">
            <section className="database-editor" aria-label="Editor SQL">
              <header><h3>SQL</h3><span>Ctrl+Enter para consultar</span></header>
              <label className="database-workbench__sr-only" htmlFor={id + '-sql'}>Editor SQL</label>
              <textarea ref={sqlRef} id={id + '-sql'} value={sql} onChange={event => setSql(event.target.value)}
                onKeyDown={editorKeys} spellCheck={false} disabled={blocked} data-testid="database-sql"
                placeholder="Escreva sua consulta ou script SQL…" className="resize-none"/>
              <details className="database-editor__parameters"><summary>Parâmetros vinculados <span>opcional · JSON</span></summary>
                <label htmlFor={id + '-params'}>Array para ? ou objeto para :nome</label>
                <textarea ref={parameterRef} id={id + '-params'} value={parameters} onChange={event => { setParameters(event.target.value); setParameterError(''); }}
                  disabled={blocked} spellCheck={false} rows={2} className="resize-none" data-testid="database-parameters"
                  aria-invalid={Boolean(parameterError)} aria-describedby={id + '-params-help'}/>
                <p id={id + '-params-help'} role={parameterError ? 'alert' : undefined}>{parameterError ||
                  'Texto, número seguro ou null. Com parâmetros, use apenas uma instrução; deixe vazio para scripts completos.'}</p>
              </details>
              <footer><div><button type="button" className="button button--solid" disabled={blocked || !sql.trim()} onClick={() => execute('query')}
                data-testid="database-query">Consultar</button>
                <button type="button" className="button button--outline" disabled={blocked || !sql.trim()} onClick={() => execute('apply')}
                  data-testid="database-apply">Aplicar alterações</button></div>
                <button type="button" className="button button--subtle" disabled={!state.running} onClick={db.cancel}
                  data-testid="database-cancel">Interromper</button></footer>
              <p className="database-editor__scope">Consultar é somente leitura. Aplicar confirma o script e usa uma transação única; BEGIN/COMMIT e PRAGMA são geridos pelo aplicativo. Mudar de projeto limpa o editor SQL.</p>
            </section>
            <DatabaseResults result={db.result} sessionId={state.sessionId} onNotice={onNotice} onError={db.setError}/>
            <form className="database-save" onSubmit={event => { event.preventDefault(); if (!blocked) db.save(destination); }} noValidate>
              <div><label htmlFor={id + '-destination'}>Novo arquivo no projeto</label>
                <input id={id + '-destination'} value={destination} onChange={event => setDestination(event.target.value)} disabled={blocked}
                  data-testid="database-destination" aria-describedby={id + '-save-help'}/></div>
              <button type="submit" className="button button--outline" disabled={blocked || !destination.trim()} data-testid="database-save">Salvar cópia</button>
              <p id={id + '-save-help'}>{state.lastSavedCopy ? 'Última cópia: ' + state.lastSavedCopy + '. ' : ''}
                Use uma pasta existente e um nome novo. Nenhum arquivo será sobrescrito.</p>
            </form>
          </div>
        </div>
      </>}
  </section>;
}

export default DatabaseWorkbench;
