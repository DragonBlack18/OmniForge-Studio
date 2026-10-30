// Public navigation contract: workbench owns routing; tools only export views.
export const NAV_GROUPS = [
  { title: 'AMBIENTE', items: [
    { mode:'home', label:'Visão geral', aria:'Visão geral', icon:'home' },
    { mode:'projects', label:'Projetos', aria:'Catálogo de projetos', icon:'folder' }
  ]},
  { title: 'DESENVOLVIMENTO', items: [
    { mode:'code', label:'Editor de código', aria:'Editor de código', icon:'code' },
    { mode:'search', label:'Buscar em arquivos', aria:'Buscar no projeto', icon:'search' },
    { mode:'git', label:'Controle Git', aria:'Controle de versão Git', icon:'git' }
  ]},
  { title: 'AUTOMAÇÃO', items: [
    { mode:'canvas', label:'Automações', aria:'Arquitetura visual', icon:'workflow' },
    { mode:'templates', label:'Modelos de fluxo', aria:'Modelos de fluxo', icon:'templates' },
    { mode:'integrations', label:'Integrações', aria:'Conectores de projetos', icon:'plug' },
    { mode:'extensions', label:'Extensões', aria:'Central de extensões', icon:'layers' },
    { mode:'schedules', label:'Agendamentos', aria:'Central de agendamentos', icon:'calendar' }
  ]},
  { title: 'ENGENHARIA', items: [
    { mode:'cad', label:'CAD Sketch 2D', aria:'CAD Sketch 2D', icon:'cad' }
  ]},
  { title: 'OBSERVABILIDADE', items: [
    { mode:'history', label:'Histórico', aria:'Histórico de execuções', icon:'history' }
  ]}
];
export const findWorkbenchModule = mode =>
  NAV_GROUPS.flatMap(group => group.items.map(item => ({...item, group:group.title})))
    .find(item => item.mode === mode) || {
      mode:'about',label:'Sobre o OmniForge',aria:'Sobre o projeto',icon:'info',group:'AMBIENTE'
    };
