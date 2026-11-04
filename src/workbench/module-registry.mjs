// Public navigation contract: workbench owns routing; tools only export views.
export const NAV_GROUPS = [
  { id:'environment', title: 'AMBIENTE', icon:'home', description:'Projetos e sessão', items: [
    { mode:'home', label:'Visão geral', aria:'Visão geral', icon:'home' },
    { mode:'projects', label:'Projetos', aria:'Catálogo de projetos', icon:'folder' }
  ]},
  { id:'development', title: 'DESENVOLVIMENTO', icon:'code', description:'Código, Git e tarefas', items: [
    { mode:'code', label:'Editor de código', aria:'Editor de código', icon:'code' },
    { mode:'search', label:'Buscar em arquivos', aria:'Buscar no projeto', icon:'search' },
    { mode:'git', label:'Controle Git', aria:'Controle de versão Git', icon:'git' },
    { mode:'tasks', label:'Central de Tarefas', aria:'Central de Tarefas', icon:'terminal' }
  ]},
  { id:'automation', title: 'AUTOMAÇÃO', icon:'workflow', description:'Fluxos e extensões', items: [
    { mode:'canvas', label:'Automações', aria:'Arquitetura visual', icon:'workflow' },
    { mode:'templates', label:'Modelos de fluxo', aria:'Modelos de fluxo', icon:'templates' },
    { mode:'integrations', label:'Integrações', aria:'Conectores de projetos', icon:'plug' },
    { mode:'extensions', label:'Extensões', aria:'Central de extensões', icon:'layers' },
    { mode:'schedules', label:'Agendamentos', aria:'Central de agendamentos', icon:'calendar' }
  ]},
  { id:'engineering', title: 'ENGENHARIA', icon:'cad', description:'Desenho técnico', items: [
    { mode:'cad', label:'CAD Sketch 2D', aria:'CAD Sketch 2D', icon:'cad' }
  ]},
  { id:'observability', title: 'OBSERVABILIDADE', icon:'history', description:'Execução e diagnóstico', items: [
    { mode:'history', label:'Histórico', aria:'Histórico de execuções', icon:'history' }
  ]}
];
export const NAV_DOMAINS = Object.freeze([
  { id:'all', title:'TODAS', icon:'layers', description:'Todas as ferramentas' },
  ...NAV_GROUPS.map(({id,title,icon,description})=>({id,title,icon,description}))
]);
export const getModuleDomain = mode =>
  NAV_GROUPS.find(group => group.items.some(item => item.mode === mode))?.id || 'environment';

export const findWorkbenchModule = mode =>
  NAV_GROUPS.flatMap(group => group.items.map(item => ({...item, group:group.title})))
    .find(item => item.mode === mode) || {
      mode:'about',label:'Sobre o OmniForge',aria:'Sobre o projeto',icon:'info',group:'AMBIENTE'
    };
