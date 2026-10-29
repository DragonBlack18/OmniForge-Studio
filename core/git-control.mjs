/**
 * Local Git adapter. Fixed Git subcommands, no shell, no network commands.
 * Workspaces must be repository roots; Git's own trust checks remain enabled.
 * Source control changes only the Git index and commits explicitly confirmed
 * by the user. No push/pull/reset/clean/checkout is exposed.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { verifyWorkspace } from './workspace.mjs';

const MAX_FILES = 400;
const MAX_SELECTED = 40;
const MAX_DIFF = 120_000;
const SAFE_MSG = /^[^\u0000-\u001f\u007f]{4,120}$/;
const windowsPath = p => process.platform === 'win32' ? path.normalize(p).toLowerCase() : path.normalize(p);

function runGit(cwd, args, { maxBuffer = 2_000_000, allowFailure = false } = {}) {
  const env = { ...process.env };
  // Avoid inherited GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE from the launcher:
  // the selected workspace, never an environment override, owns the index.
  for (const key of Object.keys(env)) if (/^GIT_/i.test(key)) delete env[key];
  env.GIT_TERMINAL_PROMPT = '0';
  env.GIT_PAGER = 'cat';
  return new Promise((resolve, reject) => {
    execFile('git', ['-c', 'core.fsmonitor=false', '-c', 'diff.external=', ...args], {
      cwd, env, timeout: 12_000, maxBuffer, windowsHide: true, encoding: 'utf8'
    }, (error, stdout) => {
      if (error) {
        if (allowFailure) return resolve({ ok: false, code: error.code, stdout: '' });
        if (error.code === 'ENOENT') return reject(new Error('Git CLI não instalado ou fora do PATH.'));
        return reject(new Error('O Git recusou a operação (' + String(error.code || 'erro') + '). Verifique o repositório e as permissões.'));
      }
      resolve({ ok: true, stdout });
    });
  });
}

async function requireGitRoot(root) {
  const cwd = await verifyWorkspace(root);
  const checked = await runGit(cwd, ['rev-parse', '--show-toplevel'], { allowFailure: true });
  if (!checked.ok) {
    if (checked.code === 'ENOENT') throw new Error('Git CLI não instalado ou fora do PATH.');
    throw new Error('Esta pasta não é um repositório Git inicializado.');
  }
  if (windowsPath(path.resolve(checked.stdout.trim())) !== windowsPath(cwd)) {
    throw new Error('Abra a raiz do repositório Git como workspace, sem acessar um repositório pai.');
  }
  return cwd;
}

export function parseGitStatusZ(stdout) {
  if (typeof stdout !== 'string' || (stdout && !stdout.endsWith('\0')))
    throw new Error('Resposta do Git inválida.');
  const fields = stdout ? stdout.slice(0, -1).split('\0') : [];
  const parsed = [];
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (field.length < 4 || field[2] !== ' ') throw new Error('Formato de status Git inválido.');
    const status = field.slice(0, 2);
    const filePath = field.slice(3);
    let oldPath = null;
    // porcelain=v1 -z uses destination then original for rename/copy entries.
    if (/[RC]/.test(status)) {
      oldPath = fields[++i];
      if (typeof oldPath !== 'string') throw new Error('Renomeação Git incompleta.');
    }
    parsed.push({
      path: filePath, oldPath, status,
      staged: status[0] !== ' ' && status[0] !== '?',
      unstaged: status[1] !== ' ' || status === '??',
      untracked: status === '??'
    });
  }
  return parsed;
}

async function scan(cwd) {
  const { stdout } = await runGit(cwd, ['-c', 'core.quotePath=false',
    'status', '--porcelain=v1', '-z', '--untracked-files=all']);
  const all = parseGitStatusZ(stdout);
  return { files: all.slice(0, MAX_FILES), truncated: all.length > MAX_FILES };
}

export async function gitWorkspaceStatus(root) {
  let cwd;
  try { cwd = await requireGitRoot(root); }
  catch (error) {
    return { available: false, reason: error.message, branch: null,
      head: null, files: [], commits: [], truncated: false };
  }
  const [{ files, truncated }, branch, head, history] = await Promise.all([
    scan(cwd),
    runGit(cwd, ['symbolic-ref', '--quiet', '--short', 'HEAD'], { allowFailure: true }),
    runGit(cwd, ['rev-parse', '--short=12', 'HEAD'], { allowFailure: true }),
    runGit(cwd, ['log', '-z', '-12', '--format=%h%x1f%s%x1f%aI'], { allowFailure: true })
  ]);
  const commits = history.ok ? history.stdout.split('\0').filter(Boolean).map(item => {
    const [hash, subject, date] = item.trimStart().split('\x1f');
    return { hash, subject: String(subject || '').slice(0, 200), date };
  }).filter(item => item.hash).slice(0, 12) : [];
  return {
    available: true, reason: null, branch: branch.ok ? branch.stdout.trim() : '(HEAD destacado)',
    head: head.ok ? head.stdout.trim() : null, files, truncated, commits
  };
}

function validatePath(input) {
  if (typeof input !== 'string' || input.length < 1 || input.length > 2048 ||
      input.startsWith('/') || input.startsWith('\\') ||
      input.includes('\0') || /[\r\n]/.test(input) ||
      input.includes('\\') || /^[A-Za-z]:/.test(input) ||
      input.split('/').some(segment => !segment || segment === '.' || segment === '..') ||
      input === '.git' || input.startsWith('.git/')) {
    throw new Error('Caminho Git inválido.');
  }
  return input;
}

async function selectedStatus(cwd, paths, mode) {
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > MAX_SELECTED)
    throw new Error('Selecione entre 1 e 40 arquivos.');
  const unique = [...new Set(paths.map(validatePath))];
  if (unique.length !== paths.length) throw new Error('Seleção contém caminhos repetidos.');
  const current = (await scan(cwd)).files;
  const records = unique.map(p => current.find(file => file.path === p));
  if (records.some(x => !x)) throw new Error('A seleção mudou; atualize o status Git.');
  if (mode === 'stage' && records.some(x => !x.unstaged))
    throw new Error('Selecione apenas arquivos ainda não preparados.');
  if (mode === 'unstage' && records.some(x => !x.staged))
    throw new Error('Selecione apenas arquivos preparados.');
  const args = [...unique];
  for (const entry of records) if (entry.oldPath) args.push(validatePath(entry.oldPath));
  return [...new Set(args)];
}

export async function gitDiff(root, relativePath, staged = false) {
  if (typeof staged !== 'boolean') throw new Error('Modo de diff inválido.');
  const cwd = await requireGitRoot(root);
  const relative = validatePath(relativePath);
  const current = (await scan(cwd)).files.find(item => item.path === relative);
  if (!current) throw new Error('Arquivo não está entre as alterações atuais.');
  if (current.untracked) return { text: 'Arquivo não rastreado. Prepare o arquivo para visualizar o diff indexado.', truncated: false };
  const args = ['diff', '--no-ext-diff', '--no-textconv', '--ignore-submodules=all',
    '--no-color'];
  if (staged) args.push('--cached');
  args.push('--', relative);
  if (current.oldPath) args.push(validatePath(current.oldPath));
  const result = await runGit(cwd, args, { maxBuffer: 400_000 });
  return { text: result.stdout.slice(0, MAX_DIFF) || 'Nenhuma diferença nessa versão do arquivo.',
    truncated: result.stdout.length > MAX_DIFF };
}

export async function gitStage(root, paths) {
  const cwd = await requireGitRoot(root);
  const safe = await selectedStatus(cwd, paths, 'stage');
  await runGit(cwd, ['add', '-A', '--', ...safe]);
  return gitWorkspaceStatus(cwd);
}

export async function gitUnstage(root, paths) {
  const cwd = await requireGitRoot(root);
  const safe = await selectedStatus(cwd, paths, 'unstage');
  const head = await runGit(cwd, ['rev-parse', '--verify', 'HEAD'], { allowFailure: true });
  // restore --staged changes only the index; for unborn HEAD rm --cached
  // is necessary and preserves the working-tree file.
  const args = head.ok ? ['restore', '--staged', '--', ...safe] :
    ['rm', '--cached', '-q', '--', ...safe];
  await runGit(cwd, args);
  return gitWorkspaceStatus(cwd);
}

export async function gitCommit(root, message) {
  if (typeof message !== 'string' || !SAFE_MSG.test(message.trim()) || message !== message.trim())
    throw new Error('Escreva uma mensagem de commit de 4 a 120 caracteres em uma linha.');
  const cwd = await requireGitRoot(root);
  const current = await scan(cwd);
  if (current.truncated) throw new Error('Há mais de 400 alterações. Revise o índice com Git antes de criar um commit.');
  if (!current.files.some(item => item.staged)) throw new Error('Nenhum arquivo preparado para commit.');
  // Always disable repository-defined hooks for this app-initiated commit;
  // executable hooks must never run silently from the UI.
  const hooks = await fs.mkdtemp(path.join(os.tmpdir(), 'omni-git-nohooks-'));
  try {
    await runGit(cwd, ['-c', 'core.hooksPath=' + hooks, 'commit', '--no-gpg-sign', '-m', message]);
  } finally {
    await fs.rm(hooks, { recursive: true, force: true });
  }
  return gitWorkspaceStatus(cwd);
}
