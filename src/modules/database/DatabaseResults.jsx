import React from 'react';

export function DatabaseResults({ result, sessionId, onNotice, onError }) {
  async function copy() {
    try {
      await window.omni.copyDatabaseResult(sessionId, JSON.stringify({ columns: result.columns, rows: result.rows,
        truncated: result.truncated, truncatedCells: result.truncatedCells }));
      onNotice('Resultado exibido copiado em JSON, com tipos e indicadores de truncamento.');
    } catch (error) { onError(error.message || 'Não foi possível copiar o resultado.'); }
  }
  return <section className="database-results" aria-label="Resultado da consulta" data-testid="database-results">
    <header><h3>Resultado</h3><span>{result ? result.rowCount + ' linhas · ' + result.elapsedMs + ' ms' : 'Nenhuma consulta concluída'}</span>
      <button type="button" className="button button--subtle" disabled={!result} onClick={copy}>Copiar JSON</button></header>
    {!result ? <p className="database-workbench__hint">Execute uma consulta ou visualize uma tabela. Os dados reais aparecerão aqui.</p> : <>
      <p className="database-results__source" title={result.sql}>Revisão {result.revision} · <code>{result.sql.slice(0, 240)}</code></p>
      {(result.truncated || result.truncatedCells > 0) && <p className="database-results__limit" role="status">
        {result.truncated ? 'Resultado parcial: limite de 1.000 linhas ou 1 MiB. Refine a consulta com WHERE/LIMIT.' : ''}
        {result.truncatedCells > 0 ? ' ' + result.truncatedCells + ' célula(s) com prévia abreviada; tamanho original indicado.' : ''}</p>}
      <div className="database-results__scroll" tabIndex={0} aria-label="Tabela de resultados rolável">
        <table><thead><tr>{result.columns.map((column, index) => <th key={index} scope="col" title={column.type}>
          {column.name || '(sem nome)'}{column.type && <small>{column.type}</small>}</th>)}</tr></thead>
          <tbody>{result.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, columnIndex) =>
            <td key={columnIndex} className={'database-cell database-cell--' + cell.type}>
              <span>{cell.type === 'null' ? 'NULL' : cell.type === 'blob' ? '0x' + cell.value : String(cell.value)}</span>
              {(cell.type === 'blob' || cell.truncated) && <small>{cell.truncated ? 'Prévia · ' : ''}{cell.bytes} bytes</small>}
            </td>)}</tr>)}</tbody></table>
        {!result.rows.length && <p className="database-workbench__hint">Consulta concluída sem linhas.</p>}
      </div>
    </>}
  </section>;
}

export function DatabaseSchema({ state, selected, onSelect, onPreview, blocked }) {
  const objects = state.schema.objects;
  const object = objects.find(item => item.name === selected && ['table', 'view'].includes(item.type));
  return <aside className="database-schema" aria-label="Esquema SQLite">
    <header><h3>Esquema</h3><span>{objects.length} objetos</span></header>
    <div className="database-schema__list">
      {objects.map(item => <button key={item.type + ':' + item.name} type="button"
        aria-pressed={selected === item.name} disabled={blocked} data-testid="database-object"
        onClick={() => onSelect(item.name)} title={item.name}>
        <span>{({ table: 'Tabela', view: 'View', index: 'Índice', trigger: 'Trigger' })[item.type]}</span><code>{item.name}</code>
      </button>)}
      {!objects.length && <p className="database-workbench__hint">Banco vazio. Crie suas tabelas no editor SQL.</p>}
    </div>
    {(state.schema.truncated || state.schema.columnsTruncated) && <p className="database-workbench__hint">Esquema parcial. Consulte sqlite_schema para mais detalhes.</p>}
    {selected && <div className="database-schema__detail">
      <h4>{selected}</h4>
      {object && <><button type="button" className="button button--outline" disabled={blocked} onClick={() => onPreview(object.name)}
        data-testid="database-preview">Consultar tabela</button>
        <ul>{object.columns.map(column => <li key={column.name}><code>{column.name}</code><span>{column.type || 'sem tipo'}
          {column.primaryKey ? ' · PK' : ''}{column.notNull ? ' · NOT NULL' : ''}</span></li>)}</ul></>}
      <details><summary>Definição SQL</summary><pre>{objects.find(item => item.name === selected)?.sql}</pre>
        {objects.find(item => item.name === selected)?.definitionTruncated && <p>Definição abreviada.</p>}</details>
    </div>}
  </aside>;
}
