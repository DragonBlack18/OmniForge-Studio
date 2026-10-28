import { PURE_CATALOG } from './pure-nodes.mjs';
/**
 * Node definitions are stable contracts. The canvas renders these schemas;
 * the engine alone defines what happens at execution time.
 */
export const CATALOG_SCHEMA_VERSION = 1;

export const NODE_CATALOG = Object.freeze(Object.assign(Object.create(null), {
  'trigger.manual': {
    category: 'Gatilhos', label: 'Início manual', description: 'Inicia o fluxo usando um JSON informado no nó.',
    inputs: [], outputs: [{ id: 'out', type: 'json' }],
    fields: [{ key: 'payload', label: 'JSON de entrada', kind: 'json', default: '{"venda":{"id":1001,"total":299.90,"cliente":"Exemplo"}}' }]
  },
  'logic.pick': {
    category: 'Lógica', label: 'Selecionar campo', description: 'Lê um caminho de um objeto JSON, sem executar código arbitrário.',
    inputs: [{ id: 'in', type: 'json', required: true }], outputs: [{ id: 'out', type: 'json' }],
    fields: [{ key: 'path', label: 'Caminho do campo', kind: 'text', default: 'venda' }]
  },
  'http.localJson': {
    category: 'Integrações', label: 'HTTP local JSON',
    description: 'Consulta uma API em 127.0.0.1. GET ou POST JSON; exige autorização para executar. No modo simulação nenhuma requisição é enviada.',
    inputs: [{ id: 'in', type: 'json', required: true }], outputs: [{ id: 'out', type: 'json' }],
    fields: [
      { key: 'url', label: 'URL da API local', kind: 'text', default: 'http://127.0.0.1:8000/api/teste' },
      { key: 'method', label: 'Método', kind: 'select', options: ['GET', 'POST'], default: 'POST' },
      { key: 'timeoutMs', label: 'Tempo limite (ms)', kind: 'text', default: '3000' }
    ]
  },
  'project.callLocalApi': {
    category: 'Projetos', label: 'Chamar projeto por API',
    description: 'Invoca uma capacidade local cadastrada em outro projeto. Confirma antes de enviar e valida contratos JSON.',
    inputs: [{ id: 'in', type: 'json', required: true }], outputs: [{ id: 'out', type: 'json' }],
    fields: [
      { key: 'projectId', label: 'Projeto de destino', kind: 'project', default: '' },
      { key: 'capabilityId', label: 'Capacidade', kind: 'capability', default: '' }
    ]
  },
  'cad.sketchReport': {
    category: 'Engenharia', label: 'Ler métricas CAD',
    description: 'Lê o desenho CAD salvo no workspace e devolve medições reais em milímetros. Não utiliza alterações não salvas.',
    inputs: [{ id: 'in', type: 'json', required: true }], outputs: [{ id: 'out', type: 'json' }], fields: []
  },
  'cad.exportDrawing': {
    category: 'Engenharia', label: 'Exportar desenho CAD',
    description: 'Exporta o CAD salvo para DXF R12 ou SVG em .omniforge/output. Simulação não grava arquivo.',
    inputs: [{ id: 'in', type: 'json', required: true }], outputs: [{ id: 'out', type: 'json' }],
    fields: [{ key: 'format', label: 'Formato CAD', kind: 'select', options: ['dxf', 'svg'], default: 'dxf' }]
  },
  'io.readJson': {
    category: 'Arquivos', label: 'Ler JSON gerado', description: 'Lê um arquivo JSON existente somente da pasta .omniforge/output deste projeto, bloqueando links simbólicos.',
    inputs: [{ id:'in',type:'json',required:true }], outputs:[{ id:'out',type:'json' }],
    fields:[{ key:'fileName',label:'Arquivo de saída (.json)',kind:'text',default:'venda.json' }]
  },
  'io.writeJson': {
    category: 'Arquivos', label: 'Gravar JSON', description: 'Grava o resultado em .omniforge/output dentro do projeto aberto.',
    inputs: [{ id: 'in', type: 'json', required: true }], outputs: [{ id: 'out', type: 'json' }],
    fields: [{ key: 'fileName', label: 'Arquivo de saída (.json)', kind: 'text', default: 'venda.json' }]
  }
}, PURE_CATALOG));

export function getNodeDefinition(type) {
  return typeof type === 'string' && Object.hasOwn(NODE_CATALOG, type) ? NODE_CATALOG[type] : undefined;
}

export function createNode(type, id, position) {
  const manifest = getNodeDefinition(type);
  if (!manifest) throw new Error(`Tipo de nó desconhecido: ${type}`);
  return {
    id, type, position,
    config: Object.fromEntries(manifest.fields.map(field => [field.key, field.default]))
  };
}

export function exampleFlow() {
  return {
    schemaVersion: 1,
    name: 'Venda - fluxo inicial',
    nodes: [
      createNode('trigger.manual', 'inicio', { x: 75, y: 160 }),
      createNode('logic.pick', 'selecionar', { x: 370, y: 160 }),
      createNode('io.writeJson', 'gravar', { x: 665, y: 160 })
    ],
    edges: [
      { id: 'e1', source: 'inicio', target: 'selecionar', sourceHandle: 'out', targetHandle: 'in' },
      { id: 'e2', source: 'selecionar', target: 'gravar', sourceHandle: 'out', targetHandle: 'in' }
    ]
  };
}
