import { validateLocalHttpConfig, fetchLocalJson } from './http.mjs';

const PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CAPABILITY_ID = /^[a-z][a-z0-9_-]{1,39}$/;
const TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);
const FIELDS = new Set(['type', 'properties', 'required', 'items', 'additionalProperties']);
const SAFE_KEY = /^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/;

/** A deliberately restricted JSON Schema subset. Unsupported keywords fail closed. */
export function validateSchema(schema, depth = 0) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema) || depth > 7 || !TYPES.has(schema.type)) {
    throw new Error('Schema JSON exige tipo válido e profundidade máxima de 8 níveis.');
  }
  if (Object.keys(schema).some(key => !FIELDS.has(key))) throw new Error('Schema usa palavras-chave não suportadas.');
  if (schema.type === 'object') {
    if (schema.properties !== undefined) {
      if (!schema.properties || typeof schema.properties !== 'object' || Array.isArray(schema.properties) || Object.keys(schema.properties).length > 30) throw new Error('Schema possui propriedades inválidas.');
      for (const [key, nested] of Object.entries(schema.properties)) {
        if (!SAFE_KEY.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Propriedade do schema inválida.');
        validateSchema(nested, depth + 1);
      }
    }
    if (schema.required !== undefined) {
      if (!Array.isArray(schema.required) || schema.required.length > 30 ||
        schema.required.some(key => typeof key !== 'string' || !SAFE_KEY.test(key)) || new Set(schema.required).size !== schema.required.length) throw new Error('Lista required inválida.');
    }
    if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== 'boolean') throw new Error('additionalProperties deve ser booleano.');
    if (schema.items !== undefined) throw new Error('Schema de objeto não aceita items.');
  } else if (schema.type === 'array') {
    if (schema.items !== undefined) validateSchema(schema.items, depth + 1);
    if (schema.properties || schema.required || schema.additionalProperties !== undefined) throw new Error('Schema de array usa opções de objeto.');
  } else if (schema.properties || schema.required || schema.items || schema.additionalProperties !== undefined) {
    throw new Error('Schema simples não admite propriedades aninhadas.');
  }
  return schema;
}

export function validateCapabilityDefinition(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Capacidade inválida.');
  const { id, label, url, method, timeoutMs, inputSchema, outputSchema } = raw;
  if (typeof id !== 'string' || !CAPABILITY_ID.test(id)) throw new Error('Identificador da capacidade: use 2–40 letras minúsculas, números, _ ou -.');
  if (typeof label !== 'string' || !label.trim() || label.length > 90 || /[\x00-\x1f]/.test(label)) throw new Error('Nome da capacidade inválido.');
  const checked = validateLocalHttpConfig({ url, method, timeoutMs });
  if (checked.url.search) throw new Error('Não coloque tokens ou parâmetros de consulta na URL da capacidade.');
  if (typeof inputSchema !== 'object' || typeof outputSchema !== 'object') throw new Error('Schemas de entrada e saída são obrigatórios.');
  const input = validateSchema(inputSchema), output = validateSchema(outputSchema);
  const normalized = { id, label: label.trim(), url: checked.url.href, method: checked.method, timeoutMs: checked.timeoutMs, inputSchema: input, outputSchema: output };
  if (new TextEncoder().encode(JSON.stringify(normalized)).byteLength > 8_192) throw new Error('Contrato de capacidade maior que 8 KiB.');
  return structuredClone(normalized);
}

export function assertPayloadSchema(schema, value, label = 'JSON') {
  validateSchema(schema);
  function matches(def, data, at, depth) {
    if (depth > 7) throw new Error(`${label}: objeto ultrapassa profundidade contratada.`);
    const type = def.type;
    const correct = type === 'null' ? data === null
      : type === 'array' ? Array.isArray(data)
      : type === 'object' ? data !== null && typeof data === 'object' && !Array.isArray(data)
      : type === 'integer' ? Number.isInteger(data)
      : type === 'number' ? typeof data === 'number' && Number.isFinite(data)
      : typeof data === type;
    if (!correct) throw new Error(`${label}: campo ${at} não corresponde ao tipo ${type}.`);
    if (type === 'object') {
      const props = def.properties || {};
      for (const key of def.required || []) if (!Object.hasOwn(data, key)) throw new Error(`${label}: campo obrigatório ausente em ${at}.${key}.`);
      for (const [key, nested] of Object.entries(props)) if (Object.hasOwn(data, key)) matches(nested, data[key], `${at}.${key}`, depth + 1);
      if (def.additionalProperties === false && Object.keys(data).some(key => !Object.hasOwn(props, key))) throw new Error(`${label}: propriedades extras proibidas em ${at}.`);
    }
    if (type === 'array' && def.items) for (const [i, item] of data.entries()) matches(def.items, item, `${at}[${i}]`, depth + 1);
  }
  matches(schema, value, '$', 0);
}

export function findProjectCapability(config, projects) {
  if (!config || typeof config !== 'object' || typeof config.projectId !== 'string' || !PROJECT_ID.test(config.projectId) ||
    typeof config.capabilityId !== 'string' || !CAPABILITY_ID.test(config.capabilityId)) {
    throw new Error('Escolha um projeto cadastrado e uma capacidade válida.');
  }
  if (!Array.isArray(projects)) throw new Error('Catálogo de projetos não carregado.');
  const project = projects.find(p => p.id === config.projectId);
  if (!project) throw new Error('Projeto vinculado não está cadastrado.');
  if (project.available !== true) throw new Error('Projeto vinculado está offline ou indisponível.');
  const capability = project.capabilities?.find(c => c.id === config.capabilityId);
  if (!capability) throw new Error('Capacidade não está cadastrada no projeto vinculado.');
  return { project, capability: validateCapabilityDefinition(capability) };
}

export function summarizeProjectCalls(flow, projects) {
  if (!Array.isArray(flow?.nodes)) return [];
  return flow.nodes.filter(n => n?.type === 'project.callLocalApi').map(n => {
    const { project, capability } = findProjectCapability(n.config, projects);
    const url = new URL(capability.url);
    return { nodeId: n.id, project: project.label, capability: capability.label,
      method: capability.method, destination: url.origin + url.pathname };
  });
}

export async function executeProjectCapability(config, input, { projects = [], networkApproved = false } = {}) {
  const { capability } = findProjectCapability(config, projects);
  if (!networkApproved) throw new Error('Conexão entre projetos requer autorização na janela do OmniForge.');
  assertPayloadSchema(capability.inputSchema, input, 'Entrada');
  const response = await fetchLocalJson(capability, input, { networkApproved });
  assertPayloadSchema(capability.outputSchema, response.data, 'Saída');
  return response;
}
