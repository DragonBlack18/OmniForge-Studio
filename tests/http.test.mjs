import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createNode } from '../core/catalog.mjs';
import { validateFlow } from '../core/graph.mjs';
import { runFlow } from '../core/runner.mjs';
import { validateLocalHttpConfig, summarizeLocalHttpNodes } from '../core/http.mjs';

async function tempFolder(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omniforge-http-'));
  t.after(async () => fs.rm(root, { recursive: true, force: true }));
  return root;
}

async function localServer(t, handler) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}`;
}

function apiFlow(url, method = 'POST', field = 'data.venda') {
  const start = createNode('trigger.manual', 'inicio', { x: 0, y: 0 });
  const call = createNode('http.localJson', 'api', { x: 200, y: 0 });
  const pick = createNode('logic.pick', 'selecionar', { x: 400, y: 0 });
  const write = createNode('io.writeJson', 'saida', { x: 600, y: 0 });
  call.config = { url, method, timeoutMs: '3000' };
  pick.config.path = field;
  write.config.fileName = 'retorno.json';
  return { schemaVersion: 1, name: 'Teste HTTP real', nodes: [start, call, pick, write],
    edges: [
      { id: 'e1', source: 'inicio', target: 'api', sourceHandle: 'out', targetHandle: 'in' },
      { id: 'e2', source: 'api', target: 'selecionar', sourceHandle: 'out', targetHandle: 'in' },
      { id: 'e3', source: 'selecionar', target: 'saida', sourceHandle: 'out', targetHandle: 'in' }
    ] };
}

test('bloqueia domínios externos, DNS, credenciais e protocolos perigosos', () => {
  const bad = ['https://127.0.0.1', 'http://localhost:3000/a', 'http://example.com/api',
    'http://127.1:4000', 'http://127.0.0.1.evil.test:8080', 'http://user:pass@127.0.0.1:8080/a',
    'file:///etc/passwd', 'http://[::1]:8080/', 'http://127.0.0.1:0/', 'http://127.0.0.1:99999/',
    'http://127.0.0.1:8888/api#secret', 'http://127.0.0.1\\@evil.com/'];
  for (const url of bad) {
    assert.throws(() => validateLocalHttpConfig({ url, method: 'GET', timeoutMs: '3000' }), undefined, url);
  }
});

test('impede métodos arbitrários e timeouts fora dos limites', () => {
  const cfg = { url: 'http://127.0.0.1:8080/', method: 'DELETE', timeoutMs: '3000' };
  assert.throws(() => validateLocalHttpConfig(cfg), /Método/);
  cfg.method = 'POST'; cfg.timeoutMs = '99999';
  assert.throws(() => validateLocalHttpConfig(cfg), /Timeout/);
  cfg.timeoutMs = '3000'; assert.equal(validateLocalHttpConfig(cfg).url.hostname, '127.0.0.1');
});

test('validação de grafo barra HTTP externo antes do início', () => {
  const flow = apiFlow('https://api.example.com');
  assert.equal(validateFlow(flow).valid, false);
  assert.match(validateFlow(flow).errors.join(' '), /127\.0\.0\.1/);
});

test('resumo de permissões omite parâmetros de URL', () => {
  const list = summarizeLocalHttpNodes(apiFlow('http://127.0.0.1:8765/path?token=secret'));
  assert.equal(list.length, 1);
  assert.deepEqual(list[0], { nodeId: 'api', method: 'POST', destination: 'http://127.0.0.1:8765/path' });
});

test('simulação HTTP não envia request nem inventa resposta ou grava arquivos', async t => {
  let requests = 0;
  const origin = await localServer(t, (_req, res) => { requests++; res.end('{}'); });
  const root = await tempFolder(t);
  const result = await runFlow(apiFlow(origin + '/venda'), { workspace: root, dryRun: true });
  assert.equal(result.ok, true);
  assert.equal(result.partialSimulation, true);
  assert.equal(requests, 0);
  assert.deepEqual(result.steps.map(x => x.status), ['PASS', 'SKIP', 'SKIP', 'SKIP']);
  assert.equal(result.artifacts.length, 0);
  await assert.rejects(fs.stat(path.join(root, '.omniforge/output/retorno.json')), { code: 'ENOENT' });
});

test('sem autorização, execução bloqueia rede antes de enviar POST', async t => {
  let requests = 0;
  const origin = await localServer(t, (_req, res) => { requests++; res.end('{}'); });
  const result = await runFlow(apiFlow(origin + '/venda'), { workspace: await tempFolder(t), dryRun: false });
  assert.equal(result.ok, false);
  assert.match(result.error, /Acesso HTTP negado/);
  assert.equal(requests, 0);
});

test('POST autorizado envia JSON real e registra saída no workspace', async t => {
  let method = '', payload;
  const origin = await localServer(t, (req, res) => {
    method = req.method;
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      payload = JSON.parse(body);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ venda: { recebido: payload.venda.id, confirmado: true } }));
    });
  });
  const root = await tempFolder(t);
  const result = await runFlow(apiFlow(origin + '/vendas', 'POST', 'data.venda'), { workspace: root, dryRun: false, networkApproved: true });
  assert.equal(result.ok, true, result.error);
  assert.equal(method, 'POST'); assert.equal(payload.venda.id, 1001);
  assert.equal(result.steps.length, 4);
  const persisted = JSON.parse(await fs.readFile(path.join(root, '.omniforge/output/retorno.json'), 'utf8'));
  assert.deepEqual(persisted, { recebido: 1001, confirmado: true });
});

test('GET consulta local e JSON resultante alimenta outros nós', async t => {
  const origin = await localServer(t, (req, res) => {
    assert.equal(req.method, 'GET');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"venda":{"cliente":"Maria"}}');
  });
  const result = await runFlow(apiFlow(origin + '/vendas', 'GET', 'data.venda'), { workspace: await tempFolder(t), dryRun: false, networkApproved: true });
  assert.equal(result.ok, true, result.error);
});

test('rejeita redirects para evitar saída do loopback', async t => {
  const origin = await localServer(t, (_req, res) => { res.writeHead(302, { Location: 'http://example.com/' }); res.end(''); });
  const result = await runFlow(apiFlow(origin + '/'), { workspace: await tempFolder(t), dryRun: false, networkApproved: true });
  assert.equal(result.ok, false);
  assert.match(result.error, /redirecionamento/);
});

test('retorno não-JSON é rejeitado', async t => {
  const origin = await localServer(t, (_req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); });
  const result = await runFlow(apiFlow(origin + '/'), { workspace: await tempFolder(t), dryRun: false, networkApproved: true });
  assert.equal(result.ok, false);
  assert.match(result.error, /application\/json/);
});

test('HTTP 500 é falha e interrompe cadeia de execução', async t => {
  const origin = await localServer(t, (_req, res) => { res.writeHead(500, { 'content-type': 'application/json' }); res.end('{"error":true}'); });
  const root = await tempFolder(t);
  const result = await runFlow(apiFlow(origin + '/'), { workspace: root, dryRun: false, networkApproved: true });
  assert.equal(result.ok, false); assert.match(result.error, /HTTP 500/);
  assert.equal(result.steps.length, 2);
  await assert.rejects(fs.stat(path.join(root, '.omniforge/output/retorno.json')), { code: 'ENOENT' });
});

test('resposta que excede limite de 512 kB é bloqueada', async t => {
  const origin = await localServer(t, (_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ data: 'z'.repeat(530_000) })); });
  const result = await runFlow(apiFlow(origin + '/'), { workspace: await tempFolder(t), dryRun: false, networkApproved: true });
  assert.equal(result.ok, false); assert.match(result.error, /512 kB/);
});

test('timeout de API interrompe sem gravar e não aguarda resposta tardia', async t => {
  const origin = await localServer(t, (_req, res) => { setTimeout(() => { res.setHeader('content-type', 'application/json'); res.end('{}'); }, 350); });
  const flow = apiFlow(origin + '/'); flow.nodes[1].config.timeoutMs = '100';
  const result = await runFlow(flow, { workspace: await tempFolder(t), dryRun: false, networkApproved: true });
  assert.equal(result.ok, false);
  assert.match(result.error, /limite|timeout|comunicar/i);
});
