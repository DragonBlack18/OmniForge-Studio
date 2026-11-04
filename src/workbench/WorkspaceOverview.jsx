import React from 'react';
import { NAV_GROUPS } from './module-registry.mjs';
import { NavGlyph } from '../shared/NavGlyph.jsx';
import './WorkspaceOverview.css';

/**
 * Workbench start surface, not a KPI dashboard. Tool routes are read from the
 * same canonical registry as the sidebar and command palette.
 */
export default function WorkspaceOverview({
  workspace, projects=[], version, onNavigate, onOpenProject,
  flowDirty=false, cadDirty=false, lastRun=null
}) {
  const projectName = workspace?.split(/[\\/]/).pop();
  const pending = flowDirty || cadDirty;
  return <div className="start-workbench" data-testid="workspace-overview">
    <div className="start-workbench__main">
      <header className="start-workbench__intro">
        <span className="start-workbench__eyebrow"><NavGlyph name="terminal" size={15}/> OMNIFORGE / WORKBENCH</span>
        <h1>Ferramentas de engenharia em um ambiente local.</h1>
        <p>Selecione o domínio e abra a ferramenta necessária. Código, fluxos e desenho técnico permanecem independentes, compartilhando apenas o projeto ativo e as capacidades autorizadas.</p>
        <div className="start-workbench__actions">
          <button type="button" onClick={onOpenProject} className="start-workbench__open">
            <NavGlyph name="folder" size={17}/>{workspace?'Trocar pasta de trabalho':'Selecionar pasta local'}
          </button>
          <button type="button" disabled={!workspace} onClick={()=>onNavigate('code')}>
            <NavGlyph name="code" size={16}/>Abrir editor
          </button>
          <button type="button" disabled={!workspace} onClick={()=>onNavigate('canvas')}>
            <NavGlyph name="workflow" size={16}/>Abrir automações
          </button>
        </div>
      </header>
      <section className="start-workbench__domains" aria-label="Ferramentas por domínio">
        <div className="start-workbench__section-heading"><span>ESTRUTURA DE FERRAMENTAS</span><small>Domínio / Ferramenta / Operação</small></div>
        {NAV_GROUPS.map((group,index)=><div key={group.id} className="start-workbench__domain">
          <div className="start-workbench__domain-heading">
            <span className="start-workbench__ordinal">{String(index+1).padStart(2,'0')}</span>
            <span className="start-workbench__icon"><NavGlyph name={group.icon} size={19}/></span>
            <div><strong>{group.title}</strong><small>{group.description}</small></div>
            <span className="start-workbench__count">{group.items.length} ferramentas</span>
          </div>
          <div className="start-workbench__tools">
            {group.items.map(item=><button key={item.mode} type="button"
              onClick={()=>onNavigate(item.mode)}
              disabled={item.mode==='history'&&!workspace} title={item.aria}>
              <NavGlyph name={item.icon} size={16}/><span>{item.label}</span><NavGlyph name="arrow" size={13}/>
            </button>)}
          </div>
        </div>)}
      </section>
    </div>
    <aside className="start-workbench__session" aria-label="Sessão de trabalho">
      <div className="start-workbench__session-heading"><NavGlyph name="panel" size={16}/> CONTEXTO ATIVO</div>
      <div className="start-workbench__session-item"><small>PROJETO</small><strong>{projectName||'Nenhuma pasta ativa'}</strong>
        <code title={workspace}>{workspace||'Abra uma pasta local para iniciar'}</code></div>
      <div className="start-workbench__session-item"><small>ESTADO DOS DOCUMENTOS</small>
        <strong className={pending?'start-workbench__pending':''}>{pending?'Edições pendentes':'Nenhuma edição pendente'}</strong>
        <p>O salvamento é explícito e mantém as revisões originais.</p></div>
      <div className="start-workbench__session-item"><small>ÚLTIMA EXECUÇÃO NESTA SESSÃO</small>
        <strong>{lastRun?(lastRun.ok?'Concluída':'Falha'):'Nenhuma'}</strong>
        <p>Históricos persistentes disponíveis no módulo de observabilidade.</p></div>
      <div className="start-workbench__session-item"><small>CATÁLOGO LOCAL</small>
        <strong>{projects.length} projeto(s) cadastrado(s)</strong>
        <p>Sem cópia de arquivos de origem e sem sincronização externa automática.</p></div>
      <div className="start-workbench__shortcuts">
        <strong>ATALHOS DO AMBIENTE</strong>
        <div><kbd>Ctrl Shift P</kbd><span>Comandos</span></div>
        <div><kbd>Ctrl P</kbd><span>Abrir arquivo</span></div>
        <div><kbd>Ctrl B</kbd><span>Barra lateral</span></div>
      </div>
      <div className="start-workbench__foot">OMNIFORGE STUDIO v{version}<span>ESTAÇÃO LOCAL / EXPERIMENTAL</span></div>
    </aside>
  </div>;
}
