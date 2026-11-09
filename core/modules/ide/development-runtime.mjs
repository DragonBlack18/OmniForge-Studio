/**
 * Explicitly approved local Node/Python development tasks.
 *
 * This is a supervised process runner, NOT a security sandbox. Scripts keep
 * the user's OS permissions. The Electron adapter must approve the exact
 * revision, executable and argv before calling start(). No shell is exposed.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import { readProjectFile, verifyWorkspace } from '../workspace/workspace.mjs';

const EXTENSIONS = new Map([['.js', 'node'], ['.cjs', 'node'], ['.mjs', 'node'], ['.py', 'python']]);
const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', 'build', 'release', 'coverage', 'venv', '__pycache__']);
const ACTIONS = new Set(['run', 'check', 'test']);
const MAX_TARGETS = 300;
const MAX_VISITED = 4000;
const MAX_OUTPUT_BYTES = 96_000;
const MAX_SNAPSHOT_CHARS = 48_000;
const MAX_TIMEOUT_MS = 120_000;
const REVISION = /^[0-9a-f]{64}$/;

const PYTHON_CHECK = [
  'import ast, sys, tokenize',
  'with tokenize.open(sys.argv[1]) as source:',
  '    ast.parse(source.read(), filename=sys.argv[1])',
  'print("Sintaxe Python verificada.")'
].join('\n');
const PYTHON_TEST = [
  'import os, sys, unittest',
  'filename = os.path.abspath(sys.argv[1])',
  'directory = os.path.dirname(filename)',
  'sys.path.insert(0, os.getcwd())',
  'suite = unittest.defaultTestLoader.discover(directory, pattern=os.path.basename(filename))',
  'if suite.countTestCases() == 0:',
  '    print("Nenhum teste unittest encontrado no arquivo selecionado.", file=sys.stderr)',
  '    sys.exit(2)',
  'result = unittest.TextTestRunner(verbosity=2).run(suite)',
  'sys.exit(0 if result.wasSuccessful() else 1)'
].join('\n');

function assertRelativeFile(relative) {
  if (typeof relative !== 'string' || relative.length < 1 || relative.length > 500 ||
      /[\\:\u0000-\u001f\u007f]/.test(relative) || path.isAbsolute(relative) ||
      relative.split('/').some(part => !part || part === '.' || part === '..' || part.startsWith('.'))) {
    throw new Error('Selecione um arquivo de código dentro do workspace.');
  }
  const runtime = EXTENSIONS.get(path.extname(relative).toLowerCase());
  if (!runtime) throw new Error('Execução direta aceita .js, .cjs, .mjs e .py. Para TypeScript, use os scripts npm do projeto.');
  return runtime;
}

export function validateDevelopmentRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request) ||
      Object.keys(request).some(key => !['path', 'revision', 'action', 'args'].includes(key))) {
    throw new Error('Solicitação de desenvolvimento inválida.');
  }
  const runtime = assertRelativeFile(request.path);
  if (!ACTIONS.has(request.action) || typeof request.revision !== 'string' || !REVISION.test(request.revision)) {
    throw new Error('Ação ou revisão de arquivo inválida. Atualize a lista.');
  }
  const args = request.args ?? [];
  if (!Array.isArray(args) || args.length > 64 || args.some(value => typeof value !== 'string' ||
      Buffer.byteLength(value) > 2048 || value.includes('\0')) ||
      Buffer.byteLength(JSON.stringify(args)) > 16_000) {
    throw new Error('Argumentos inválidos: use até 64 valores de até 2 KB (16 KB no total), sem bytes nulos.');
  }
  if (request.action !== 'run' && args.length) {
    throw new Error('Argumentos são aceitos somente na ação Executar arquivo.');
  }
  return { path: request.path, revision: request.revision, action: request.action, args: [...args], runtime };
}

async function regularExecutable(filename, platform) {
  try {
    const resolved = await fs.realpath(filename);
    const info = await fs.stat(resolved);
    if (!info.isFile() || (platform !== 'win32' && (info.mode & 0o111) === 0)) return null;
    return resolved;
  } catch { return null; }
}

/** Discovery reads metadata only; it never runs a binary to inspect its version. */
export async function findDevelopmentToolchain(workspace, runtime, {
  environment = process.env, platform = process.platform
} = {}) {
  if (!['node', 'python'].includes(runtime)) throw new Error('Ambiente de execução desconhecido.');
  const root = await verifyWorkspace(workspace);
  const candidates = [];
  if (runtime === 'python') {
    for (const name of ['.venv', 'venv']) {
      const folder = path.join(root, name);
      const bin = path.join(folder, platform === 'win32' ? 'Scripts' : 'bin');
      try {
        const parentInfo = await fs.lstat(folder);
        const binInfo = await fs.lstat(bin);
        if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink() ||
            !binInfo.isDirectory() || binInfo.isSymbolicLink()) continue;
        candidates.push({ filename: path.join(bin, platform === 'win32' ? 'python.exe' : 'python'), source: name });
      } catch { /* no workspace virtual environment */ }
    }
  }
  const pathValue = Object.entries(environment).find(([key]) => key.toUpperCase() === 'PATH')?.[1] || '';
  const names = runtime === 'node' ? [platform === 'win32' ? 'node.exe' : 'node'] :
    platform === 'win32' ? ['python.exe', 'python3.exe'] : ['python3', 'python'];
  for (const folder of String(pathValue).split(platform === 'win32' ? ';' : ':')) {
    if (!path.isAbsolute(folder)) continue;
    // Windows Store alias stubs do not establish an installed interpreter.
    if (platform === 'win32' && /[\\/]Microsoft[\\/]WindowsApps(?:[\\/]|$)/i.test(folder)) continue;
    for (const name of names) candidates.push({ filename: path.join(folder, name), source: 'PATH' });
  }
  for (const candidate of candidates) {
    const canonical = await regularExecutable(candidate.filename, platform);
    if (canonical) {
      // Preserve a venv's invocation path: resolving its python symlink before
      // spawn would silently discard the virtual environment on POSIX systems.
      return { runtime, executable: candidate.filename, canonical, source: candidate.source };
    }
  }
  throw new Error(runtime === 'node' ?
    'Node.js não encontrado no PATH. Instale Node.js e reinicie o OmniForge.' :
    'Python não encontrado. Use .venv/venv no projeto ou instale Python no PATH e reinicie o OmniForge.');
}

export async function listDevelopmentTargets(workspace, { resolveToolchain = findDevelopmentToolchain } = {}) {
  const root = await verifyWorkspace(workspace);
  const targets = [];
  let visited = 0, truncated = false, skipped = 0;
  async function walk(directory, relative, depth) {
    if (depth > 8) { truncated = true; return; }
    // opendir bounds memory even when one folder contains millions of files.
    const entries = [];
    for await (const entry of await fs.opendir(directory)) {
      if (entries.length + visited >= MAX_VISITED) { truncated = true; break; }
      entries.push(entry);
    }
    entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));
    for (const entry of entries) {
      if (++visited > MAX_VISITED || targets.length >= MAX_TARGETS) { truncated = true; return; }
      if (entry.isSymbolicLink() || entry.name.startsWith('.') || SKIP_DIRECTORIES.has(entry.name)) continue;
      const relativePath = relative ? relative + '/' + entry.name : entry.name;
      if (entry.isDirectory()) {
        await walk(path.join(directory, entry.name), relativePath, depth + 1);
      } else if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        try {
          const runtime = assertRelativeFile(relativePath);
          const document = await readProjectFile(root, relativePath);
          targets.push({ path: relativePath, runtime, revision: document.revision });
        } catch { skipped++; /* unreadable/large/binary/raced source never becomes runnable */ }
      }
      if (visited > MAX_VISITED || targets.length >= MAX_TARGETS) { truncated = true; return; }
    }
  }
  await walk(root, '', 0);
  const runtimes = {};
  for (const runtime of ['node', 'python']) {
    try { runtimes[runtime] = { available: true, ...await resolveToolchain(root, runtime) }; }
    catch (error) { runtimes[runtime] = { available: false, message: error.message }; }
  }
  return { workspace: root, targets, runtimes, truncated, skipped };
}

function childEnvironment(environment = process.env) {
  const permitted = new Set(['PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'HOME',
    'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'LANG', 'LC_ALL', 'TERM', 'COMSPEC']);
  const env = {};
  for (const [key, value] of Object.entries(environment)) {
    if (permitted.has(key.toUpperCase()) && typeof value === 'string') env[key] = value;
  }
  return { ...env, PYTHONUTF8: '1', PYTHONUNBUFFERED: '1', PYTHONDONTWRITEBYTECODE: '1', PYTHONNOUSERSITE: '1', NO_COLOR: '1' };
}

export async function prepareDevelopmentTask(workspace, request, { resolveToolchain = findDevelopmentToolchain } = {}) {
  const selection = validateDevelopmentRequest(request);
  const root = await verifyWorkspace(workspace);
  const document = await readProjectFile(root, selection.path);
  if (document.revision !== selection.revision) {
    throw new Error('O arquivo mudou no disco. Salve suas edições, atualize a lista e confirme a nova versão.');
  }
  const toolchain = await resolveToolchain(root, selection.runtime);
  if (!toolchain || typeof toolchain.executable !== 'string' || !path.isAbsolute(toolchain.executable)) {
    throw new Error('O executável do ambiente deve ter um caminho absoluto.');
  }
  const filename = path.join(root, ...selection.path.split('/'));
  let argv;
  if (selection.runtime === 'node') {
    argv = selection.action === 'check' ? ['--check', filename] :
      selection.action === 'test' ? ['--test', filename] : [filename, ...selection.args];
  } else {
    argv = selection.action === 'check' ? ['-I', '-S', '-B', '-c', PYTHON_CHECK, filename] :
      selection.action === 'test' ? ['-I', '-B', '-u', '-c', PYTHON_TEST, filename] :
        ['-B', '-u', filename, ...selection.args];
  }
  // Discovery can await filesystem IO; pin source again before presenting a
  // native approval. start() repeats the check after approval.
  if ((await readProjectFile(root, selection.path)).revision !== selection.revision) {
    throw new Error('O arquivo mudou durante a preparação. Atualize a lista.');
  }
  return { ...selection, workspace: root, executable: toolchain.executable,
    toolchain: toolchain.source, canonicalExecutable: toolchain.canonical || toolchain.executable, argv };
}

function killProcessTree(child, platform) {
  if (!Number.isInteger(child?.pid)) return;
  if (platform === 'win32') {
    const systemRoot = process.env.SystemRoot || process.env.SYSTEMROOT || 'C:\\Windows';
    const killer = spawn(path.join(systemRoot, 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], {
      shell: false, windowsHide: true, stdio: 'ignore'
    });
    const fallback = () => { try { child.kill('SIGKILL'); } catch {} };
    killer.once('error', fallback);
    killer.once('close', code => { if (code !== 0) fallback(); });
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); }
    catch { try { child.kill('SIGKILL'); } catch {} }
  }
}

export class LocalDevelopmentRunner {
  constructor({ timeoutMs = MAX_TIMEOUT_MS, platform = process.platform,
    resolveToolchain = findDevelopmentToolchain } = {}) {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > MAX_TIMEOUT_MS) {
      throw new Error('Timeout de desenvolvimento fora do limite.');
    }
    this.timeoutMs = timeoutMs;
    this.platform = platform;
    this.resolveToolchain = resolveToolchain;
    this.current = null;
    this.child = null;
    this.timer = null;
    this.launching = false;
    this.launchCancelled = false;
    this.interruptedBy = null;
  }
  get isRunning() { return this.launching || this.current?.status === 'running'; }
  snapshot() { return this.current ? { ...this.current, args: [...this.current.args] } : null; }
  async start({ workspace, request, approvedExecutable, approvedCanonicalExecutable, onEvent = () => {} }) {
    if (this.isRunning) throw new Error('Outra execução de desenvolvimento já está em andamento.');
    if (typeof onEvent !== 'function') throw new Error('Callback de desenvolvimento inválido.');
    this.launching = true;
    this.launchCancelled = false;
    try {
      const plan = await prepareDevelopmentTask(workspace, request, { resolveToolchain: this.resolveToolchain });
      if (this.launchCancelled) throw new Error('Execução cancelada antes de iniciar o processo.');
      if (approvedExecutable !== undefined && (plan.executable !== approvedExecutable ||
          (approvedCanonicalExecutable !== undefined && plan.canonicalExecutable !== approvedCanonicalExecutable))) {
        throw new Error('O ambiente de execução mudou após a confirmação. Confirme novamente.');
      }
      const state = { id: randomUUID(), workspace: plan.workspace, path: plan.path, runtime: plan.runtime,
        action: plan.action, args: [...plan.args], executable: plan.executable, status: 'running',
        revision: plan.revision, startedAt: new Date().toISOString(), finishedAt: null,
        exitCode: null, message: '', output: '', truncated: false, sequence: 0 };
      this.current = state;
      this.interruptedBy = null;
      let outputBytes = 0;
      const child = spawn(plan.executable, plan.argv, { cwd: plan.workspace, env: childEnvironment(),
        shell: false, windowsHide: true, detached: this.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
      this.child = child;
      const emit = (type, chunk = '', stream = null) => {
        state.sequence++;
        try { onEvent({ type, id: state.id, chunk, stream,
          task: { ...state, args: [...state.args], output: type === 'output' ? undefined : state.output } }); }
        catch { /* renderer may have closed; supervision stays active */ }
      };
      const append = (text, stream) => {
        if (!text || state.status !== 'running' || this.interruptedBy) return;
        state.output = (state.output + text).slice(-MAX_SNAPSHOT_CHARS);
        for (let index = 0; index < text.length; index += 2048) emit('output', text.slice(index, index + 2048), stream);
      };
      for (const [stream, pipe] of [['stdout', child.stdout], ['stderr', child.stderr]]) {
        const decoder = new StringDecoder('utf8');
        pipe?.on('data', data => {
          if (this.interruptedBy) return;
          outputBytes += data.length;
          if (outputBytes > MAX_OUTPUT_BYTES) { state.truncated = true; this.cancel('output-limit'); return; }
          append(decoder.write(data), stream);
        });
        pipe?.once('end', () => append(decoder.end(), stream));
      }
      child.once('error', error => {
        state.message = 'Não foi possível iniciar ' + (plan.runtime === 'python' ? 'Python' : 'Node.js') +
          ': ' + String(error.code || 'falha local') + '.';
      });
      child.once('close', (code, signal) => {
        clearTimeout(this.timer); this.timer = null;
        state.finishedAt = new Date().toISOString();
        state.exitCode = Number.isInteger(code) ? code : null;
        state.status = this.interruptedBy || (code === 0 ? 'completed' : 'failed');
        state.message ||= state.status === 'completed' ?
          (plan.action === 'check' ? 'Sintaxe verificada com sucesso.' : plan.action === 'test' ? 'Testes concluídos com sucesso.' : 'Arquivo executado com sucesso.') :
          state.status === 'timeout' ? 'Tempo limite de ' + this.timeoutMs / 1000 + ' segundos excedido.' :
          state.status === 'output-limit' ? 'Saída maior que 96 KB. Processo interrompido.' :
          state.status === 'cancelled' ? 'Execução interrompida.' :
          'A execução terminou com erro: ' + String(signal ?? state.exitCode ?? 'desconhecido') + '.';
        this.child = null;
        emit('finished');
      });
      this.timer = setTimeout(() => this.cancel('timeout'), this.timeoutMs);
      this.timer.unref?.();
      emit('started');
      return this.snapshot();
    } finally { this.launching = false; }
  }
  cancel(reason = 'cancelled') {
    if (!['cancelled', 'timeout', 'output-limit'].includes(reason)) throw new Error('Motivo de cancelamento inválido.');
    if (this.launching && !this.child) { this.launchCancelled = true; return true; }
    if (this.current?.status !== 'running' || !this.child) return false;
    if (!this.interruptedBy) { this.interruptedBy = reason; killProcessTree(this.child, this.platform); }
    return true;
  }
}
