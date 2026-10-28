import React from 'react';
import './WorkspaceOverview.css';

const active=[
  {mode:'canvas',icon:'⌘',title:'Automações',text:'Monte e execute fluxos reais com validação de portas e histórico.',tag:'CORE ATIVO'},
  {mode:'code',icon:'{ }',title:'Editor de código',text:'Explore e edite arquivos existentes do workspace com Monaco.',tag:'EDIÇÃO LOCAL'},
  {mode:'cad',icon:'▱',title:'CAD Sketch 2D',text:'Crie desenhos em milímetros e exporte SVG ou DXF R12.',tag:'ENGENHARIA'},
  {mode:'projects',icon:'▤',title:'Meus projetos',text:'Registre projetos existentes sem copiar ou excluir suas pastas.',tag:'WORKSPACES'},
  {mode:'integrations',icon:'⇄',title:'Integrações locais',text:'Conecte APIs em 127.0.0.1 com contratos e autorização.',tag:'APIS CONTROLADAS'},
  {mode:'history',icon:'◷',title:'Observabilidade',text:'Verifique falhas, duração e resultados dos fluxos executados.',tag:'AUDITORIA'}
];
const planned=[
  ['IDE e extensões','Eclipse Theia / Open VSX'],
  ['CAD paramétrico 3D','JSCAD / OCCT / Bitbybit'],
  ['IA e agentes','Provedores sob permissões'],
  ['Industrial e robótica','Protocolos e laboratório read-only']
];

export default function WorkspaceOverview({workspace,projects,version,onNavigate,onOpenProject}) {
  const shortName=workspace?.split(/[\\/]/).pop();
  return <div className="overview-page">
    <div className="overview-hero">
      <div className="overview-hero-top"><span className="overview-eyebrow">OMNIFORGE / ENGINEERING WORKSPACE</span><span className="overview-version">v{version} · PRÉ-LANÇAMENTO</span></div>
      <div className="overview-hero-content"><div><h1>Um espaço para construir<br/><em>o que vem depois.</em></h1><p>Desenvolvimento, automações e engenharia no mesmo ambiente local. Cada módulo é independente e possui seu próprio contrato.</p>
        <div className="overview-hero-actions"><button className="overview-main-action" onClick={onOpenProject}>{workspace?'Trocar workspace':'Abrir meu primeiro projeto'} <span>↗</span></button><button className="overview-secondary-action" onClick={()=>onNavigate('cad')}>Abrir CAD Sketch 2D</button></div>
      </div><div className="overview-hero-visual" aria-hidden="true"><div className="overview-diagram-circle overview-diagram-circle--outer"/><div className="overview-diagram-circle overview-diagram-circle--inner"/><div className="overview-diagram-core">OF</div><span className="overview-diagram-tag tag-a">CODE</span><span className="overview-diagram-tag tag-b">FLOW</span><span className="overview-diagram-tag tag-c">CAD</span></div></div>
    </div>
    <div className="overview-metrics"><div><span>WORKSPACE ATUAL</span><strong>{shortName||'Não selecionado'}</strong></div><div><span>PROJETOS CADASTRADOS</span><strong>{projects.length}</strong></div><div><span>MÓDULOS ATIVOS</span><strong>{active.length}</strong></div><div><span>OPERAÇÃO</span><strong>LOCAL · WINDOWS</strong></div></div>
    <div className="overview-section-header"><div><span>FERRAMENTAS DISPONÍVEIS</span><h2>Escolha sua área de trabalho</h2></div><small>Aplicações reais, não demonstrações</small></div>
    <div className="overview-modules">{active.map(m=><button key={m.mode} type="button" className="overview-module" onClick={()=>onNavigate(m.mode)}><div className="overview-module-head"><span className="overview-module-icon">{m.icon}</span><span className="overview-module-tag">{m.tag}</span></div><strong>{m.title}</strong><p>{m.text}</p><span className="overview-module-open">Abrir módulo ↗</span></button>)}</div>
    <div className="overview-section-header"><div><span>ARQUITETURA FUTURA</span><h2>Integrações em planejamento</h2></div><small>Não apresentadas como funcionalidades prontas</small></div>
    <div className="overview-planned">{planned.map(([name,detail])=><div key={name}><span>{name}</span><small>{detail}</small><b>PLANEJADO</b></div>)}</div>
    <footer className="overview-legal">Desenvolvido por Davi Brand · OmniForge Studio · O ambiente de engenharia industrial ainda não controla equipamentos reais.</footer>
  </div>;
}
