import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { NavGlyph } from '../../shared/NavGlyph.jsx';
import './DevelopmentTools.css';

const STATUS = { running: 'Executando', completed: 'Concluído', failed: 'Falhou',
  cancelled: 'Interrompido', timeout: 'Tempo excedido', 'output-limit': 'Limite de saída' };
const ACTIONS = [
  { id: 'run', label: 'Executar arquivo', icon: 'terminal' },
  { id: 'check', label: 'Verificar sintaxe', icon: 'check' },
  { id: 'test', label: 'Executar testes', icon: 'code' }
];
const NOOP = () => {};

function applyEvent(previous, event) {
  if (previous?.id === event.id && previous.sequence >= event.task.sequence) return previous;
  return { ...event.task, output: event.type === 'output' ?
    ((previous?.id === event.id ? previous.output || '' : '') + (event.chunk || '')).slice(-48_000) :
    event.task.output || '' };
}

export default function DevelopmentTools({ workspace, busy = false, onNotice = NOOP }) {
  const [catalog, setCatalog] = useState(null);
  const [selected, setSelected] = useState('');
  const [query, setQuery] = useState('');
  const [action, setAction] = useState('run');
  const [argumentsText, setArgumentsText] = useState('');
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');
  const [argumentError, setArgumentError] = useState('');
  const [followOutput, setFollowOutput] = useState(true);
  const generation = useRef(0), logRef = useRef(null), queryRef = useRef(null), argsRef = useRef(null);
  const noticeRef = useRef(onNotice);
  noticeRef.current = onNotice;
  const fieldId = useId();

  useEffect(() => {
    const token = ++generation.current;
    setCatalog(null); setSelected(''); setTask(null); setError(''); setArgumentError('');
    setQuery(''); setArgumentsText(''); setActing(false); setLoading(false);
    if (!workspace) return;
    if (!window.omni?.listDevelopmentTargets) {
      setError('O executor local está disponível no aplicativo desktop.');
      return;
    }
    setLoading(true);
    let snapshotReady = false, buffered = [];
    const dispose = window.omni.onDevelopmentEvent(event => {
      if (generation.current !== token || event?.task?.workspace !== workspace) return;
      if (snapshotReady) setTask(previous => applyEvent(previous, event));
      else buffered.push(event);
      if (event.type === 'finished') noticeRef.current(event.task.message);
    });
    window.omni.developmentState().then(snapshot => {
      if (generation.current !== token) return;
      let current = snapshot?.workspace === workspace ? snapshot : null;
      for (const event of buffered) current = applyEvent(current, event);
      setTask(current); snapshotReady = true; buffered = [];
    }).catch(() => {
      if (generation.current !== token) return;
      setTask(buffered.reduce(applyEvent, null)); snapshotReady = true; buffered = [];
    });
    window.omni.listDevelopmentTargets().then(data => {
      if (generation.current !== token) return;
      setCatalog(data); setSelected(data.targets[0]?.path || '');
    }).catch(err => { if (generation.current === token) setError(err.message); })
      .finally(() => { if (generation.current === token) setLoading(false); });
    return () => { generation.current++; dispose?.(); };
  }, [workspace]);

  useEffect(() => {
    if (followOutput && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [task?.output, task?.status, followOutput]);

  const target = catalog?.targets.find(item => item.path === selected);
  const runtime = target && catalog?.runtimes[target.runtime];
  const filtered = useMemo(() => (catalog?.targets || []).filter(item =>
    item.path.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'))), [catalog, query]);
  const running = task?.status === 'running';
  const blocked = busy || loading || acting || running;

  async function refresh() {
    if (blocked || !workspace) return;
    const token = generation.current;
    setLoading(true); setError('');
    try {
      const data = await window.omni.listDevelopmentTargets();
      if (generation.current !== token) return;
      setCatalog(data);
      setSelected(previous => data.targets.some(item => item.path === previous) ? previous : data.targets[0]?.path || '');
    } catch (err) { if (generation.current === token) setError(err.message); }
    finally { if (generation.current === token) setLoading(false); }
  }

  async function launch(event) {
    event.preventDefault();
    if (blocked || !target || !runtime?.available) return;
    const args = action === 'run' && argumentsText !== '' ? argumentsText.split(/\r?\n/) : [];
    const bytes = value => new TextEncoder().encode(value).length;
    if (args.length > 64 || args.some(value => bytes(value) > 2048 || value.includes('\0')) || bytes(JSON.stringify(args)) > 16000) {
      setArgumentError('Use até 64 argumentos de até 2 KB cada, com 16 KB no total.');
      argsRef.current?.focus(); return;
    }
    const token = generation.current;
    setActing(true); setError(''); setArgumentError('');
    try {
      const started = await window.omni.runDevelopmentTask({ path: target.path, revision: target.revision, action, args });
      if (generation.current !== token) return;
      if (started) setTask(previous => previous?.id === started.id && previous.sequence >= started.sequence ? previous : started);
      else noticeRef.current('Execução cancelada antes de iniciar.');
    } catch (err) { if (generation.current === token) setError(err.message); }
    finally { if (generation.current === token) setActing(false); }
  }

  async function cancel() {
    if (!running) return;
    const token = generation.current;
    try {
      const cancelled = await window.omni.cancelDevelopmentTask(task.id);
      if (generation.current === token && cancelled) noticeRef.current('Interrupção solicitada.');
    } catch (err) { if (generation.current === token) setError(err.message); }
  }

  async function copyOutput() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('A área de transferência não está disponível.');
      await navigator.clipboard.writeText(task.output);
      noticeRef.current('Saída copiada.');
    } catch (err) { setError(err.message || 'Não foi possível copiar a saída.'); }
  }

  return <section className="development-tools" data-testid="development-tools" aria-label="Executar e testar código">
    <header className="development-tools__heading">
      <div><span className="eyebrow">DESENVOLVIMENTO</span><h2>Executar e testar</h2>
        <p>Node.js e Python no seu projeto. Salve suas edições e atualize os arquivos antes de executar.</p></div>
      <button type="button" className="button button--outline" onClick={refresh} disabled={blocked || !workspace}
        data-testid="development-refresh"><NavGlyph name="history" size={15}/> Atualizar arquivos</button>
    </header>
    <div className="development-tools__feedback" aria-live="polite">
      {error ? <p className="development-tools__error" role="alert">{error}</p> :
        loading ? <p role="status">Lendo arquivos e ambientes locais…</p> :
          <p>{catalog?.truncated ? 'Exibindo até 300 arquivos; pastas geradas e ambientes virtuais ficam fora da lista.' :
            catalog?.skipped ? `${catalog.skipped} arquivo(s) não puderam ser lidos. Arquivos binários ou maiores que 1 MB são ignorados.` : '\u00a0'}</p>}
    </div>
    {!workspace ? <div className="development-tools__empty"><NavGlyph name="folder" size={30}/>
      <h3>Abra uma pasta de projeto</h3><p>Os arquivos JavaScript e Python aparecerão aqui para execução, verificação de sintaxe e testes.</p></div> :
      <div className="development-tools__layout">
        <aside className="development-tools__files" aria-label="Arquivos executáveis">
          <div className="development-tools__file-heading"><strong>Arquivos salvos</strong><span>{catalog?.targets.length || 0}</span></div>
          <label className="development-tools__search-label" htmlFor={fieldId + '-search'}>Filtrar arquivos</label>
          <div className="development-tools__search">
            <NavGlyph name="search" size={14}/><input ref={queryRef} id={fieldId + '-search'} type="text"
              value={query} onChange={event => setQuery(event.target.value)} placeholder="Nome ou caminho"/>
            {query && <button type="button" aria-label="Limpar filtro de arquivos" onClick={() => { setQuery(''); queryRef.current?.focus(); }}>
              <NavGlyph name="close" size={13}/></button>}
          </div>
          <div className="development-tools__file-list">
            {filtered.map(item => <button type="button" key={item.path} disabled={blocked} aria-pressed={selected === item.path}
              className="development-tools__file" onClick={() => { setSelected(item.path); setError(''); }}
              data-testid="development-file" title={item.path}>
              <span>{item.runtime === 'python' ? 'PY' : 'JS'}</span><code>{item.path}</code>
            </button>)}
            {!loading && !filtered.length && <p className="development-tools__list-empty">{query ? 'Nenhum arquivo corresponde ao filtro.' :
              'Nenhum arquivo .js, .cjs, .mjs ou .py nesta pasta. Crie um arquivo no editor e atualize a lista.'}</p>}
          </div>
          <div className="development-tools__environments" aria-label="Ambientes locais">
            {['node', 'python'].map(name => <div key={name} title={catalog?.runtimes[name]?.executable || catalog?.runtimes[name]?.message || ''}>
              <strong>{name === 'node' ? 'Node.js' : 'Python'}</strong><span>{!catalog ? 'Verificando…' :
                catalog.runtimes[name]?.available ? 'Detectado · ' + catalog.runtimes[name].source : 'Não localizado'}</span>
            </div>)}
          </div>
        </aside>
        <div className="development-tools__workarea">
          <form className="development-tools__config" noValidate onSubmit={launch}>
            <div className="development-tools__target"><NavGlyph name="code" size={18}/><code>{target?.path || 'Selecione um arquivo'}</code></div>
            <div className="development-tools__actions" role="group" aria-label="Ação de desenvolvimento">
              {ACTIONS.map(item => <button key={item.id} type="button" aria-pressed={action === item.id} disabled={blocked}
                onClick={() => { setAction(item.id); setArgumentError(''); }} data-testid={'development-action-' + item.id}>
                <NavGlyph name={item.icon} size={15}/>{item.label}</button>)}
            </div>
            {action === 'run' && <div className="development-tools__arguments">
              <label htmlFor={fieldId + '-args'}>Argumentos <span>opcional</span></label>
              <textarea className="resize-none" ref={argsRef} id={fieldId + '-args'} rows={3} value={argumentsText} disabled={blocked}
                style={{ resize: 'none' }} onChange={event => { setArgumentsText(event.target.value); setArgumentError(''); }}
                aria-invalid={Boolean(argumentError)} aria-describedby={fieldId + '-args-help'} data-testid="development-args"/>
              <p id={fieldId + '-args-help'} className={argumentError ? 'development-tools__error' : ''}>
                {argumentError || 'Um argumento por linha. Espaços na mesma linha pertencem ao mesmo argumento.'}</p>
            </div>}
            <div className="development-tools__run-row">
              <p>{action === 'check' ? 'Analisa a sintaxe sem executar o conteúdo do arquivo.' : action === 'test' ?
                'Usa o test runner do Node.js ou unittest do Python para o arquivo selecionado.' :
                  'Executa a versão salva no disco. A confirmação mostra o arquivo e o ambiente.'}</p>
              <button type="submit" className="button button--solid" disabled={blocked || !target || !runtime?.available}
                data-testid="development-run" aria-busy={acting}>{acting ? 'Aguardando confirmação…' : ACTIONS.find(item => item.id === action).label}</button>
            </div>
            {target && runtime && !runtime.available && <p className="development-tools__error" role="status">{runtime.message}</p>}
          </form>
          <section className="development-tools__console" aria-label="Console de desenvolvimento">
            <header><div><NavGlyph name="terminal" size={15}/><strong>Saída</strong>
              {task && <code className="development-tools__output-source" data-testid="development-output-source"
                title={task.path + ' · ' + ACTIONS.find(item => item.id === task.action)?.label}>
                {task.path} · {ACTIONS.find(item => item.id === task.action)?.label}</code>}</div>
              <span className={'development-tools__status development-tools__status--' + (task?.status || 'idle')}
                aria-live="polite" data-testid="development-status">{STATUS[task?.status] || 'Aguardando'}</span></header>
            <pre ref={logRef} className="development-tools__output" data-testid="development-output" tabIndex={0}
              aria-label="Saída do processo">{task?.output || (running ? 'Processo iniciado. Aguardando saída…' : 'A saída do programa e dos testes aparecerá aqui.')}</pre>
            <div className="development-tools__result"><span>{task?.message || (running ? 'Processo em execução…' : 'Nenhum processo ativo.')}</span>
              {task?.exitCode != null && <code>Exit {task.exitCode}</code>}</div>
            <footer><button type="button" className="button button--outline" disabled={!running} onClick={cancel}
              data-testid="development-cancel"><NavGlyph name="close" size={14}/> Interromper</button>
              <button type="button" className="button button--subtle" disabled={!task?.output} onClick={copyOutput}>Copiar saída</button>
              <label><input type="checkbox" checked={followOutput} onChange={event => setFollowOutput(event.target.checked)}/> Acompanhar saída</label>
            </footer>
          </section>
          <p className="development-tools__scope">Execuções de até 120 s, com saída limitada a 96 KB e mantida nesta sessão. TypeScript e comandos de build continuam em Tarefas npm.</p>
        </div>
      </div>}
  </section>;
}
