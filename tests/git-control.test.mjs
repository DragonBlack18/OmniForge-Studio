import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  parseGitStatusZ, gitWorkspaceStatus, gitDiff, gitStage, gitUnstage, gitCommit
} from '../core/git-control.mjs';

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim();
}
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omni-git-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'OmniForge Test');
  git(root, 'config', 'user.email', 'test@example.invalid');
  return root;
}

test('porcelain -z preserves filenames with whitespace and rename metadata', () => {
  const items = parseGitStatusZ(' M pasta/área de teste.txt\0R  novo nome.txt\0antigo nome.txt\0?? arquivo novo.txt\0');
  assert.equal(items.length, 3);
  assert.equal(items[0].unstaged, true);
  assert.equal(items[1].oldPath, 'antigo nome.txt');
  assert.equal(items[1].staged, true);
  assert.equal(items[2].untracked, true);
  assert.throws(() => parseGitStatusZ(' M incompleto'), /inválida/);
});

test('Git absent from workspace: clear diagnostic, without creating a repo', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omni-not-git-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const status = await gitWorkspaceStatus(root);
  assert.equal(status.available, false);
  assert.match(status.reason, /repositório Git/);
  assert.deepEqual(await fs.readdir(root), []);
  await assert.rejects(gitStage(root, ['foo.txt']), /repositório/);
});

test('status, real stage, real commit, diff and unstaging preserve working files', async t => {
  const root = await fixture(t);
  const file = 'tarefa com espaço.txt';
  await fs.writeFile(path.join(root, file), 'primeiro\n');
  const initial = await gitWorkspaceStatus(root);
  assert.equal(initial.available, true);
  assert.equal(initial.files[0].path, file);
  assert.equal(initial.files[0].untracked, true);
  assert.equal((await gitStage(root, [file])).files[0].staged, true);
  assert.match((await gitDiff(root, file, true)).text, /\+primeiro/);
  const afterCommit = await gitCommit(root, 'feat: arquivo inicial');
  assert.equal(afterCommit.files.length, 0);
  assert.equal(afterCommit.commits[0].subject, 'feat: arquivo inicial');
  assert.equal(await fs.readFile(path.join(root, file), 'utf8'), 'primeiro\n');
  await fs.writeFile(path.join(root, file), 'primeiro\nsegundo\n');
  const dirty = await gitWorkspaceStatus(root);
  assert.equal(dirty.files[0].unstaged, true);
  assert.match((await gitDiff(root, file, false)).text, /\+segundo/);
  await gitStage(root, [file]);
  assert.equal((await gitUnstage(root, [file])).files[0].staged, false);
  assert.equal((await gitWorkspaceStatus(root)).files[0].unstaged, true);
  assert.equal(await fs.readFile(path.join(root, file), 'utf8'), 'primeiro\nsegundo\n');
});

test('unborn HEAD can unstage a new file without deleting its contents', async t => {
  const root = await fixture(t);
  await fs.writeFile(path.join(root, 'keep.txt'), 'não apagar');
  await gitStage(root, ['keep.txt']);
  const unstaged = await gitUnstage(root, ['keep.txt']);
  assert.equal(unstaged.files[0].untracked, true);
  assert.equal(await fs.readFile(path.join(root, 'keep.txt'), 'utf8'), 'não apagar');
});

test('invalid and stale path selections fail closed', async t => {
  const root = await fixture(t);
  await fs.writeFile(path.join(root, 'file.txt'), 'x');
  for (const bad of ['../outside', '.', '/etc/passwd', 'C:/secrets', '.git/config']) {
    await assert.rejects(gitStage(root, [bad]), /Caminho Git inválido/);
  }
  await assert.rejects(gitStage(root, ['not-in-status.txt']), /seleção mudou/);
  await assert.rejects(gitCommit(root, 'ok'), /mensagem/);
  await assert.rejects(gitCommit(root, 'valid message'), /Nenhum arquivo/);
  assert.equal((await gitWorkspaceStatus(root)).files[0].untracked, true);
});

test('Git subdirectory cannot inspect or mutate parent repository', async t => {
  const root = await fixture(t), sub = path.join(root, 'child');
  await fs.mkdir(sub);
  await fs.writeFile(path.join(root, 'root.txt'), 'preserve');
  const status = await gitWorkspaceStatus(sub);
  assert.equal(status.available, false);
  assert.match(status.reason, /raiz/);
  await assert.rejects(gitStage(sub, ['../root.txt']), /raiz/);
});

test('tracked rename is parsed and commit writes real Git history', async t => {
  const root = await fixture(t);
  await fs.writeFile(path.join(root, 'before.txt'), 'original');
  await gitStage(root, ['before.txt']);
  await gitCommit(root, 'initial tracked');
  git(root, 'mv', 'before.txt', 'after.txt');
  const status = await gitWorkspaceStatus(root);
  assert.equal(status.files[0].path, 'after.txt');
  assert.equal(status.files[0].oldPath, 'before.txt');
  const done = await gitCommit(root, 'rename tracked');
  assert.equal(done.files.length, 0);
  assert.equal(git(root, 'log', '-1', '--format=%s'), 'rename tracked');
  assert.equal(await fs.readFile(path.join(root, 'after.txt'), 'utf8'), 'original');
});
