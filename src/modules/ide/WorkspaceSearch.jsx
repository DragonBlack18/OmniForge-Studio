import React, { useEffect, useRef, useState } from 'react';
import { NavGlyph } from '../../shared/NavGlyph.jsx';
import './WorkspaceSearch.css';

export default function WorkspaceSearch({ workspace, busy = false, onOpenResult }) {
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const revision = useRef(0);

  useEffect(() => {
    revision.current += 1;
    setResult(null);
    setQuery('');
    setError('');
    setLoading(false);
  }, [workspace]);

  async function submit(event) {
    event.preventDefault();
    if (busy || loading || query.length < 2 || !workspace || !window.omni) return;
    const request = ++revision.current;
    setResult(null);
    setError('');
    setLoading(true);
    try {
      const found = await window.omni.searchWorkspaceText({ query, caseSensitive });
      if (revision.current === request) setResult(found);
    } catch (err) {
      if (revision.current === request) setError(err.message);
    } finally {
      if (revision.current === request) setLoading(false);
    }
  }

  return <section className="workspace-search" data-testid="workspace-search">
    <header className="workspace-search__hero">
      <span className="workspace-search__eyebrow">WORKSPACE / CÓDIGO FONTE</span>
      <h2>Busca global no projeto</h2>
      <p>Encontre trechos de código e navegue diretamente para a linha correspondente no editor Monaco. Busca literal, somente leitura e inteiramente local.</p>
    </header>
    <form className="workspace-search__form" onSubmit={submit}>
      <div className="workspace-search__input">
        <NavGlyph name="search" size={19}/>
        <input value={query} onChange={event => setQuery(event.target.value)}
          maxLength={120} disabled={!workspace || loading || busy}
          data-testid="workspace-search-input"
          aria-label="Texto a localizar nos arquivos"
          placeholder="Buscar método, variável, texto ou expressão literal..."/>
      </div>
      <label className="workspace-search__case">
        <input type="checkbox" checked={caseSensitive}
          disabled={!workspace || loading || busy}
          onChange={event => setCaseSensitive(event.target.checked)}/>
        Diferenciar maiúsculas/minúsculas
      </label>
      <button type="submit" className="button button--solid"
        data-testid="workspace-search-submit"
        disabled={!workspace || busy || loading || query.length < 2}>
        {loading ? 'Pesquisando...' : 'Pesquisar projeto'}
      </button>
    </form>
    {!workspace && <div className="workspace-search__empty">Abra um workspace para pesquisar no código-fonte.</div>}
    {error && <div className="workspace-search__error" role="alert">{error}</div>}
    {result && <div className="workspace-search__results">
      <div className="workspace-search__summary">
        <div>
          <span className="workspace-search__eyebrow">RESULTADOS / LOCAL</span>
          <h3>{result.results.length} ocorrência(s) em {result.filesMatched} arquivo(s)</h3>
          <p>{result.filesScanned} arquivo(s) examinados · {result.skippedFiles} ignorado(s)</p>
        </div>
        <span className="workspace-search__count">{result.results.length}</span>
      </div>
      {result.truncated && <p className="workspace-search__warning" role="status">
        Busca limitada por cotas de tamanho, tempo ou ocorrências. Refine o termo para examinar menos arquivos.
      </p>}
      {result.results.length === 0 && <div className="workspace-search__empty">
        Nenhuma ocorrência encontrada nos arquivos de texto acessíveis.
      </div>}
      <div className="workspace-search__hits">
        {result.results.map((hit, index) =>
          <button key={hit.path + ':' + hit.line + ':' + hit.column + ':' + index}
            type="button" className="workspace-search__hit"
            data-testid="workspace-search-hit"
            disabled={busy || loading}
            onClick={() => onOpenResult(hit)}
            title={hit.path + ' · linha ' + hit.line + ', coluna ' + hit.column}>
            <span className="workspace-search__path">
              <NavGlyph name="code" size={15}/>
              <strong>{hit.path}</strong>
              <small>L{hit.line}:C{hit.column}</small>
              <NavGlyph name="arrow" size={15}/>
            </span>
            <code>{hit.snippet}</code>
          </button>
        )}
      </div>
    </div>}
    <footer className="workspace-search__footer">
      <NavGlyph name="info" size={17}/>
      <p>Exclui .git, .omniforge, dependências, artefatos, arquivos binários e nomes de credenciais comuns. Limites: 1.800 arquivos, 320 KB por arquivo, 12 MB lidos e 160 resultados. Não modifica nem indexa persistentemente o projeto. Atalho: Ctrl+Shift+F.</p>
    </footer>
  </section>;
}
