import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readProjectFile, saveProjectFile } from '../core/workspace.mjs';
import { searchWorkspaceText, createWorkspaceFile, createWorkspaceFolder } from '../core/workspace-ide.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omni-ide-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
const search = (root, query, caseSensitive = false) =>
  searchWorkspaceText(root, { query, caseSensitive });

test('busca real em subpastas retorna linha e coluna para Monaco sem alterar dados', async t => {
  const root = await fixture(t);
  await fs.mkdir(path.join(root, 'src'));
  const text = 'const alpha = 1;\r\n// CANARY-marker específico\r\nexport const value = "CANARY-marker";\r\n';
  await fs.writeFile(path.join(root, 'src', 'código.js'), text);
  const result = await search(root, 'canary-marker');
  assert.equal(result.filesScanned, 1);
  assert.equal(result.filesMatched, 1);
  assert.deepEqual(result.results.map(x => [x.path, x.line, x.column]), [
    ['src/código.js', 2, 4], ['src/código.js', 3, 23]
  ]);
  assert.match(result.results[0].snippet, /CANARY-marker/);
  assert.equal(await fs.readFile(path.join(root, 'src', 'código.js'), 'utf8'), text);
});

test('busca case-sensitive preserva distinção entre maiúsculas', async t => {
  const root = await fixture(t);
  await fs.writeFile(path.join(root, 'a.js'), 'Nome NOME nome\n');
  assert.equal((await search(root, 'Nome', true)).results.length, 1);
  assert.equal((await search(root, 'nome')).results.length, 3);
});

test('busca é literal, sem execução de regex arbitrário', async t => {
  const root = await fixture(t);
  await fs.writeFile(path.join(root, 'a.txt'), 'a.b aXb (ok) [abc]\n');
  assert.equal((await search(root, 'a.b')).results.length, 1);
  assert.equal((await search(root, '[abc]')).results.length, 1);
  assert.equal((await search(root, '(ok)')).results.length, 1);
});

test('ignora segredos, arquivos binários e diretórios de sistema/caches', async t => {
  const root = await fixture(t);
  for (const name of ['.git', '.omniforge', 'node_modules', 'dist']) {
    await fs.mkdir(path.join(root, name));
    await fs.writeFile(path.join(root, name, 'secret.txt'), 'HIDDEN-NEEDLE');
  }
  await fs.writeFile(path.join(root, '.env.local'), 'HIDDEN-NEEDLE');
  await fs.writeFile(path.join(root, 'image.png'), 'HIDDEN-NEEDLE');
  await fs.writeFile(path.join(root, 'private.key'), 'HIDDEN-NEEDLE');
  await fs.writeFile(path.join(root, 'binary.txt'), Buffer.from([0x48, 0, 0x49]));
  await fs.writeFile(path.join(root, 'safe.md'), 'VISIBLE-NEEDLE');
  assert.deepEqual((await search(root, 'HIDDEN-NEEDLE')).results, []);
  assert.deepEqual((await search(root, 'VISIBLE-NEEDLE')).results.map(x => x.path), ['safe.md']);
});

test('não segue symlinks externos, inclusive para diretórios', async t => {
  const root = await fixture(t), ext = await fixture(t);
  await fs.writeFile(path.join(ext, 'outside.txt'), 'EXTERNAL-SECRET');
  try {
    await fs.symlink(path.join(ext, 'outside.txt'), path.join(root, 'linked.txt'));
    await fs.symlink(ext, path.join(root, 'linked-dir'),
      process.platform === 'win32' ? 'junction' : 'dir');
  } catch (err) {
    if (err.code === 'EPERM') return t.skip('Runner não permite symlink');
    throw err;
  }
  assert.deepEqual((await search(root, 'EXTERNAL-SECRET')).results, []);
});

test('arquivos maiores que 320 KB e UTF-8 inválido não são indexados', async t => {
  const root = await fixture(t);
  await fs.writeFile(path.join(root, 'huge.txt'), 'LIMIT-HIT'.repeat(40000));
  await fs.writeFile(path.join(root, 'invalid.txt'), Buffer.from([0xff, 0xfe, 0x61]));
  const result = await search(root, 'LIMIT-HIT');
  assert.equal(result.results.length, 0);
  assert.ok(result.skippedFiles >= 2);
});

test('limita o resultado a 160 ocorrências em 20 arquivos', async t => {
  const root = await fixture(t);
  for (let i = 0; i < 25; i++)
    await fs.writeFile(path.join(root, 'file-' + String(i).padStart(2, '0') + '.txt'),
      'LIMITER\n'.repeat(14));
  const found = await search(root, 'LIMITER');
  assert.equal(found.results.length, 160);
  assert.equal(found.truncated, true);
  assert.ok(found.filesMatched <= 20);
});

test('rejeita pesquisas inválidas e opções não booleanas', async t => {
  const root = await fixture(t);
  for (const option of [
    null, {}, { query: 'x', caseSensitive: false },
    { query: 'abc\n', caseSensitive: false },
    { query: 'a'.repeat(121), caseSensitive: false },
    { query: 'texto', caseSensitive: 'false' }
  ]) await assert.rejects(searchWorkspaceText(root, option), /Busca inválida/);
});

test('criar arquivo sem sobrescrita permite salvar com revisão original', async t => {
  const root = await fixture(t);
  const created = await createWorkspaceFile(root, 'novo.js');
  assert.match(created.revision, /^[a-f0-9]{64}$/);
  assert.equal((await readProjectFile(root, 'novo.js')).content, '');
  await saveProjectFile(root, 'novo.js', 'console.log(42);', created.revision);
  await assert.rejects(createWorkspaceFile(root, 'novo.js'), /já existe/);
  assert.equal(await fs.readFile(path.join(root, 'novo.js'), 'utf8'), 'console.log(42);');
});

test('cria pastas em níveis existentes, não cria ancestrais implicitamente', async t => {
  const root = await fixture(t);
  await createWorkspaceFolder(root, 'scripts');
  await createWorkspaceFolder(root, 'scripts/testes');
  const created = await createWorkspaceFile(root, 'scripts/testes/novo.py');
  assert.equal(created.path, 'scripts/testes/novo.py');
  assert.ok((await fs.stat(path.join(root, 'scripts', 'testes', 'novo.py'))).isFile());
  await assert.rejects(createWorkspaceFolder(root, 'scripts'), /já existe/);
  await assert.rejects(createWorkspaceFile(root, 'inexistente/novo.py'), { code: 'ENOENT' });
});

test('bloqueia traversal, destinos absolutos e pastas técnicas', async t => {
  const root = await fixture(t);
  for (const bad of [
    '../outside', 'src/../evil', '.git/config', '.omniforge/data.json',
    'node_modules/foo', 'dist/novo.txt', '/tmp/file', 'C:/Windows/foo',
    'src\\bad', 'CON.txt', 'aux', 'name.', 'bad|name', 'src//index.js'
  ]) {
    await assert.rejects(createWorkspaceFile(root, bad), /Caminho|protegida|inválido/);
    await assert.rejects(createWorkspaceFolder(root, bad), /Caminho|protegida|inválido/);
  }
});

test('não cria arquivos ou pastas por symlink em diretório pai', async t => {
  const root = await fixture(t), ext = await fixture(t);
  try {
    await fs.symlink(ext, path.join(root, 'external'),
      process.platform === 'win32' ? 'junction' : 'dir');
  } catch (err) {
    if (err.code === 'EPERM') return t.skip('Runner sem permissão para symlink');
    throw err;
  }
  await assert.rejects(createWorkspaceFile(root, 'external/no.txt'), /seguro/);
  await assert.rejects(createWorkspaceFolder(root, 'external/nova'), /seguro/);
  assert.deepEqual(await fs.readdir(ext), []);
});
