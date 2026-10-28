import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { recordRunHistory, listRunHistory, readRunHistory } from '../core/history.mjs';
import { exampleFlow } from '../core/catalog.mjs';
import { runFlow } from '../core/runner.mjs';

async function tempFolder(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omniforge-history-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test('novo workspace sem execuções devolve histórico vazio e não cria pastas', async t => {
  const root = await tempFolder(t);
  assert.deepEqual(await listRunHistory(root), []);
  await assert.rejects(fs.stat(path.join(root, '.omniforge')), { code: 'ENOENT' });
});

test('registra simulação e execução real preservando dois arquivos distintos', async t => {
  const root = await tempFolder(t);
  const preview = await runFlow(exampleFlow(), { workspace: root, dryRun: true });
  const real = await runFlow(exampleFlow(), { workspace: root, dryRun: false });
  const p = await recordRunHistory(root, preview);
  const r = await recordRunHistory(root, real);
  assert.equal(p.saved, true); assert.equal(r.saved, true);
  assert.notEqual(p.id, r.id);
  const items = await listRunHistory(root);
  assert.equal(items.length, 2);
  assert.equal(items.filter(i => i.dryRun).length, 1);
  assert.equal(items.filter(i => !i.dryRun).length, 1);
  assert.deepEqual((await readRunHistory(root, r.id)).steps.map(x => x.status), ['PASS', 'PASS', 'PASS']);
});

test('metadados gravados não incluem conteúdo da venda, body HTTP ou entradas', async t => {
  const root = await tempFolder(t);
  const result = await runFlow(exampleFlow(), { workspace: root, dryRun: false });
  const item = await recordRunHistory(root, result);
  const bytes = await fs.readFile(path.join(root, item.relativePath), 'utf8');
  assert.equal(bytes.includes('Exemplo'), false);
  assert.equal(bytes.includes('299.9'), false);
  assert.equal(bytes.includes('1001'), false);
  assert.equal(bytes.includes('payload'), false);
  assert.match(bytes, /"status": "PASS"/);
});

test('redige tokens e URLs antes de gravar erros no histórico', async t => {
  const root = await tempFolder(t);
  const item = await recordRunHistory(root, { ok: false, stage: 'execution', dryRun: false,
    error: 'secret=abc https://example.com/?token=real',
    steps: [{ nodeId: 'a', type: 'http.localJson', status: 'FAIL', elapsedMs: 5, message: 'authorization: Bearer token=abc' }], artifacts: [] });
  const data = await fs.readFile(path.join(root, item.relativePath), 'utf8');
  assert.equal(data.includes('example.com'), false);
  assert.equal(data.includes('secret=abc'), false);
  assert.equal(data.includes('token=abc'), false);
});

test('bloqueia traversal e IDs arbitrários na leitura do histórico', async t => {
  const root = await tempFolder(t);
  await assert.rejects(readRunHistory(root, '../../etc/passwd'), /inválido/);
  await assert.rejects(readRunHistory(root, '.env'), /inválido/);
  await assert.rejects(readRunHistory(root, '0'.repeat(200)), /inválido/);
});

test('impede gravação em pasta histórica substituída por symlink', async t => {
  const root = await tempFolder(t);
  const outside = await tempFolder(t);
  await fs.mkdir(path.join(root, '.omniforge'));
  await fs.symlink(outside, path.join(root, '.omniforge', 'run-history'), 'dir');
  await assert.rejects(recordRunHistory(root, { ok: true, steps: [] }), /link ou arquivo/);
  await assert.rejects(listRunHistory(root), /link ou arquivo/);
  assert.deepEqual(await fs.readdir(outside), []);
});

test('listagem ignora arquivo corrompido e não lê symlink', async t => {
  const root = await tempFolder(t);
  const valid = await recordRunHistory(root, { ok: true, steps: [] });
  const dir = path.join(root, '.omniforge', 'run-history');
  const second = `${new Date().toISOString().replace(/[-:.]/g, '')}-550e8400-e29b-41d4-a716-446655440000.json`;
  await fs.symlink(path.join(root, valid.relativePath), path.join(dir, second));
  const records = await listRunHistory(root);
  assert.equal(records.length, 1);
});

test('limites de busca e isolamento entre dois projetos', async t => {
  const one = await tempFolder(t), two = await tempFolder(t);
  for (let i = 0; i < 4; i++) await recordRunHistory(one, { ok: i % 2 === 0, steps: [] });
  assert.equal((await listRunHistory(one, { limit: 2 })).length, 2);
  assert.deepEqual(await listRunHistory(two), []);
  await assert.rejects(listRunHistory(one, { limit: 101 }), /inválido/);
});
