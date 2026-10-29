import React, { useMemo, useState } from 'react';
import { NavGlyph } from './NavigationSidebar.jsx';
import './ScheduleCenter.css';

const OPTIONS=[
  [1,'A cada 1 minuto'],[5,'A cada 5 minutos'],[10,'A cada 10 minutos'],
  [15,'A cada 15 minutos'],[30,'A cada 30 minutos'],
  [60,'A cada hora'],[180,'A cada 3 horas'],
  [360,'A cada 6 horas'],[720,'A cada 12 horas'],[1440,'A cada 24 horas']
];
const fmt=value=>{
  if(!value)return '—';
  try {return new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});}
  catch {return '—';}
};
const outcome=state=>{
  if(state==='PASS')return 'Concluída';
  if(state==='FAIL')return 'Falha';
  if(state==='BLOCKED')return 'Bloqueada';
  if(state==='INTERRUPTED')return 'Interrompida';
  if(state==='MISSED')return 'Horário perdido';
  return 'Sem execuções';
};
export default function ScheduleCenter({
  schedules=[],projects=[],activeProjectId=null,workspace='',
  flowDirty=false,busy=false,onCreate,onEnable,onRunNow,onCancel,
  onRebind,onRemove,onRefresh
}) {
  const [label,setLabel]=useState('Inspeção periódica');
  const [minutes,setMinutes]=useState('5');
  const [filter,setFilter]=useState('');
  const visible=useMemo(()=>schedules.filter(job=>{
    const name=projects.find(item=>item.id===job.projectId)?.label||'';
    return (job.label+' '+name).toLocaleLowerCase('pt-BR')
      .includes(filter.trim().toLocaleLowerCase('pt-BR'));
  }),[schedules,projects,filter]);
  const enabled=schedules.filter(item=>item.enabled).length;
  const running=schedules.filter(item=>item.state==='running').length;
  const project=projects.find(item=>item.id===activeProjectId);
  return <section className="schedule-center" data-testid="schedule-center">
    <header className="schedule-hero">
      <div>
        <small className="schedule-eyebrow">AUTOMAÇÃO / OPERAÇÃO LOCAL</small>
        <h1>Agendamentos</h1>
        <p>Execute fluxos salvos em intervalos definidos, somente enquanto o OmniForge estiver aberto. O motor impede execuções paralelas e não repete horários perdidos após reinício ou suspensão do Windows.</p>
      </div>
      <div className="schedule-summary">
        <div><small>CADASTRADOS</small><strong>{schedules.length}</strong></div>
        <div><small>ATIVOS</small><strong>{enabled}</strong></div>
        <div><small>EXECUTANDO</small><strong>{running}</strong></div>
      </div>
    </header>
    <div className="schedule-columns">
      <section className="schedule-create" aria-label="Novo agendamento">
        <div className="schedule-section-heading"><small>CONFIGURAR</small><h2>Novo agendamento</h2></div>
        <p>O agendamento fica inicialmente pausado. Para ativar, será necessária uma confirmação nativa.</p>
        <form onSubmit={event=>{
          event.preventDefault();
          onCreate({label:label.trim(),intervalMinutes:Number(minutes)});
        }} className="schedule-form">
          <label>Projeto vinculado
            <input value={project?.label||'Nenhum projeto aberto'} readOnly aria-label="Projeto do agendamento"/>
          </label>
          <label>Nome do agendamento
            <input aria-label="Nome do agendamento" value={label} maxLength={72}
              onChange={event=>setLabel(event.target.value)}
              placeholder="Ex.: Verificar dados de produção" required />
          </label>
          <label>Frequência
            <select aria-label="Frequência do agendamento" value={minutes}
              onChange={event=>setMinutes(event.target.value)}>
              {OPTIONS.map(([value,desc])=><option value={String(value)} key={value}>{desc}</option>)}
            </select>
          </label>
          <button type="submit" className="button button--solid schedule-create-button"
            disabled={!workspace||!activeProjectId||flowDirty||busy||!label.trim()}>
            <NavGlyph name="check" size={16}/> Criar agendamento
          </button>
        </form>
        {!workspace ? <p className="schedule-info-note">Abra um workspace para criar uma tarefa.</p>
          :flowDirty ? <p className="schedule-info-note">Salve o fluxo no editor de automações antes de criar o agendamento.</p>
          :<p className="schedule-info-note">A ação usará a revisão do arquivo de fluxo salvo, nunca alterações ainda não salvas.</p>}
        <div className="schedule-safety">
          <NavGlyph name="info" size={17}/>
          <div><strong>Execução controlada</strong>
            <p>Nós HTTP e APIs entre projetos não podem ser agendados nesta etapa. Gravações locais e extensões autorizadas podem ter efeitos reais; os resultados são registrados no histórico.</p></div>
        </div>
      </section>
      <section className="schedule-board" aria-label="Agendamentos cadastrados">
        <div className="schedule-board-header">
          <div className="schedule-section-heading"><small>ACOMPANHAMENTO</small><h2>Agendamentos cadastrados</h2></div>
          <div className="schedule-controls">
            <input aria-label="Buscar agendamentos" placeholder="Buscar..."
              value={filter} onChange={event=>setFilter(event.target.value)}/>
            <button className="button button--subtle" type="button" disabled={busy}
              onClick={onRefresh}>Atualizar</button>
          </div>
        </div>
        {!visible.length && <div className="schedule-empty">
          <NavGlyph name="history" size={22}/>
          <strong>{schedules.length?'Nenhum agendamento encontrado.':'Nenhum agendamento cadastrado.'}</strong>
          <p>Os agendamentos criados aparecerão aqui com a próxima execução, status, revisão e histórico.</p>
        </div>}
        <div className="schedule-cards">
          {visible.map(job=>{
            const project=projects.find(x=>x.id===job.projectId);
            const isRunning=job.state==='running';
            return <article className="schedule-card" key={job.id} data-testid="schedule-row">
              <div className="schedule-card-heading">
                <div className="schedule-card-name">
                  <span className="schedule-card-icon"><NavGlyph name="history" size={17}/></span>
                  <div><strong>{job.label}</strong><small title={job.projectId}>{project?.label||'Projeto não encontrado'}</small></div>
                </div>
                <span className={'schedule-pill '+(isRunning?'schedule-pill--run':job.enabled?'schedule-pill--active':'')}>
                  {isRunning?'EXECUTANDO':job.enabled?'ATIVO':'PAUSADO'}
                </span>
              </div>
              <div className="schedule-meta">
                <span><small>INTERVALO</small><strong>{OPTIONS.find(x=>x[0]===job.intervalMinutes)?.[1]||'A cada '+job.intervalMinutes+' min'}</strong></span>
                <span><small>PRÓXIMA EXECUÇÃO</small><strong>{job.enabled?fmt(job.nextRunAt):'—'}</strong></span>
                <span><small>ÚLTIMO RESULTADO</small><strong>{outcome(job.lastOutcome)}</strong></span>
              </div>
              <div className="schedule-meta schedule-meta--secondary">
                <span><small>EXECUÇÕES</small><strong>{job.runs}</strong></span>
                <span><small>HORÁRIOS PERDIDOS</small><strong>{job.misses}</strong></span>
                <span><small>ÚLTIMA TENTATIVA</small><strong>{fmt(job.lastStartedAt)}</strong></span>
              </div>
              {job.lastMessage && <p className="schedule-last-message">{job.lastMessage}</p>}
              <div className="schedule-card-actions">
                <button className="button button--subtle" type="button"
                  disabled={busy||(!job.enabled&&isRunning)}
                  onClick={()=>onEnable(job.id,!job.enabled)}>
                  {job.enabled?'Pausar':'Ativar'}
                </button>
                <button className="button button--solid" type="button"
                  disabled={busy||!job.enabled||isRunning}
                  onClick={()=>onRunNow(job.id)}>Executar agora</button>
                {isRunning && <button className="button button--stop" type="button"
                  disabled={busy} onClick={()=>onCancel(job.id)}>Cancelar execução</button>}
                <button className="button button--subtle" type="button"
                  disabled={busy||job.enabled||isRunning}
                  onClick={()=>onRebind(job.id)}>Aprovar revisão</button>
                <button className="schedule-delete" type="button"
                  disabled={busy||isRunning} onClick={()=>onRemove(job.id)}
                  aria-label={'Excluir agendamento '+job.label}>Excluir</button>
              </div>
            </article>;
          })}
        </div>
      </section>
    </div>
    <footer className="schedule-footer">
      <NavGlyph name="info" size={17}/>
      <div><strong>Persistência e limites</strong> O agendamento continua cadastrado após fechar o aplicativo, mas somente é executado com o OmniForge aberto. A máquina suspensa ou desligada não executa fluxos. Após falha, mudança do arquivo ou três erros consecutivos, a tarefa precisa de revisão.</div>
    </footer>
  </section>;
}
