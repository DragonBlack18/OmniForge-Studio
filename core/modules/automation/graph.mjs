import { validatePureNode } from './pure-nodes.mjs';
import { getNodeDefinition } from './catalog.mjs';
import { validateLocalHttpConfig } from '../integrations/http.mjs';
import { findProjectCapability } from '../integrations/capabilities.mjs';
import { resolveExtensionAction } from '../extensions/extension-contract.mjs';

const MAX_NODES = 400;
const MAX_EDGES = 800;

export function validateFlow(flow, { projects = [], extensions = [] } = {}) {
  const errors = [];
  const warnings = [];
  const diagnostics = [];
  let context = {};
  const report = (message, code='configuration') => {
    errors.push(message);diagnostics.push({severity:'error',code,message,...context});
  };
  if (!flow || typeof flow !== 'object' || Array.isArray(flow)) {
    return {valid:false,errors:['Fluxo deve ser um objeto.'],warnings,order:[],diagnostics:[{severity:'error',code:'document',message:'Fluxo deve ser um objeto.'}]};
  }
  if (flow.schemaVersion !== 1) report('Versão do schema de fluxo não suportada.');
  if (!Array.isArray(flow.nodes) || !Array.isArray(flow.edges)) {
    return {valid:false,errors:['nodes e edges devem ser listas.'],warnings,order:[],diagnostics:[{severity:'error',code:'document',message:'nodes e edges devem ser listas.'}]};
  }
  if (!flow.nodes.length) report('O fluxo não possui nós.');
  if (flow.nodes.length > MAX_NODES || flow.edges.length > MAX_EDGES) {
    report('Fluxo excede o limite de tamanho.','limit');
    return {valid:false,errors,warnings,order:[],diagnostics};
  }
  try {
    if(new TextEncoder().encode(JSON.stringify(flow)).length>2_000_000)throw Error();
  }catch{
    report('Fluxo excede 2 MB ou não é JSON serializável.','limit');
    return {valid:false,errors,warnings,order:[],diagnostics};
  }

  const byId = new Map();
  const inDegree = new Map();
  const adjacency = new Map();
  let triggerCount = 0;
  for (const node of flow.nodes) {
    context = typeof node?.id==='string'?{nodeId:node.id}:{};
    if (!node || typeof node.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(node.id)) {
      report('Um nó tem identificador inválido.');
      continue;
    }
    if (byId.has(node.id)) report(`Identificador duplicado: ${node.id}`);
    byId.set(node.id, node);
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
    if (!getNodeDefinition(node.type)) {
      report(`Tipo não registrado: ${node.type}`);
      continue;
    }
    if (node.type === 'trigger.manual') triggerCount++;
    if(!node.position || !Number.isFinite(node.position.x) || !Number.isFinite(node.position.y))
      report(`Posição inválida no nó ${node.id}.`,'position');
    if (!node.config || typeof node.config !== 'object' || Array.isArray(node.config)) {
      report(`Configuração inválida no nó ${node.id}`);
      continue;
    }
    try { validatePureNode(node); } catch (error) { report(`Nó ${node.id}: ${error.message}`); }
    // Enforce select contracts for built-in adapters as well as pure nodes.
    for (const field of getNodeDefinition(node.type).fields.filter(f => f.kind === 'select')) {
      if (!field.options.includes(node.config[field.key])) {
        report(`Nó ${node.id}: opção inválida em ${field.key}.`);
      }
    }
    if (node.type === 'trigger.manual') {
      try {
        if(typeof node.config.payload!=='string')throw Error();
        JSON.parse(node.config.payload);
      } catch { report(`JSON de entrada inválido em ${node.id}.`,'payload'); }
    }
    if (node.type === 'logic.pick') {
      const p = node.config.path;
      if (typeof p !== 'string' || !/^[a-zA-Z_$][\w$]*(\.[a-zA-Z_$][\w$]*){0,20}$/.test(p) || p.split('.').some(x=>['__proto__','prototype','constructor'].includes(x))) {
        report(`Caminho JSON inválido em ${node.id}.`);
      }
    }
    if (node.type === 'http.localJson') {
      try { validateLocalHttpConfig(node.config); } catch (error) { report(`HTTP inválido em ${node.id}: ${error.message}`); }
    }
    if(node.type==='extension.call') {
      try { resolveExtensionAction(node.config,extensions); }
      catch(error){ report('Extensão inválida em '+node.id+': '+error.message); }
    }
    if (node.type === 'project.callLocalApi') {
      try { findProjectCapability(node.config, projects); } catch (error) { report(`Projeto/API inválido em ${node.id}: ${error.message}`); }
    }
    if (node.type === 'io.writeJson' || node.type === 'io.readJson') {
      const p = node.config.fileName;
      if (typeof p !== 'string' || !/^[\w-]{1,100}\.json$/i.test(p)) {
        report(`Nome de arquivo inválido em ${node.id}. Use um nome simples .json.`);
      }
    }
  }
  context = {};
  if (triggerCount !== 1) report('O fluxo precisa de exatamente um gatilho manual.');

  const targets = new Set();
  const outputFiles = new Set();
  for (const node of flow.nodes) {
    context = typeof node?.id==='string'?{nodeId:node.id}:{};
    let filename=null;
    if(node?.type==='io.writeJson' && typeof node.config?.fileName==='string')
      filename=node.config.fileName;
    if(node?.type==='extension.call') {
      // Extension outputs share the same user data directory as io.writeJson.
      // Reject implicit overwrites when two nodes target the same filename.
      try {filename=resolveExtensionAction(node.config,extensions).action.outputFile??null;}
      catch { /* Invalid extension has already been reported above. */ }
    }
    if(node?.type==='cad.exportDrawing' && ['svg','dxf'].includes(node.config?.format))filename='cad-sketch.'+node.config.format;
    if(!filename)continue;
    const key=filename.toLowerCase();
    if(outputFiles.has(key))
      report(`Múltiplos nós gravam no mesmo arquivo: ${filename}`);
    outputFiles.add(key);
  }
  const edgeIds = new Set();
  for (const edge of flow.edges) {
    context = edge?{edgeId:typeof edge.id==='string'?edge.id:undefined,nodeId:typeof edge.target==='string'?edge.target:undefined}:{};
    if (!edge || typeof edge.id !== 'string') { report('Conexão sem identificador.'); continue; }
    if (edgeIds.has(edge.id)) report(`Conexão duplicada: ${edge.id}`);
    edgeIds.add(edge.id);
    const source = byId.get(edge.source), target = byId.get(edge.target);
    if (!source || !target) { report(`Conexão ${edge.id} aponta para nó ausente.`); continue; }
    const srcManifest = getNodeDefinition(source.type), dstManifest = getNodeDefinition(target.type);
    if (!srcManifest || !dstManifest) continue;
    const out = srcManifest.outputs.find(port => port.id === edge.sourceHandle);
    const input = dstManifest.inputs.find(port => port.id === edge.targetHandle);
    if (!out || !input || out.type !== input.type) {
      report(`Portas incompatíveis na conexão ${edge.id}.`);
      continue;
    }
    const targetPort = `${edge.target}:${edge.targetHandle}`;
    if (targets.has(targetPort)) report(`Entrada ${targetPort} já possui conexão.`);
    targets.add(targetPort);
    inDegree.set(target.id, (inDegree.get(target.id) ?? 0) + 1);
    adjacency.get(source.id)?.push(target.id);
  }
  for (const node of flow.nodes) {
    context = typeof node?.id==='string'?{nodeId:node.id}:{};
    const manifest = getNodeDefinition(node?.type);
    if (!manifest) continue;
    for (const port of manifest.inputs.filter(p => p.required)) {
      if (!targets.has(`${node.id}:${port.id}`)) report(`Entrada ${node.id}:${port.id} não está conectada.`);
    }
  }
  const queue = [...inDegree.entries()].filter(([, deg]) => deg === 0).map(([id]) => id).sort();
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const target of (adjacency.get(id) || [])) {
      inDegree.set(target, inDegree.get(target) - 1);
      if (inDegree.get(target) === 0) { queue.push(target); queue.sort(); }
    }
  }
  context = {};
  if (order.length !== byId.size) report('Ciclo detectado: a execução não pode ser ordenada.');

  const trigger = flow.nodes.find(n => n?.type === 'trigger.manual');
  const seen = new Set();
  if (trigger) {
    const stack = [trigger.id];
    while (stack.length) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      for (const next of adjacency.get(id) || []) stack.push(next);
    }
    for (const id of byId.keys()) if (!seen.has(id)) {context={nodeId:id};report(`Nó ${id} está desconectado do gatilho.`,'unreachable');}
  }
  if (!flow.edges.length && flow.nodes.length === 1) warnings.push('Fluxo sem ações: o gatilho produz apenas dados.');
  return { valid: errors.length === 0, errors, warnings, order, diagnostics };
}
