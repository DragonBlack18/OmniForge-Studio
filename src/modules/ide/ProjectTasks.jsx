import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavGlyph } from '../../shared/NavGlyph.jsx';
import './ProjectTasks.css';

const FINAL = new Set(['completed','failed','cancelled','timeout','output-limit']);
const CLIP = 48000;

export default function ProjectTasks({ workspace, busy = false, onNotice = () => {} }) {
  const [catalog, setCatalog] = useState(null);
  const [selected, setSelected] = useState('');
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');
  const logRef = useRef(null);
  const generation = useRef(0);

  useEffect(() => {
    const token = ++generation.current;
    setCatalog(null); setSelected(''); setTask(null); setError('');
    if (!workspace || !window.omni) return;
    setLoading(true);
    window.omni.listProjectTasks().then(data => {
      if(generation.current !== token)return;
      setCatalog(data);
      setSelected(data.scripts?.[0]?.id || '');
    }).catch(err => {if(generation.current===token)setError(err.message);})
      .finally(()=>{if(generation.current===token)setLoading(false);});
    window.omni.projectTaskState().then(data=>{
      if(generation.current===token && data?.workspace===workspace) setTask(data);
    }).catch(()=>{});
    const dispose=window.omni.onProjectTaskEvent(event=>{
      if (generation.current !== token || !event?.task || event.task.workspace !== workspace) return;
      setTask(previous=>{
        if(event.type === 'output' && previous?.id === event.id) return {
          ...previous,...event.task,
          output:((previous.output||'') + (event.chunk||'')).slice(-CLIP)
        };
        return {...event.task,output:event.task.output ?? (previous?.id===event.id?previous.output:'')};
      });
      if(event.type==='finished')onNotice(
        event.task.status==='completed'
          ?'Tarefa concluída: '+event.task.name
          :'Tarefa encerrada: '+event.task.status);
    });
    return ()=>{ generation.current++; dispose?.(); };
  },[workspace,onNotice]);

  useEffect(()=>{
    if(logRef.current) logRef.current.scrollTop=logRef.current.scrollHeight;
  },[task?.output,task?.status]);

  const running=task?.status==='running';
  const selectedScript=useMemo(()=>
    catalog?.scripts?.find(script=>script.id===selected),[catalog,selected]);
  const disabled=busy || loading || acting;

  async function refresh() {
    if(!workspace || disabled)return;
    setLoading(true);setError('');
    try {
      const data=await window.omni.listProjectTasks();
      setCatalog(data);
      if(!data.scripts.some(script=>script.id===selected)) setSelected(data.scripts[0]?.id||'');
    }catch(err){setError(err.message);}
    finally{setLoading(false);}
  }
  async function launch() {
    if(disabled || running || !selectedScript)return;
    setActing(true);setError('');
    try {
      const started=await window.omni.runProjectTask(selectedScript.id,catalog.revision);
      if(started)setTask(started);
      else onNotice('Execução cancelada. Nenhum processo foi iniciado.');
    }catch(err){setError(err.message);}
    finally{setActing(false);}
  }
  async function cancel() {
    if(!task?.id || !running)return;
    setError('');
    try {
      const ok=await window.omni.cancelProjectTask(task.id);
      if(ok)onNotice('Cancelamento enviado ao processo e aos subprocessos.');
    }catch(err){setError(err.message);}
  }

  return <div className="task-center" data-testid="project-task-center">
    <header className="task-center__hero">
      <div>
        <span className="task-center__eyebrow">DESENVOLVIMENTO / RUNNER LOCAL</span>
        <h2>Central de Tarefas</h2>
        <p>Execute scripts reais do projeto, acompanhe stdout e stderr em tempo real e interrompa processos. Sem terminal arbitrário e sem dados simulados.</p>
      </div>
      <button className="button button--outline" type="button" disabled={disabled || running || !workspace}
        onClick={refresh}><NavGlyph name="history" size={15}/> Atualizar scripts</button>
    </header>
    {!workspace && <div className="task-center__empty">Abra um workspace com package.json para acessar os scripts do projeto.</div>}
    {loading && <p className="task-center__hint" role="status">Inspecionando o package.json local...</p>}
    {error && <div className="task-center__error" role="alert">{error}</div>}
    {workspace && catalog && <>
      <section className="task-center__metrics">
        <div><small>PROJETO</small><strong title={workspace}>{catalog.packageName||'Workspace local'}</strong></div>
        <div><small>SCRIPTS DISPONÍVEIS</small><strong>{catalog.scripts?.length||0}</strong></div>
        <div><small>AMBIENTE NODE</small><strong>{catalog.toolchain?.available?'DISPONÍVEL':'NÃO LOCALIZADO'}</strong></div>
        <div><small>ÚLTIMA EXECUÇÃO</small><strong>{task?.status?.toUpperCase()||'—'}</strong></div>
      </section>
      {!catalog.available && <div className="task-center__empty">{catalog.reason}</div>}
      {catalog.available && <>
        {!catalog.toolchain?.available && <div className="task-center__error" role="status">
          {catalog.toolchain?.message||'Node.js e npm não encontrados.'} Instale Node.js LTS e reinicie o aplicativo.
        </div>}
        <div className="task-center__layout">
          <section className="task-center__scripts">
            <div className="task-center__section-title"><h3>Scripts do projeto</h3><small>package.json</small></div>
            {!catalog.scripts.length && <div className="task-center__empty task-center__empty--inside">
              Nenhum script compatível encontrado neste projeto.
            </div>}
            {catalog.scripts.map(script=>
              <button key={script.id} type="button" className={'task-center__script '+(selected===script.id?'task-center__script--selected':'')}
                aria-label={'Selecionar tarefa '+script.id}
                disabled={disabled || running} onClick={()=>setSelected(script.id)}>
                <span className="task-center__script-main">
                  <NavGlyph name="code" size={15}/><strong>{script.id}</strong>
                  {selected===script.id && <span>SELECIONADO</span>}
                </span>
                <code>{script.command}</code>
              </button>)}
            <div className="task-center__actions">
              <button type="button" className="button button--solid" data-testid="project-task-run"
                disabled={disabled || running || !selectedScript || !catalog.toolchain?.available}
                onClick={launch}><NavGlyph name="workflow" size={15}/> Executar selecionado</button>
              <p>O OmniForge pedirá confirmação nativa antes de executar qualquer script. A execução pode modificar arquivos e acessar a rede conforme o código do projeto.</p>
            </div>
          </section>
          <section className="task-center__console">
            <div className="task-center__section-title">
              <h3>Console de execução</h3>
              <span className={'task-center__state task-center__state--'+(task?.status||'idle')}>
                {task?.status?.toUpperCase()||'AGUARDANDO'}
              </span>
            </div>
            <div className="task-center__console-meta">
              <span>{task?'npm run '+task.name:'Nenhuma tarefa iniciada nesta sessão'}</span>
              {task?.startedAt && <time>{new Date(task.startedAt).toLocaleString('pt-BR')}</time>}
            </div>
            <pre ref={logRef} className="task-center__output" data-testid="project-task-output"
              aria-label="Saída da tarefa">{task?.output||'Selecione um script para executar. A saída real aparecerá aqui.'}</pre>
            {task && <div className="task-center__console-foot">
              <span>{task.message|| (running?'Processo executando...':'Resultado disponível.')}</span>
              {task.exitCode !== null && <code>EXIT {task.exitCode}</code>}
              {task.truncated && <strong>SAÍDA LIMITADA</strong>}
            </div>}
            <div className="task-center__console-actions">
              <button type="button" data-testid="project-task-cancel"
                disabled={!running} className="button button--outline" onClick={cancel}>
                <NavGlyph name="close" size={15}/> Interromper tarefa
              </button>
              <button type="button" className="button button--subtle"
                disabled={!task?.output} onClick={()=>navigator.clipboard?.writeText(task.output).catch(()=>{})}>
                Copiar saída
              </button>
            </div>
          </section>
        </div>
      </>}
    </>}
    <footer className="task-center__footer">
      <NavGlyph name="info" size={16}/>
      <p>Somente scripts previamente definidos no package.json, sem argumentos livres. Tempo máximo: 120 s. Limite de saída: 96 KB. Apenas uma tarefa por vez; scripts de projetos desconhecidos são potencialmente perigosos. Não há sandbox, PTY, execução em segundo plano ou persistência de logs desta ferramenta.</p>
    </footer>
  </div>;
}
