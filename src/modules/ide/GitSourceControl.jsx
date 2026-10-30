import React, { useEffect, useState } from 'react';
import { NavGlyph } from '../../workbench/NavigationSidebar.jsx';
import './GitSourceControl.css';

export default function GitSourceControl({ workspace, busy = false, onNotice = () => {} }) {
  const [repo, setRepo] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [selected, setSelected] = useState([]);
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState('');
  const disabled = busy || acting || loading;

  async function refresh() {
    if (!workspace || !window.omni) return;
    setLoading(true);
    setError('');
    try {
      const result = await window.omni.gitStatus();
      setRepo(result);
      setSelected([]);
      setPreview(null);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    let live = true;
    setRepo(null);
    setSelected([]);
    setPreview(null);
    setError('');
    if (!workspace || !window.omni) return;
    setLoading(true);
    window.omni.gitStatus().then(data => {
      if (live) setRepo(data);
    }).catch(err => {
      if (live) setError(err.message);
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [workspace]);

  async function mutation(action, success) {
    if (disabled) return;
    setActing(true);
    setError('');
    try {
      const result = await action();
      if (result !== null) {
        setRepo(result);
        setSelected([]);
        setPreview(null);
        onNotice(success);
      } else onNotice('Commit cancelado: nenhum arquivo alterado.');
    } catch (err) { setError(err.message); }
    finally { setActing(false); }
  }

  async function openDiff(file, staged) {
    if (disabled) return;
    setError('');
    try {
      const result = await window.omni.gitDiff(file.path, staged);
      setPreview({ path: file.path, staged, ...result });
    } catch (err) { setError(err.message); }
  }
  const files = repo?.files || [];
  const staged = files.filter(file => file.staged);
  const pending = files.filter(file => file.unstaged);
  const selectedPending = pending.filter(file => selected.includes(file.path)).map(file => file.path);
  const selectedStaged = staged.filter(file => selected.includes(file.path)).map(file => file.path);
  const toggle = (name, checked) => setSelected(previous =>
    checked ? [...previous, name] : previous.filter(file => file !== name));

  return <section className="git-hub" data-testid="git-source-control">
    <header className="git-hub__hero">
      <div>
        <span className="git-hub__eyebrow">DESENVOLVIMENTO / GIT LOCAL</span>
        <h2>Controle de versão</h2>
        <p>Inspecione alterações reais, prepare arquivos e crie commits no repositório do workspace. Nenhuma sincronização remota é executada.</p>
      </div>
      <button type="button" className="button button--outline" onClick={refresh}
        disabled={disabled || !workspace}>Atualizar status</button>
    </header>
    {!workspace && <div className="git-hub__empty">Abra um workspace para visualizar o repositório Git local.</div>}
    {workspace && loading && !repo && <div className="git-hub__empty" role="status">Lendo o status real do repositório...</div>}
    {error && <div className="git-hub__error" role="alert">{error}</div>}
    {workspace && repo && !repo.available && <div className="git-hub__empty">
      <strong>Git indisponível para esta pasta</strong>
      <p>{repo.reason}</p>
      <small>Instale o Git para Windows e abra a raiz de um repositório existente. O OmniForge não executa git init automaticamente.</small>
    </div>}
    {workspace && repo?.available && <>
      <div className="git-hub__summary">
        <div><small>BRANCH ATIVA</small><strong><NavGlyph name="git" size={17}/>{repo.branch}</strong></div>
        <div><small>ÚLTIMO COMMIT</small><strong>{repo.head || 'Ainda sem commits'}</strong></div>
        <div><small>PREPARADOS</small><strong>{staged.length}</strong></div>
        <div><small>ALTERAÇÕES PENDENTES</small><strong>{pending.length}</strong></div>
      </div>
      <div className="git-hub__split">
        <div className="git-hub__changes">
          <div className="git-hub__section-head"><h3>Arquivos modificados</h3><small>{files.length} exibidos</small></div>
          {repo.truncated && <p className="git-hub__warning">Há mais de 400 alterações; exibindo somente as primeiras. Use Git no terminal para operações em massa.</p>}
          {!files.length && <div className="git-hub__clean"><NavGlyph name="check"/><strong>Árvore de trabalho limpa</strong><span>Sem alterações a preparar.</span></div>}
          {files.map(file => <div key={file.path} className="git-hub__file">
            <label className="git-hub__check">
              <input type="checkbox" checked={selected.includes(file.path)} disabled={disabled}
                aria-label={'Selecionar ' + file.path} onChange={event => toggle(file.path, event.target.checked)}/>
              <span className="git-hub__file-name" title={file.path}>{file.path}</span>
              <span className="git-hub__flag">{file.status}</span>
            </label>
            {file.oldPath && <small className="git-hub__oldpath">Anterior: {file.oldPath}</small>}
            <div className="git-hub__file-actions">
              <span>{file.untracked ? 'NÃO RASTREADO' : file.staged && file.unstaged ? 'STAGED + MODIFICADO' : file.staged ? 'STAGED' : 'ALTERADO'}</span>
              {file.unstaged && <button type="button" disabled={disabled}
                onClick={() => openDiff(file, false)}>Diff local</button>}
              {file.staged && <button type="button" disabled={disabled}
                onClick={() => openDiff(file, true)}>Diff preparado</button>}
            </div>
          </div>)}
          <div className="git-hub__staging">
            <button type="button" data-testid="git-stage" className="button button--solid" disabled={disabled || !selectedPending.length}
              onClick={() => mutation(() => window.omni.gitStage(selectedPending),
                selectedPending.length + ' arquivo(s) preparado(s) no índice Git.')}>
              Preparar ({selectedPending.length})
            </button>
            <button type="button" data-testid="git-unstage" className="button button--outline" disabled={disabled || !selectedStaged.length}
              onClick={() => mutation(() => window.omni.gitUnstage(selectedStaged),
                selectedStaged.length + ' arquivo(s) removido(s) do índice, sem alterar o conteúdo.')}>
              Despreparar ({selectedStaged.length})
            </button>
          </div>
          <div className="git-hub__commit">
            <h3>Commit local</h3>
            <label>Mensagem do commit
              <input value={message} maxLength={120} disabled={disabled} placeholder="feat: implementar novo recurso"
                onChange={e => setMessage(e.target.value)}/>
            </label>
            <button type="button" data-testid="git-commit" disabled={disabled || !staged.length || message.trim().length < 4}
              className="button button--solid" onClick={() => mutation(async () => {
                const result = await window.omni.gitCommit(message.trim());
                if (result) setMessage('');
                return result;
              }, 'Commit Git criado localmente. Histórico atualizado.')}>Confirmar commit ({staged.length})</button>
            <p>O diálogo nativo confirma todos os arquivos já preparados, inclusive por outros programas. Nada é enviado ao GitHub. Salve as alterações do editor antes de preparar arquivos.</p>
          </div>
        </div>
        <div className="git-hub__details">
          <div className="git-hub__section-head"><h3>Diferenças</h3><small>{preview ? (preview.staged ? 'INDEX' : 'WORKTREE') : 'PREVIEW'}</small></div>
          {preview ? <div className="git-hub__diff">
            <strong title={preview.path}>{preview.path}</strong>
            {preview.truncated && <p className="git-hub__warning">Diff limitado a 120 KB. Use Git para inspecionar o conteúdo completo.</p>}
            <pre>{preview.text}</pre>
          </div> : <p className="git-hub__muted">Selecione "Diff local" ou "Diff preparado" para comparar com a revisão anterior. O conteúdo não é gravado no histórico do OmniForge.</p>}
          <div className="git-hub__section-head git-hub__history-head"><h3>Commits recentes</h3><small>ATÉ 12</small></div>
          {!repo.commits.length && <p className="git-hub__muted">Este repositório ainda não possui commits.</p>}
          {repo.commits.map((commit, index) => <div key={commit.hash + index} className="git-hub__history">
            <code>{commit.hash}</code><strong>{commit.subject}</strong>
            <small>{commit.date ? new Date(commit.date).toLocaleString('pt-BR') : ''}</small>
          </div>)}
        </div>
      </div>
      <div className="git-hub__footer">
        <NavGlyph name="info" size={17}/>
        <p>Opera somente no repositório Git local. Não executa push, pull, checkout, merge, reset ou clean. Commits exigem identidade Git configurada; projetos não confiáveis podem conter filtros Git que devem ser revisados antes de preparar arquivos.</p>
      </div>
    </>}
  </section>;
}
