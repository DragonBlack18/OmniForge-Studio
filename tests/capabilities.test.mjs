import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { registerProject, registerCapability, forgetCapability, forgetProject, listProjects } from '../core/projects.mjs';
import { validateCapabilityDefinition, assertPayloadSchema, summarizeProjectCalls } from '../core/capabilities.mjs';
import { createNode } from '../core/catalog.mjs';
import { validateFlow } from '../core/graph.mjs';
import { runFlow } from '../core/runner.mjs';

async function setup(t) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'omniforge-integration-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  for (const name of ['userdata', 'frontend', 'backend']) await fs.mkdir(path.join(home, name));
  const root = path.join(home, 'userdata');
  const frontend = path.join(home, 'frontend'), backend = path.join(home, 'backend');
  const source = await registerProject(root, frontend), target = await registerProject(root, backend);
  return { home, root, frontend, backend, source, target };
}

async function server(t, handler) {
  const api = http.createServer(handler);
  await new Promise((resolve, reject) => { api.once('error', reject); api.listen(0, '127.0.0.1', resolve); });
  t.after(async () => { api.closeAllConnections(); await new Promise(resolve => api.close(resolve)); });
  return `http://127.0.0.1:${api.address().port}`;
}

function definition(url, opts = {}) {
  return { id: 'vendas', label: 'Registrar venda', url, method: 'POST', timeoutMs: '3000',
    inputSchema: { type: 'object', required: ['venda'], properties: { venda: { type: 'object', required: ['id'], properties: { id: { type: 'integer' } } } } },
    outputSchema: { type: 'object', required: ['confirmado'], properties: { confirmado: { type: 'boolean' } } }, ...opts };
}

function flow(projectId, capabilityId = 'vendas', payload = '{"venda":{"id":1234}}') {
  const trigger = createNode('trigger.manual', 'inicio', { x: 0, y: 0 }); trigger.config.payload = payload;
  const call = createNode('project.callLocalApi', 'chamada', { x: 190, y: 0 });
  call.config = { projectId, capabilityId };
  const output = createNode('io.writeJson', 'resultado', { x: 380, y: 0 }); output.config.fileName = 'resultado.json';
  return { schemaVersion: 1, name: 'Integração real de projetos', nodes: [trigger, call, output], edges: [
    { id: 'a', source: 'inicio', target: 'chamada', sourceHandle: 'out', targetHandle: 'in' },
    { id: 'b', source: 'chamada', target: 'resultado', sourceHandle: 'out', targetHandle: 'in' }
  ] };
}

test('schemas recusam recursos não implementados e payloads incompatíveis', () => {
  assert.throws(() => validateCapabilityDefinition(definition('https://127.0.0.1:8000/venda')), /127\.0\.0\.1|somente/);
  assert.throws(() => validateCapabilityDefinition(definition('http://example.com/')), /127\.0\.0\.1/);
  assert.throws(() => validateCapabilityDefinition(definition('http://127.0.0.1:8000/', { inputSchema: { type: 'object', $ref: 'http://example.com' } })), /não suportadas/);
  assert.throws(() => validateCapabilityDefinition(definition('http://127.0.0.1:8000/', { outputSchema: { type: 'object', properties: { constructor: { type: 'string' } } } })), /Propriedade/);
  assert.throws(() => assertPayloadSchema({ type: 'array', items: { type: 'boolean' } }, [true, 42]), /tipo boolean/);
  assertPayloadSchema({ type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } }, additionalProperties: false }, { ok: true });
  assert.throws(() => assertPayloadSchema({ type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } }, additionalProperties: false }, { ok: true, token: 'x' }), /extras/);
});

test('contrato cadastrado e persistido fora dos projetos; duplicados e exclusões seguras', async t => {
  const { root, backend, target } = await setup(t);
  await fs.writeFile(path.join(backend, 'persistir.txt'), 'original');
  const cap = await registerCapability(root, target.id, definition('http://127.0.0.1:8765/registrar'));
  assert.equal(cap.projectId, target.id);
  const [stored] = (await listProjects(root)).filter(p => p.id === target.id);
  assert.equal(stored.capabilities[0].id, 'vendas');
  await assert.rejects(registerCapability(root, target.id, definition('http://127.0.0.1:9999/')), /já existe/);
  await forgetCapability(root, target.id, 'vendas');
  await assert.rejects(forgetCapability(root, target.id, 'vendas'), /não encontrada/);
  await registerCapability(root, target.id, definition('http://127.0.0.1:8765/'));
  await forgetProject(root, target.id);
  assert.equal((await listProjects(root)).some(p => p.id === target.id), false);
  assert.equal(await fs.readFile(path.join(backend, 'persistir.txt'), 'utf8'), 'original');
});

test('validação do grafo usa projeto/capacidade reais em vez de aceitar blocos vazios', async t => {
  const { root, target } = await setup(t);
  const f = flow(target.id);
  assert.equal(validateFlow(f).valid, false);
  await registerCapability(root, target.id, definition('http://127.0.0.1:8765/'));
  const projects = await listProjects(root);
  assert.equal(validateFlow(f, { projects }).valid, true);
  const requests = summarizeProjectCalls(f, projects);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].destination, 'http://127.0.0.1:8765/');
  f.nodes[1].config.capabilityId = 'naoexiste';
  assert.equal(validateFlow(f, { projects }).valid, false);
});

test('POST entre projetos envia JSON real autorizado e grava apenas no workspace ativo', async t => {
  const { root, frontend, backend, target } = await setup(t);
  let requests = 0, body = null;
  const origin = await server(t, (req, res) => {
    requests++; assert.equal(req.method, 'POST');
    const chunks = []; req.on('data', chunk => chunks.push(chunk)); req.on('end', () => {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      res.setHeader('content-type', 'application/json'); res.end('{"confirmado":true,"origem":"api-real"}');
    });
  });
  await registerCapability(root, target.id, definition(origin + '/v1/vendas'));
  const projects = await listProjects(root);
  const f = flow(target.id);
  const result = await runFlow(f, { workspace: frontend, dryRun: false, projects, networkApproved: true });
  assert.equal(result.ok, true, result.error);
  assert.equal(requests, 1); assert.equal(body.venda.id, 1234);
  const saved = JSON.parse(await fs.readFile(path.join(frontend, '.omniforge/output/resultado.json'), 'utf8'));
  assert.equal(saved.status, 200); assert.deepEqual(saved.data, { confirmado: true, origem: 'api-real' });
  assert.deepEqual(await fs.readdir(backend), []);
});

test('simulação e ausência de consentimento não enviam rede nem geram dados falsos', async t => {
  const { root, frontend, target } = await setup(t);
  let requests = 0;
  const origin = await server(t, (_req, res) => { requests++; res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"confirmado":true}'); });
  await registerCapability(root, target.id, definition(origin + '/api'));
  const projects = await listProjects(root), f = flow(target.id);
  const dry = await runFlow(f, { workspace: frontend, projects, dryRun: true });
  assert.equal(dry.ok, true); assert.equal(dry.partialSimulation, true);
  assert.deepEqual(dry.steps.map(s => s.status), ['PASS', 'SKIP', 'SKIP']);
  const denied = await runFlow(f, { workspace: frontend, projects, dryRun: false });
  assert.equal(denied.ok, false); assert.equal(requests, 0);
  await assert.rejects(fs.stat(path.join(frontend, '.omniforge/output/resultado.json')), { code: 'ENOENT' });
});

test('input inválido é bloqueado antes do POST', async t => {
  const { root, frontend, target } = await setup(t);
  let requests = 0;
  const origin = await server(t, (_req, res) => { requests++; res.end('{"confirmado":true}'); });
  await registerCapability(root, target.id, definition(origin));
  const result = await runFlow(flow(target.id, 'vendas', '{"venda":{"id":"errado"}}'), { workspace: frontend, projects: await listProjects(root), dryRun: false, networkApproved: true });
  assert.equal(result.ok, false); assert.match(result.error, /Entrada: campo/); assert.equal(requests, 0);
});

test('resposta de projeto com tipo errado bloqueia continuação e escrita', async t => {
  const { root, frontend, target } = await setup(t);
  const origin = await server(t, (_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"confirmado":"não"}'); });
  await registerCapability(root, target.id, definition(origin));
  const result = await runFlow(flow(target.id), { workspace: frontend, projects: await listProjects(root), dryRun: false, networkApproved: true });
  assert.equal(result.ok, false); assert.match(result.error, /Saída: campo/);
  await assert.rejects(fs.stat(path.join(frontend, '.omniforge/output/resultado.json')), { code: 'ENOENT' });
});

test('projetos offline ou capacidade removida nunca são chamados', async t => {
  const { root, frontend, backend, target } = await setup(t);
  let requests = 0;
  const origin = await server(t, (_req, res) => { requests++; res.end('{"confirmado":true}'); });
  await registerCapability(root, target.id, definition(origin));
  await fs.rename(backend, `${backend}-offline`);
  const result = await runFlow(flow(target.id), { workspace: frontend, projects: await listProjects(root), dryRun: false, networkApproved: true });
  assert.equal(result.ok, false); assert.equal(result.stage, 'validation'); assert.equal(requests, 0);
});

test('GET validado usa endpoint cadastrado sem enviar corpo HTTP', async t => {
  const { root, frontend, target } = await setup(t);
  let called = false;
  const origin = await server(t, (req, res) => {
    called = true; assert.equal(req.method, 'GET');
    res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"confirmado":true}');
  });
  await registerCapability(root, target.id, definition(origin + '/status', { method: 'GET' }));
  const result = await runFlow(flow(target.id), { workspace: frontend, projects: await listProjects(root), dryRun: false, networkApproved: true });
  assert.equal(result.ok, true, result.error); assert.equal(called, true);
});

test('bloqueia redirecionamento entre serviços durante chamada de projeto', async t => {
  const { root, frontend, target } = await setup(t);
  const origin = await server(t, (_req, res) => { res.writeHead(302, { Location: 'https://example.com' }); res.end(); });
  await registerCapability(root, target.id, definition(origin));
  const result = await runFlow(flow(target.id), { workspace: frontend, projects: await listProjects(root), dryRun: false, networkApproved: true });
  assert.equal(result.ok, false); assert.match(result.error, /redirecionamento/);
});
