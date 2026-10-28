import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { exampleFlow } from '../core/catalog.mjs';
import { loadFlow, readFlowDocument, saveFlow, readProjectFile, saveProjectFile, listProjectFiles, writeOutputJson } from '../core/workspace.mjs';

async function tempFolder(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omniforge-workspace-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test('projeto novo tem exemplo na memória, só salva após comando explícito', async t => {
  const root = await tempFolder(t);
  const initial = await loadFlow(root);
  assert.equal(initial.nodes.length, 3);
  await assert.rejects(fs.stat(path.join(root, '.omniforge')), { code: 'ENOENT' });
  const saved = await saveFlow(root, initial, null);
  assert.match(saved.revision, /^[a-f0-9]{64}$/);
  assert.deepEqual(await loadFlow(root), initial);
});

test('editor lê e salva arquivo real, sem sair do projeto', async t => {
  const root = await tempFolder(t);
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src', 'teste.js'), 'const a = 1;\n');
  const loaded = await readProjectFile(root, 'src/teste.js');
  assert.equal(loaded.content, 'const a = 1;\n');
  await saveProjectFile(root, 'src/teste.js', 'const a = 2;\n', loaded.revision);
  assert.equal(await fs.readFile(path.join(root, 'src', 'teste.js'), 'utf8'), 'const a = 2;\n');
});

test('bloqueia leitura por traversal e diretório protegido', async t => {
  const root = await tempFolder(t);
  await assert.rejects(readProjectFile(root, '../outro.txt'), /negado/);
  await assert.rejects(readProjectFile(root, '.git/config'), /protegida/);
});

test('bloqueia arquivo symlink para fora da raiz', async t => {
  const root = await tempFolder(t);
  const external = await tempFolder(t);
  await fs.writeFile(path.join(external, 'secreto.txt'), 'privado');
  try { await fs.symlink(path.join(external, 'secreto.txt'), path.join(root, 'atalho.txt')); }
  catch (err) { if (err.code === 'EPERM') return t.skip('SO não permite symlink'); throw err; }
  await assert.rejects(readProjectFile(root, 'atalho.txt'), /simbólicos/);
});

test('bloqueia saída quando .omniforge é link simbólico', async t => {
  const root = await tempFolder(t);
  const outside = await tempFolder(t);
  try { await fs.symlink(outside, path.join(root, '.omniforge')); }
  catch (err) { if (err.code === 'EPERM') return t.skip('SO não permite symlink'); throw err; }
  await assert.rejects(writeOutputJson(root, 'resultado.json', { x: 1 }), /link ou arquivo/);
  await assert.rejects(fs.stat(path.join(outside, 'output')), { code: 'ENOENT' });
});

test('explorador retorna arquivos mas oculta diretórios técnicos', async t => {
  const root = await tempFolder(t);
  await fs.mkdir(path.join(root, 'node_modules'));
  await fs.writeFile(path.join(root, 'codigo.py'), 'print(1)');
  const rows = await listProjectFiles(root);
  assert.equal(rows.some(r => r.path === 'codigo.py'), true);
  assert.equal(rows.some(r => r.path.includes('node_modules')), false);
});

test('saveFlow valida forma antes de persistir', async t => {
  const root = await tempFolder(t);
  const flow = exampleFlow();
  flow.schemaVersion = 999;
  await assert.rejects(saveFlow(root, flow), /inválido/);
});

test('editor mantém permissão executável de arquivos existentes', async t => {
  const root = await tempFolder(t);
  await fs.writeFile(path.join(root, 'script.sh'), '#!/bin/sh\necho ok\n', { mode: 0o755 });
  await fs.chmod(path.join(root, 'script.sh'), 0o755);
  const loaded = await readProjectFile(root, 'script.sh');
  await saveProjectFile(root, 'script.sh', '#!/bin/sh\necho atualizado\n', loaded.revision);
  if (process.platform !== 'win32') {
    assert.equal((await fs.stat(path.join(root, 'script.sh'))).mode & 0o777, 0o755);
  }
});

test('impede leitura de fluxo via pasta técnica symlink', async t => {
  const root = await tempFolder(t);
  const outside = await tempFolder(t);
  await fs.mkdir(path.join(outside, 'flows'));
  await fs.writeFile(path.join(outside, 'flows', 'principal.json'), JSON.stringify(exampleFlow()));
  try { await fs.symlink(outside, path.join(root, '.omniforge')); }
  catch (err) { if (err.code === 'EPERM') return t.skip('SO não permite symlink'); throw err; }
  await assert.rejects(loadFlow(root), /seguro/);
});


test('editor rejeita sobrescrita após mudança externa', async t => {
  const root = await tempFolder(t);
  await fs.writeFile(path.join(root, 'arquivo.txt'), 'versão A');
  const loaded = await readProjectFile(root, 'arquivo.txt');
  await fs.writeFile(path.join(root, 'arquivo.txt'), 'versão B (externa)');
  await assert.rejects(saveProjectFile(root, 'arquivo.txt', 'versão C', loaded.revision), /mudou fora/);
  assert.equal(await fs.readFile(path.join(root, 'arquivo.txt'), 'utf8'), 'versão B (externa)');
});

test('editor rejeita bytes UTF-8 inválidos sem alterar o arquivo', async t => {
  const root = await tempFolder(t);
  await fs.writeFile(path.join(root, 'invalido.txt'), Buffer.from([0xc3, 0x28]));
  await assert.rejects(readProjectFile(root, 'invalido.txt'), /UTF-8 válido/);
  assert.deepEqual(await fs.readFile(path.join(root, 'invalido.txt')), Buffer.from([0xc3, 0x28]));
});


test('salvar fluxo exige revisão e impede perda de edição externa', async t => {
  const root = await tempFolder(t);
  const initial = await readFlowDocument(root);
  assert.equal(initial.revision, null);
  const first = await saveFlow(root, initial.flow, initial.revision);
  assert.equal((await readFlowDocument(root)).revision, first.revision);
  const changed = structuredClone(initial.flow);
  changed.name = 'Atualização externa';
  const second = await saveFlow(root, changed, first.revision);
  assert.notEqual(second.revision, first.revision);
  const stale = structuredClone(initial.flow);
  stale.name = 'Edição antiga';
  await assert.rejects(saveFlow(root, stale, first.revision), /mudou fora/);
  assert.equal((await loadFlow(root)).name, 'Atualização externa');
});

test('troca de fluxo cria snapshot de recuperação do conteúdo anterior', async t => {
  const root = await tempFolder(t);
  const flow = exampleFlow();
  const saved = await saveFlow(root, flow, null);
  flow.name = 'Fluxo atualizado';
  await saveFlow(root, flow, saved.revision);
  const backup = JSON.parse(await fs.readFile(path.join(root, '.omniforge', 'flow-history', `${saved.revision}.json`), 'utf8'));
  assert.equal(backup.name, 'Venda - fluxo inicial');
  assert.equal((await loadFlow(root)).name, 'Fluxo atualizado');
});

test('uma revisão omitida não sobrescreve documentos existentes', async t => {
  const root = await tempFolder(t);
  const original = exampleFlow();
  await saveFlow(root, original, null);
  const changed = structuredClone(original);
  changed.name = 'Não autorizado';
  await assert.rejects(saveFlow(root, changed), /Revisão/);
  await assert.rejects(saveFlow(root, changed, null), /mudou fora/);
  assert.equal((await loadFlow(root)).name, original.name);
});

test('não grava snapshot de recuperação se diretório interno virou symlink', async t => {
  const root = await tempFolder(t);
  const outside = await tempFolder(t);
  const original = exampleFlow();
  const first = await saveFlow(root, original, null);
  try { await fs.symlink(outside, path.join(root, '.omniforge', 'flow-history')); }
  catch (error) { if (error.code === 'EPERM') return t.skip('SO não permite symlink'); throw error; }
  original.name = 'Segunda versão';
  await assert.rejects(saveFlow(root, original, first.revision), /link ou arquivo/);
  assert.notEqual((await loadFlow(root)).name, 'Segunda versão');
});
