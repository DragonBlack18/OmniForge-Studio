/**
 * Bounded, metadata-only history for trusted local project tasks.
 *
 * No npm command, stdout/stderr, environment, user path or credential is
 * persisted. Records are scoped to the canonical workspace by SHA-256.
 * Keep this store independent of automation, CAD and IDE renderer code.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { atomicWrite, verifyWorkspace } from '../workspace/workspace.mjs';

const DIRECTORY = 'project-task-history';
const MAX_RECORDS = 60;
const MAX_FILE_BYTES = 65_536;
const FINAL_STATES = new Set(['completed', 'failed', 'cancelled', 'timeout', 'output-limit']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SCRIPT = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const locks = new Map();

async function checkedRoot(userData) {
  if (typeof userData !== 'string' || !path.isAbsolute(userData)) {
    throw new Error('Perfil local inválido para histórico de tarefas.');
  }
  const root = path.resolve(userData);
  const stat = await fs.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('Perfil local não é um diretório seguro.');
  }
  return root;
}

async function historyFile(userData, workspace, create) {
  const root = await checkedRoot(userData);
  const canonical = await verifyWorkspace(workspace);
  const fingerprint = createHash('sha256')
    .update(process.platform === 'win32' ? canonical.toLowerCase() : canonical)
    .digest('hex');
  const folder = path.join(root, DIRECTORY);
  try {
    const stat = await fs.lstat(folder);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error('Diretório de histórico inseguro: link simbólico ou arquivo.');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (!create) return null;
    try { await fs.mkdir(folder, { mode: 0o700 }); }
    catch (err) { if (err.code !== 'EEXIST') throw err; }
    const stat = await fs.lstat(folder);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error('Diretório de histórico inseguro após criação.');
    }
  }
  return path.join(folder, fingerprint + '.json');
}

function validEntry(item) {
  return item && typeof item === 'object' && !Array.isArray(item) &&
    UUID.test(item.id) && SCRIPT.test(item.name) && FINAL_STATES.has(item.status) &&
    Number.isSafeInteger(item.durationMs) && item.durationMs >= 0 &&
    (item.exitCode === null || Number.isSafeInteger(item.exitCode)) &&
    typeof item.startedAt === 'string' && Number.isFinite(Date.parse(item.startedAt)) &&
    typeof item.finishedAt === 'string' && Number.isFinite(Date.parse(item.finishedAt)) &&
    typeof item.truncated === 'boolean';
}

async function readStore(file) {
  if (!file) return { schemaVersion:1, records:[] };
  let stat;
  try { stat = await fs.lstat(file); }
  catch (error) {
    if (error.code === 'ENOENT') return { schemaVersion:1, records:[] };
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_FILE_BYTES) {
    throw new Error('Histórico de tarefas inseguro ou maior que 64 KB.');
  }
  let store;
  try { store = JSON.parse(await fs.readFile(file, 'utf8')); }
  catch { throw new Error('Histórico de tarefas corrompido. Nenhuma gravação foi feita.'); }
  if (store?.schemaVersion !== 1 || !Array.isArray(store.records) ||
      store.records.length > MAX_RECORDS || !store.records.every(validEntry)) {
    throw new Error('Contrato do histórico de tarefas inválido. Dados preservados.');
  }
  return store;
}

function newEntry(task) {
  if (!task || typeof task !== 'object' || !validEntry({
    id:task.id, name:task.name, status:task.status, startedAt:task.startedAt,
    finishedAt:task.finishedAt, exitCode:task.exitCode,
    truncated:task.truncated === true, durationMs:0
  })) throw new Error('Resultado de tarefa inválido para persistência.');
  const started = Date.parse(task.startedAt);
  const finished = Date.parse(task.finishedAt);
  if (finished < started) throw new Error('Datas inconsistentes no histórico de tarefa.');
  return Object.freeze({
    id:task.id, name:task.name, status:task.status,
    startedAt:new Date(started).toISOString(),
    finishedAt:new Date(finished).toISOString(),
    durationMs:Math.min(86_400_000, finished - started),
    exitCode:task.exitCode, truncated:task.truncated === true
  });
}

async function serial(file, callback) {
  const predecessor = locks.get(file) || Promise.resolve();
  let unlock;
  const current = new Promise(resolve => { unlock = resolve; });
  locks.set(file, current);
  await predecessor;
  try { return await callback(); }
  finally {
    unlock();
    if (locks.get(file) === current) locks.delete(file);
  }
}

/** Last 60 finalized tasks for this workspace; no log bodies, no side effects. */
export async function listProjectTaskHistory(userData, workspace, { limit = 30 } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_RECORDS) {
    throw new Error('Limite de histórico de tarefas inválido.');
  }
  const file = await historyFile(userData, workspace, false);
  const store = await readStore(file);
  return store.records.slice(0, limit).map(entry => ({ ...entry }));
}

/**
 * Serialize writes and atomically retain the latest 60 metadata-only entries.
 * Existing corrupt or symlinked storage is NEVER overwritten or reset.
 */
export async function recordProjectTaskHistory(userData, task) {
  const entry = newEntry(task);
  const file = await historyFile(userData, task.workspace, true);
  return serial(file, async () => {
    const previous = await readStore(file);
    if (previous.records.some(item => item.id === entry.id)) return entry;
    const records = [entry, ...previous.records].slice(0, MAX_RECORDS);
    const body = JSON.stringify({ schemaVersion:1, records }, null, 2) + '\n';
    if (Buffer.byteLength(body) > MAX_FILE_BYTES) {
      throw new Error('Histórico de tarefas excedeu o limite de 64 KB.');
    }
    // Validate the destination again before atomic replace: don't follow links.
    try {
      const stat = await fs.lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new Error('Arquivo de histórico substituído por link ou diretório.');
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await atomicWrite(file, body);
    return entry;
  });
}
