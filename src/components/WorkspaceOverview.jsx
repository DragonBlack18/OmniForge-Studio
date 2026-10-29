import React from 'react';
import { NODE_CATALOG } from '../../core/catalog.mjs';
import { NavGlyph } from './NavigationSidebar.jsx';
import './WorkspaceOverview.css';

const MODULES=[
  {mode:'canvas',icon:'workflow',category:'AUTOMAÇÃO',title:'Editor de fluxos',
   description:'Monte blocos, valide conexões e execute com histórico e cancelamento.',action:'Abrir editor'},
  {mode:'cad',icon:'cad',category:'ENGENHARIA',title:'CAD Sketch 2D',
   description:'Desenho em milímetros com camadas, snap e exportação DXF ou SVG.',action:'Abrir CAD'},
  {mode:'code',icon:'code',category:'DESENVOLVIMENTO',title:'Editor de código',
   description:'Abra e edite arquivos existentes sem sair do workspace local.',action:'Abrir editor'},
  {mode:'projects',icon:'folder',category:'ORGANIZAÇÃO',title:'Meus projetos',
   description:'Gerencie pastas cadastradas sem duplicar nem alterar sua origem.',action:'Ver projetos'},
  {mode:'integrations',icon:'plug',category:'INTEGRAÇÕES',title:'APIs de projetos',
   description:'Conecte serviços em loopback usando contratos explícitos e autorização.',action:'Ver conexões'},
  {mode:'extensions',icon:'layers',category:'PLATAFORMA',title:'Extensões locais',
   description:'Instale ações reais, autorize por workspace e execute no motor supervisionado.',action:'Gerenciar extensões'},
  {mode:'schedules',icon:'calendar',category:'OPERAÇÃO',title:'Agendamentos',
   description:'Programe fluxos locais salvos, pause, revalide e acompanhe execuções sem duplicar disparos.',action:'Gerenciar agendas'},
  {mode:'history',icon:'history',category:'DIAGNÓSTICO',title:'Execuções',
   description:'Inspecione duração, etapas, falhas e artefatos registrados.',action:'Ver histórico'}
];

export default function WorkspaceOverview({
  workspace, projects=[], version, onNavigate, onOpenProject,
  flowDirty=false, cadDirty=false, lastRun=null
}) {
  const projectName=workspace?.split(/[\\/]/).pop();
  const unsaved=flowDirty||cadDirty;
  const runSummary=lastRun ? (lastRun.ok?'Última execução aprovada':'Última execução com falha') : 'Nenhuma execução nesta sessão';
  return <div className="overview-page" data-testid="workspace-overview">
    <header className="overview-header">
      <div className="overview-heading">
        <span className="overview-eyebrow">OMNIFORGE / VISÃO GERAL</span>
        <h1>{projectName ? <>Seu workspace: <em title={workspace}>{projectName}</em></> : 'Um ambiente. Múltiplas ferramentas.'}</h1>
        <p>{projectName
          ? 'Continue no editor, no CAD ou nas automações. Os arquivos permanecem no seu projeto.'
          : 'Selecione uma pasta para começar a trabalhar com código, automação e desenho técnico local.'}</p>
        <div className="overview-actions">
          <button className="overview-main-action" type="button" onClick={onOpenProject}>
            <NavGlyph name="folder" size={17}/>{projectName?'Trocar workspace':'Selecionar pasta local'}
            <NavGlyph name="arrow" size={16}/>
          </button>
          <button className="overview-secondary-action" type="button" onClick={()=>onNavigate('canvas')} disabled={!workspace}>
            <NavGlyph name="workflow" size={16}/>Continuar no fluxo
          </button>
        </div>
      </div>
      <div className="overview-structure" aria-label="Módulos do OmniForge">
        <div className="overview-structure-title"><span>ESTRUTURA DO AMBIENTE</span><span>LOCAL / v{version}</span></div>
        <div className="overview-structure-root"><span className="overview-structure-mark">OF</span><strong>OmniForge</strong><small>Workspace</small></div>
        <div className="overview-structure-links" aria-hidden="true"><span/><span/><span/></div>
        <div className="overview-structure-children">
          <div><NavGlyph name="code" size={17}/><strong>CÓDIGO</strong><small>Monaco</small></div>
          <div><NavGlyph name="workflow" size={17}/><strong>FLUXOS</strong><small>{Object.keys(NODE_CATALOG).length} nós</small></div>
          <div><NavGlyph name="cad" size={17}/><strong>CAD</strong><small>2D / mm</small></div>
        </div>
      </div>
    </header>
    <div className="overview-metrics" aria-label="Resumo do ambiente">
      <div><small>WORKSPACE</small><strong>{projectName||'Não selecionado'}</strong><span>{projectName?'Pasta local ativa':'Aguardando seleção'}</span></div>
      <div><small>PROJETOS</small><strong>{projects.length}</strong><span>Registrados no catálogo</span></div>
      <div><small>DOCUMENTOS</small><strong>{projectName?(unsaved?'Não salvos':'Sem edições pendentes'):'—'}</strong><span>Fluxo e desenho desta sessão</span></div>
      <div><small>ÚLTIMA EXECUÇÃO</small><strong>{lastRun?(lastRun.ok?'Concluída':'Falhou'):'—'}</strong><span>{runSummary}</span></div>
    </div>
    <section className="overview-tools">
      <div className="overview-section-header">
        <div><span>FERRAMENTAS DISPONÍVEIS</span><h2>Áreas de trabalho</h2></div>
        <small>Somente módulos implementados · {MODULES.length} opções</small>
      </div>
      <div className="overview-modules">
        {MODULES.map((module,index)=><button key={module.mode} type="button" className="overview-module"
          onClick={()=>onNavigate(module.mode)} disabled={!workspace && module.mode==='history'}>
          <div className="overview-module-head">
            <span className="overview-module-icon"><NavGlyph name={module.icon} size={19}/></span>
            <span className="overview-module-index">{String(index+1).padStart(2,'0')}</span>
          </div>
          <span className="overview-module-category">{module.category}</span>
          <strong>{module.title}</strong>
          <p>{module.description}</p>
          <span className="overview-module-open">{module.action}<NavGlyph name="arrow" size={14}/></span>
        </button>)}
      </div>
    </section>
    <footer className="overview-footer">
      <div><NavGlyph name="info" size={17}/>
        <p><strong>O que ainda está em desenvolvimento?</strong> Plugins com código arbitrário, IDE Theia/Open VSX, IA/agents, CAD 3D paramétrico e protocolos industriais ainda não estão disponíveis.</p></div>
      <span>OmniForge Studio · v{version} · Execução local</span>
    </footer>
  </div>;
}
