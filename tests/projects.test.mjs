import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inspectProject, registerProject, listProjects, getProject, forgetProject, markProjectOpened } from '../core/projects.mjs';

async function setup(t) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'omniforge-projects-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const data = path.join(home, 'app-data');
  const a = path.join(home, 'app-a');
  const b = path.join(home, 'app-b');
  await fs.mkdir(data); await fs.mkdir(a); await fs.mkdir(b);
  return { home, data, a, b };
}

test('registro e inspeção de Node sem modificar arquivos do projeto', async t => {
  const { data, a } = await setup(t);
  const file = path.join(a, 'package.json');
  const content = '{"name":"minha-interface","devDependencies":{"electron":"45"}}';
  await fs.writeFile(file, content);
  const before = await fs.readdir(a);
  const item = await registerProject(data, a);
  assert.equal(item.kind, 'Electron / Node.js'); assert.equal(item.label, 'minha-interface');
  assert.equal(item.available, true); assert.equal(item.alreadyRegistered, false);
  assert.deepEqual(await fs.readdir(a), before);
  assert.equal(await fs.readFile(file, 'utf8'), content);
  assert.equal((await listProjects(data)).length, 1);
});

test('duas pastas, IDs estáveis, mudança de lastOpened e cadastro idempotente', async t => {
  const { data, a, b } = await setup(t);
  await fs.writeFile(path.join(b, 'go.mod'), 'module exemplo');
  const x = await registerProject(data, a), y = await registerProject(data, b);
  assert.notEqual(x.id, y.id); assert.equal(y.kind, 'Go');
  assert.equal((await registerProject(data, a)).id, x.id);
  assert.equal((await listProjects(data)).length, 2);
  await markProjectOpened(data, y.id);
  assert.ok((await getProject(data, y.id)).lastOpenedAt);
});

test('remoção do catálogo não elimina diretórios nem dados registrados', async t => {
  const { data, a, b } = await setup(t);
  await fs.writeFile(path.join(a, 'important.txt'), 'não excluir');
  const x = await registerProject(data, a);
  const y = await registerProject(data, b);
  await forgetProject(data, x.id);
  assert.deepEqual((await listProjects(data)).map(item => item.id), [y.id]);
  assert.equal(await fs.readFile(path.join(a, 'important.txt'), 'utf8'), 'não excluir');
  await assert.rejects(getProject(data, x.id), /não encontrado/);
});

test('registros offline são visíveis e não apagados', async t => {
  const { data, a } = await setup(t);
  const x = await registerProject(data, a);
  await fs.rename(a, `${a}-offline`);
  const [offline] = await listProjects(data);
  assert.equal(offline.id, x.id); assert.equal(offline.available, false);
  await assert.rejects(getProject(data, x.id));
});

test('catálogo se recupera após reinício sem escrita no projeto', async t => {
  const { data, a } = await setup(t);
  const first = await registerProject(data, a);
  const loaded = await listProjects(data);
  assert.equal(loaded[0].id, first.id);
  assert.equal((await fs.readdir(a)).length, 0);
});

test('symlink de projeto e de manifesto nunca são percorridos', async t => {
  const { data, a, home } = await setup(t);
  const alias = path.join(home, 'alias');
  await fs.symlink(a, alias, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(registerProject(data, alias), /links/);
  await fs.symlink(path.join(home, 'secret.json'), path.join(a, 'package.json'), 'file');
  assert.equal((await inspectProject(a)).kind, 'Pasta / genérico');
});

test('catálogo como link ou arquivo corrompido é bloqueado, não sobrescrito', async t => {
  const { data, a, home } = await setup(t);
  const folder = path.join(data, 'project-catalog');
  await fs.mkdir(folder); await fs.writeFile(path.join(folder, 'projects.json'), '{broken');
  await assert.rejects(registerProject(data, a), SyntaxError);
  await fs.rm(path.join(folder, 'projects.json'));
  const secret = path.join(home, 'secret.txt'); await fs.writeFile(secret, 'mantenha');
  await fs.symlink(secret, path.join(folder, 'projects.json'), 'file');
  await assert.rejects(registerProject(data, a), /inseguro/);
  assert.equal(await fs.readFile(secret, 'utf8'), 'mantenha');
});

test('identificadores arbitrários são rejeitados e não afetam catálogo', async t => {
  const { data, a } = await setup(t);
  await registerProject(data, a);
  await assert.rejects(forgetProject(data, '../anything'), /inválido/);
  await assert.rejects(markProjectOpened(data, 'x'), /inválido/);
  assert.equal((await listProjects(data)).length, 1);
});
