import { validatePureNode } from './pure-nodes.mjs';
import { getNodeDefinition } from './catalog.mjs';
import { validateLocalHttpConfig } from './http.mjs';
import { findProjectCapability } from './capabilities.mjs';

const MAX_NODES = 400;
const MAX_EDGES = 800;

export function validateFlow(flow, { projects = [] } = {}) {
  const errors = [];
  const warnings = [];
  if (!flow || typeof flow !== 'object' || Array.isArray(flow)) {
    return { valid: false, errors: ['Fluxo deve ser um objeto.'], warnings, order: [] };
  }
  if (flow.schemaVersion !== 1) errors.push('Versão do schema de fluxo não suportada.');
  if (!Array.isArray(flow.nodes) || !Array.isArray(flow.edges)) {
    return { valid: false, errors: ['nodes e edges devem ser listas.'], warnings, order: [] };
  }
  if (!flow.nodes.length) errors.push('O fluxo não possui nós.');
  if (flow.nodes.length > MAX_NODES || flow.edges.length > MAX_EDGES) errors.push('Fluxo excede o limite de tamanho.');

  const byId = new Map();
  const inDegree = new Map();
  const adjacency = new Map();
  let triggerCount = 0;
  for (const node of flow.nodes) {
    if (!node || typeof node.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(node.id)) {
      errors.push('Um nó tem identificador inválido.');
      continue;
    }
    if (byId.has(node.id)) errors.push(`Identificador duplicado: ${node.id}`);
    byId.set(node.id, node);
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
    if (!getNodeDefinition(node.type)) {
      errors.push(`Tipo não registrado: ${node.type}`);
      continue;
    }
    if (node.type === 'trigger.manual') triggerCount++;
    if (!node.config || typeof node.config !== 'object' || Array.isArray(node.config)) {
      errors.push(`Configuração inválida no nó ${node.id}`);
      continue;
    }
    try { validatePureNode(node); } catch (error) { errors.push(`Nó ${node.id}: ${error.message}`); }
    // Enforce select contracts for built-in adapters as well as pure nodes.
    for (const field of getNodeDefinition(node.type).fields.filter(f => f.kind === 'select')) {
      if (!field.options.includes(node.config[field.key])) {
        errors.push(`Nó ${node.id}: opção inválida em ${field.key}.`);
      }
    }
    if (node.type === 'trigger.manual') {
      try { JSON.parse(node.config.payload); } catch { errors.push(`JSON de entrada inválido em ${node.id}.`); }
    }
    if (node.type === 'logic.pick') {
      const p = node.config.path;
      if (typeof p !== 'string' || !/^[a-zA-Z_$][\w$]*(\.[a-zA-Z_$][\w$]*){0,20}$/.test(p)) {
        errors.push(`Caminho JSON inválido em ${node.id}.`);
      }
    }
    if (node.type === 'http.localJson') {
      try { validateLocalHttpConfig(node.config); } catch (error) { errors.push(`HTTP inválido em ${node.id}: ${error.message}`); }
    }
    if (node.type === 'project.callLocalApi') {
      try { findProjectCapability(node.config, projects); } catch (error) { errors.push(`Projeto/API inválido em ${node.id}: ${error.message}`); }
    }
    if (node.type === 'io.writeJson' || node.type === 'io.readJson') {
      const p = node.config.fileName;
      if (typeof p !== 'string' || !/^[\w-]{1,100}\.json$/i.test(p)) {
        errors.push(`Nome de arquivo inválido em ${node.id}. Use um nome simples .json.`);
      }
    }
  }
  if (triggerCount !== 1) errors.push('O fluxo precisa de exatamente um gatilho manual.');

  const targets = new Set();
  const outputFiles = new Set();
  for (const node of flow.nodes) {
    if (node?.type !== 'io.writeJson' || typeof node.config?.fileName !== 'string') continue;
    const key = node.config.fileName.toLowerCase();
    if (outputFiles.has(key)) errors.push(`Múltiplos nós gravam no mesmo arquivo: ${node.config.fileName}`);
    outputFiles.add(key);
  }
  const edgeIds = new Set();
  for (const edge of flow.edges) {
    if (!edge || typeof edge.id !== 'string') { errors.push('Conexão sem identificador.'); continue; }
    if (edgeIds.has(edge.id)) errors.push(`Conexão duplicada: ${edge.id}`);
    edgeIds.add(edge.id);
    const source = byId.get(edge.source), target = byId.get(edge.target);
    if (!source || !target) { errors.push(`Conexão ${edge.id} aponta para nó ausente.`); continue; }
    const srcManifest = getNodeDefinition(source.type), dstManifest = getNodeDefinition(target.type);
    if (!srcManifest || !dstManifest) continue;
    const out = srcManifest.outputs.find(port => port.id === edge.sourceHandle);
    const input = dstManifest.inputs.find(port => port.id === edge.targetHandle);
    if (!out || !input || out.type !== input.type) {
      errors.push(`Portas incompatíveis na conexão ${edge.id}.`);
      continue;
    }
    const targetPort = `${edge.target}:${edge.targetHandle}`;
    if (targets.has(targetPort)) errors.push(`Entrada ${targetPort} já possui conexão.`);
    targets.add(targetPort);
    inDegree.set(target.id, (inDegree.get(target.id) ?? 0) + 1);
    adjacency.get(source.id)?.push(target.id);
  }
  for (const node of flow.nodes) {
    const manifest = getNodeDefinition(node?.type);
    if (!manifest) continue;
    for (const port of manifest.inputs.filter(p => p.required)) {
      if (!targets.has(`${node.id}:${port.id}`)) errors.push(`Entrada ${node.id}:${port.id} não está conectada.`);
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
  if (order.length !== byId.size) errors.push('Ciclo detectado: a execução não pode ser ordenada.');

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
    for (const id of byId.keys()) if (!seen.has(id)) errors.push(`Nó ${id} está desconectado do gatilho.`);
  }
  if (!flow.edges.length && flow.nodes.length === 1) warnings.push('Fluxo sem ações: o gatilho produz apenas dados.');
  return { valid: errors.length === 0, errors, warnings, order };
}
