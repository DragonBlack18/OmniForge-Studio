import { createNode, exampleFlow } from './catalog.mjs';
import { validateFlow } from './graph.mjs';

function makeTemplate(id,label,description,types,payload,configs={}) {
  const nodes=types.map((type,i)=>{
    const node=createNode(type,`etapa${i+1}`,{x:70+i*260,y:175});
    if(i===0)node.config.payload=JSON.stringify(payload);
    Object.assign(node.config,configs[i]||{});
    return node;
  });
  const edges=nodes.slice(1).map((node,i)=>({id:`edge${i+1}`,source:nodes[i].id,target:node.id,sourceHandle:'out',targetHandle:'in'}));
  return {id,label,description,flow:{schemaVersion:1,name:label,nodes,edges}};
}
const simple=exampleFlow();
const branch=(()=>{
  const start=createNode('trigger.manual','start',{x:50,y:160});start.config.payload='{"pedido":{"total":1500}}';
  const decision=createNode('logic.if','if',{x:320,y:160});Object.assign(decision.config,{path:'pedido.total',operator:'gte',value:'1000'});
  const yes=createNode('io.writeJson','approved',{x:600,y:40});yes.config.fileName='valor-alto.json';
  const no=createNode('io.writeJson','review',{x:600,y:280});no.config.fileName='valor-normal.json';
  return {id:'pedido-ramificado',label:'Pedido com decisão',description:'Gatilho → Se/Senão → grava apenas o ramo escolhido.',flow:{schemaVersion:1,name:'Pedido com decisão',nodes:[start,decision,yes,no],edges:[
    {id:'e1',source:'start',sourceHandle:'out',target:'if',targetHandle:'in'},
    {id:'e2',source:'if',sourceHandle:'yes',target:'approved',targetHandle:'in'},
    {id:'e3',source:'if',sourceHandle:'no',target:'review',targetHandle:'in'}
  ]}};
})();
const templates=[
  {id:'venda-json',label:'Venda em JSON',description:'Exemplo de registro local sem chamadas externas.',flow:simple},
  branch,
  makeTemplate('filtrar-lista','Filtrar e extrair','Gatilho → campo de array → filtro → extrair campo → JSON.',
    ['trigger.manual','logic.pick','data.filter','data.pluck','io.writeJson'],
    {itens:[{nome:'Produto A',ativo:true},{nome:'Produto B',ativo:false}]},
    {1:{path:'itens'},2:{path:'ativo',operator:'eq',value:'true'},3:{path:'nome'},4:{fileName:'produtos-ativos.json'}}),
  makeTemplate('media-numerica','Calcular média','Gatilho → média numérica → gravar resultado.',
    ['trigger.manual','math.average','io.writeJson'],[10,20,30],{2:{fileName:'media.json'}}),
  makeTemplate('relatorio-cad','Relatório do CAD 2D','Lê as métricas de um desenho CAD já salvo em .omniforge/cad e grava um relatório JSON real.',
    ['trigger.manual','cad.sketchReport','io.writeJson'],
    {origem:'CAD Sketch'}, {2:{fileName:'relatorio-cad.json'}}),
  makeTemplate('normalizar-texto','Normalizar texto','Gatilho → remover espaços → caixa alta → salvar.',
    ['trigger.manual','text.trim','text.upper','io.writeJson'],'   OmniForge Studio   ',{3:{fileName:'texto.json'}})
];
for(const template of templates){
  const validation=validateFlow(template.flow);
  if(!validation.valid)throw new Error(`Modelo embutido inválido ${template.id}: ${validation.errors.join(';')}`);
}
export const WORKFLOW_TEMPLATES=Object.freeze(templates);
export function findTemplate(id){return WORKFLOW_TEMPLATES.find(t=>t.id===id);}
