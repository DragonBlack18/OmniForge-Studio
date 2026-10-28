import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { exampleFlow, createNode } from '../core/catalog.mjs';
import { validateFlow } from '../core/graph.mjs';
import { runFlow } from '../core/runner.mjs';

async function tempFolder(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omniforge-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test('exemplo inicial: grafo acíclico, válido e tipos reconhecidos', () => {
  const result = validateFlow(exampleFlow());
  assert.equal(result.valid, true);
  assert.deepEqual(result.order, ['inicio', 'selecionar', 'gravar']);
});

test('rejeita fluxo com entrada desconectada', () => {
  const flow = exampleFlow();
  flow.edges = [flow.edges[0]];
  assert.equal(validateFlow(flow).valid, false);
});

test('rejeita porta de tipo inexistente', () => {
  const flow = exampleFlow();
  flow.edges[0].sourceHandle = 'porta_falsa';
  assert.match(validateFlow(flow).errors.join(' '), /Portas incompatíveis/);
});

test('rejeita ciclo no grafo', () => {
  const flow = exampleFlow();
  flow.edges.push({ id: 'ciclo', source: 'gravar', target: 'selecionar', sourceHandle: 'out', targetHandle: 'in' });
  const validation = validateFlow(flow);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(' '), /Ciclo detectado/);
});

test('rejeita payload inválido antes de executar', () => {
  const flow = exampleFlow();
  flow.nodes[0].config.payload = '{x:';
  assert.equal(validateFlow(flow).valid, false);
});

test('rejeita nós que não fazem parte do catálogo', () => {
  const flow = exampleFlow();
  flow.nodes.push({ id: 'intruso', type: 'shell.exec', config: {}, position: { x: 0, y: 0 } });
  assert.equal(validateFlow(flow).valid, false);
});

test('rejeita nome de saída contendo diretórios e fuga', () => {
  const flow = exampleFlow();
  flow.nodes[2].config.fileName = '../../invasao.json';
  assert.equal(validateFlow(flow).valid, false);
});

test('dry-run percorre o fluxo sem gravar artefatos', async t => {
  const root = await tempFolder(t);
  const result = await runFlow(exampleFlow(), { workspace: root, dryRun: true });
  assert.equal(result.ok, true);
  assert.equal(result.steps.length, 3);
  assert.equal(result.artifacts[0].simulated, true);
  await assert.rejects(fs.stat(path.join(root, '.omniforge', 'output', 'venda.json')), { code: 'ENOENT' });
});

test('execução real escreve JSON dentro do workspace', async t => {
  const root = await tempFolder(t);
  const result = await runFlow(exampleFlow(), { workspace: root, dryRun: false });
  assert.equal(result.ok, true);
  assert.equal(result.artifacts[0].simulated, false);
  const actual = JSON.parse(await fs.readFile(path.join(root, '.omniforge', 'output', 'venda.json'), 'utf8'));
  assert.deepEqual(actual, { id: 1001, total: 299.9, cliente: 'Exemplo' });
});

test('falha de caminho JSON interrompe execução e não grava', async t => {
  const root = await tempFolder(t);
  const flow = exampleFlow();
  flow.nodes[1].config.path = 'venda.inexistente';
  const result = await runFlow(flow, { workspace: root, dryRun: false });
  assert.equal(result.ok, false);
  assert.equal(result.steps[1].status, 'FAIL');
  await assert.rejects(fs.stat(path.join(root, '.omniforge', 'output', 'venda.json')), { code: 'ENOENT' });
});

test('define nó com defaults controlados pelo manifesto', () => {
  const node = createNode('logic.pick', 'teste', { x: 0, y: 0 });
  assert.equal(node.config.path, 'venda');
  assert.throws(() => createNode('random', 'x', { x: 0, y: 0 }), /desconhecido/);
});

test('rejects inherited Object prototype type (constructor)', () => {
  const flow = exampleFlow();
  flow.nodes[1].type = 'constructor';
  assert.equal(validateFlow(flow).valid, false);
});

test('bloqueia dois nós gravando no mesmo arquivo', () => {
  const flow = exampleFlow();
  const extra = createNode('io.writeJson', 'arquivo2', { x: 920, y: 180 });
  extra.config.fileName = 'VENDA.JSON';
  flow.nodes.push(extra);
  flow.edges.push({ id:'e3', source:'gravar', target:'arquivo2', sourceHandle:'out', targetHandle:'in' });
  assert.match(validateFlow(flow).errors.join(' '), /mesmo arquivo/);
});
