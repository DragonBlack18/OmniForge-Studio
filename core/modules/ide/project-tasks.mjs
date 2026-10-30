/**
 * OmniForge Project Tasks v0.7.0.
 *
 * Local npm scripts selected from package.json, never arbitrary commands from
 * the renderer. A native Electron dialog must approve the exact script before
 * this runner is called. Not a sandbox: trusted project scripts can change
 * files, spawn processes or access the network.
 */
import fs from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { verifyWorkspace } from '../workspace/workspace.mjs';

const MAX_MANIFEST_BYTES = 160_000;
const MAX_SCRIPTS = 80;
const MAX_SCRIPT_BYTES = 1200;
const MAX_OUTPUT_BYTES = 96_000;
const MAX_SNAPSHOT_CHARS = 48_000;
const TASK_TIMEOUT_MS = 120_000;
const SCRIPT_NAME = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;

function validScripts(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj))
    throw new Error('Scripts do package.json precisam formar um objeto.');
  const scripts = Object.entries(obj);
  if (scripts.length > MAX_SCRIPTS)
    throw new Error('Este projeto excede o limite de 80 scripts.');
  return scripts.filter(([id, command]) =>
    SCRIPT_NAME.test(id) && typeof command === 'string' &&
    command.trim().length > 0 &&
    Buffer.byteLength(command) <= MAX_SCRIPT_BYTES &&
    !/[\u0000-\u001f\u007f]/.test(command) &&
    !/^(?:pre|post)(?:install|publish|pack|prepare)$/i.test(id))
    .map(([id, command]) => ({ id, command }));
}
async function readManifest(workspace) {
  const cwd = await verifyWorkspace(workspace);
  const file = path.join(cwd, 'package.json');
  let stat;
  try { stat = await fs.lstat(file); }
  catch (error) {
    if (error.code === 'ENOENT') {
      return { available:false, reason:'Não foi encontrado package.json no workspace.', scripts:[] };
    }
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 2 || stat.size > MAX_MANIFEST_BYTES)
    throw new Error('Manifesto inválido, link simbólico ou maior que 160 KB.');
  const content = await fs.readFile(file);
  if (content.length > MAX_MANIFEST_BYTES || content.includes(0))
    throw new Error('Manifesto inválido ou binário.');
  let parsed;
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal:true }).decode(content)); }
  catch { throw new Error('package.json não é JSON UTF-8 válido.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('package.json deve conter um objeto.');
  return {
    available:true, cwd,
    packageName:typeof parsed.name === 'string' ? parsed.name.slice(0,90) : path.basename(cwd),
    scripts:validScripts(parsed.scripts || {}),
    revision:createHash('sha256').update(content).digest('hex')
  };
}
export async function listProjectTasks(workspace) {
  const data = await readManifest(workspace);
  if (!data.available) return data;
  return { available:true, packageName:data.packageName,
    scripts:data.scripts, revision:data.revision };
}
export async function assertTaskSelection(workspace, id, revision) {
  if (typeof id !== 'string' || !SCRIPT_NAME.test(id) ||
      typeof revision !== 'string' || !/^[0-9a-f]{64}$/.test(revision))
    throw new Error('Seleção de tarefa inválida.');
  const manifest = await readManifest(workspace);
  if (!manifest.available) throw new Error(manifest.reason);
  if (manifest.revision !== revision)
    throw new Error('O package.json mudou. Atualize a lista e confirme a nova versão.');
  const found = manifest.scripts.find(item => item.id === id);
  if (!found) throw new Error('Este script não existe ou não é permitido.');
  return { ...found, workspace:manifest.cwd, revision:manifest.revision };
}

async function validFile(filename) {
  try { return (await fs.stat(filename)).isFile(); }
  catch { return false; }
}
/**
 * Resolve npm-cli.js next to Node.js instead of invoking npm.cmd or arbitrary
 * shell commands. Supports official Node Windows layouts and Unix npm installs.
 */
export async function findNpmToolchain({ environment = process.env, platform = process.platform } = {}) {
  const rawPath = environment.PATH || environment.Path || '';
  const binName = platform === 'win32' ? 'node.exe' : 'node';
  for (const folder of rawPath.split(path.delimiter).filter(Boolean)) {
    if (!path.isAbsolute(folder)) continue;
    const exe = path.join(folder, binName);
    if (!await validFile(exe)) continue;
    const real = await fs.realpath(exe).catch(() => exe);
    const locations = [
      path.join(folder, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
      path.join(path.dirname(real), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
      path.resolve(folder, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
      path.resolve(path.dirname(real), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
      path.resolve(folder, '..', 'node_modules', 'npm', 'bin', 'npm-cli.js')
    ];
    for (const npmCli of [...new Set(locations)]) {
      if (await validFile(npmCli)) return { node:exe, npmCli };
    }
  }
  throw new Error('Node.js e npm não encontrados no PATH do aplicativo. Instale Node.js LTS e reinicie o OmniForge.');
}
function safeEnvironment() {
  const permit = new Set(['PATH','SYSTEMROOT','WINDIR','TEMP','TMP','TMPDIR',
    'HOME','USERPROFILE','LOCALAPPDATA','APPDATA','LANG','TERM','COMSPEC']);
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (permit.has(key.toUpperCase()) && typeof value === 'string') env[key] = value;
  }
  env.npm_config_ignore_scripts = 'true';
  env.npm_config_update_notifier = 'false';
  env.npm_config_audit = 'false';
  env.CI = '1';
  return env;
}
function terminateTree(child, platform, reason) {
  if (!child || !Number.isInteger(child.pid)) return;
  if (platform === 'win32') {
    const systemRoot = process.env.SystemRoot || process.env.SYSTEMROOT || 'C:\\Windows';
    const killer = spawn(path.join(systemRoot, 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide:true, shell:false, stdio:'ignore'
    });
    killer.on('error', () => { try { child.kill('SIGKILL'); } catch {} });
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); }
    catch { try { child.kill('SIGKILL'); } catch {} }
  }
}

export class LocalProjectTaskRunner {
  constructor({ timeoutMs = TASK_TIMEOUT_MS, platform = process.platform,
    resolveToolchain = findNpmToolchain } = {}) {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > TASK_TIMEOUT_MS)
      throw new Error('Timeout da tarefa fora do limite.');
    this.timeoutMs = timeoutMs;
    this.platform = platform;
    this.resolveToolchain = resolveToolchain;
    this.current = null;
    this.child = null;
    this.launching = false;
    this.timer = null;
    this.outputBytes = 0;
    this.interruptedBy = null;
  }
  get isRunning() { return this.launching || this.current?.status === 'running'; }
  snapshot() { return this.current ? { ...this.current } : null; }
  async start({ workspace, id, revision, onEvent = () => {} }) {
    if (this.isRunning) throw new Error('Outra tarefa já está executando.');
    if (typeof onEvent !== 'function') throw new Error('Callback de tarefas inválido.');
    this.launching = true;
    try {
      const selection = await assertTaskSelection(workspace, id, revision);
      const tool = await this.resolveToolchain();
      // TOCTOU guard after toolchain discovery, before invoking external code.
      await assertTaskSelection(selection.workspace, id, revision);
      const state = {
        id:randomUUID(), name:id, command:selection.command,
        workspace:selection.workspace, status:'running',
        startedAt:new Date().toISOString(), finishedAt:null,
        exitCode:null, message:'', output:'', truncated:false
      };
      this.current = state;
      this.outputBytes = 0;
      this.interruptedBy = null;
      const child = spawn(tool.node, [tool.npmCli, '--ignore-scripts', 'run', id], {
        cwd:selection.workspace,
        env:safeEnvironment(),
        shell:false, windowsHide:true, detached:this.platform !== 'win32',
        stdio:['ignore','pipe','pipe']
      });
      this.child = child;
      const emit = (type, addition = '') => {
        try { onEvent({ type, id:state.id, chunk:addition,
          task:{ ...state, output:type === 'output' ? undefined : state.output } }); }
        catch { /* renderer listener may already be gone */ }
      };
      const write = data => {
        if (state.status !== 'running') return;
        const text = String(data);
        this.outputBytes += Buffer.byteLength(text);
        if (this.outputBytes > MAX_OUTPUT_BYTES) {
          state.truncated = true;
          this.cancel('output-limit');
          return;
        }
        state.output = (state.output + text).slice(-MAX_SNAPSHOT_CHARS);
        // Sending short output chunks avoids per-event megabyte IPC payloads.
        for (let i = 0; i < text.length; i += 2048)
          emit('output', text.slice(i,i + 2048));
      };
      child.stdout?.on('data', write);
      child.stderr?.on('data', write);
      child.once('error', error => {
        if (state.status !== 'running') return;
        state.message = error.code === 'ENOENT' ? 'Executável Node não encontrado.' :
          'Erro ao iniciar tarefa: ' + String(error.code || 'falha');
      });
      child.once('close', (code, signal) => {
        if (this.timer) { clearTimeout(this.timer); this.timer = null; }
        state.finishedAt = new Date().toISOString();
        state.exitCode = Number.isInteger(code) ? code : null;
        state.status = this.interruptedBy === 'timeout' ? 'timeout' :
          this.interruptedBy === 'output-limit' ? 'output-limit' :
          this.interruptedBy ? 'cancelled' :
          state.exitCode === 0 ? 'completed' : 'failed';
        state.message ||= state.status === 'completed' ? 'Script finalizado com sucesso.' :
          state.status === 'timeout' ? 'Tempo limite de 120 segundos excedido.' :
          state.status === 'output-limit' ? 'Saída maior que 96 KB; tarefa interrompida.' :
          state.status === 'cancelled' ? 'Cancelamento solicitado pelo usuário.' :
          'O script terminou com erro ou sinal: ' + String(signal ?? state.exitCode ?? 'desconhecido');
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
    if (this.current?.status !== 'running' || !this.child) return false;
    if (!this.interruptedBy) this.interruptedBy = reason;
    terminateTree(this.child,this.platform,reason);
    return true;
  }
}
