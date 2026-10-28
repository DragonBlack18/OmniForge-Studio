import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomicWrite, makeTrustedDirectory, verifyWorkspace } from './workspace.mjs';

const ROOT_DIR = '.omniforge';
const HISTORY_DIR = 'run-history';
const MAX_RECORD_BYTES = 65_536;
const RECORD_FILENAME = /^\d{8}T\d{9}Z-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/i;

function safeMessage(message) {
  return String(message ?? '').replace(/https?:\/\/\S+/gi, '[URL ocultada]')
    .replace(/(token|secret|password|authorization|api[_-]?key)\s*[:=]\s*\S+/gi, '$1=[OCULTO]')
    .slice(0, 180);
}

async function existingHistoryDirectory(root) {
  const abs = await verifyWorkspace(root);
  let current = abs;
  for (const segment of [ROOT_DIR, HISTORY_DIR]) {
    current = path.join(current, segment);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Histórico local foi substituído por link ou arquivo.');
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }
  return current;
}

function toStoredRecord(result, id) {
  if (!result || typeof result !== 'object') throw new Error('Resultado de execução inválido.');
  const steps = Array.isArray(result.steps) ? result.steps.slice(0, 400).map(step => ({
    nodeId: safeMessage(step?.nodeId).slice(0, 80),
    type: safeMessage(step?.type).slice(0, 80),
    status: ['PASS', 'FAIL', 'SKIP'].includes(step?.status) ? step.status : 'FAIL',
    elapsedMs: Number.isFinite(step?.elapsedMs) ? Math.max(0, Math.floor(step.elapsedMs)) : 0,
    ...(step?.message ? { message: safeMessage(step.message) } : {})
  })) : [];
  return {
    schemaVersion: 1,
    id, timestamp: new Date().toISOString(),
    runId: typeof result.runId === 'string' ? result.runId.slice(0, 80) : null,
    ok: result.ok === true, dryRun: result.dryRun === true,
    partialSimulation: result.partialSimulation === true,
    stage: safeMessage(result.stage).slice(0, 60),
    steps,
    artifacts: Array.isArray(result.artifacts) ? result.artifacts.slice(0, 100).map(a => ({
      relativePath: safeMessage(a?.relativePath).slice(0, 200),
      simulated: a?.simulated === true,
      bytes: Number.isSafeInteger(a?.bytes) ? a.bytes : 0
    })) : [],
    ...(result.error ? { error: safeMessage(result.error) } : {}),
    errors: Array.isArray(result.errors) ? result.errors.slice(0, 30).map(safeMessage) : []
  };
}

/** Persists only execution metadata; never saves node inputs, outputs or credentials. */
export async function recordRunHistory(root, result) {
  const abs = await verifyWorkspace(root);
  const id = `${new Date().toISOString().replace(/[-:.]/g, '')}-${randomUUID()}.json`;
  const record = toStoredRecord(result, id);
  const data = JSON.stringify(record, null, 2) + '\n';
  if (Buffer.byteLength(data) > MAX_RECORD_BYTES) throw new Error('Registro de execução excede 64 kB.');
  const folder = await makeTrustedDirectory(abs, `${ROOT_DIR}/${HISTORY_DIR}`);
  const target = path.join(folder, id);
  // Unique UUID filenames plus a preflight check: no replacement of prior run data.
  try { await fs.lstat(target); throw new Error('Registro histórico já existe.'); }
  catch (err) { if (err.code !== 'ENOENT') throw err; }
  await atomicWrite(target, data);
  return { saved: true, id, relativePath: `${ROOT_DIR}/${HISTORY_DIR}/${id}` };
}

async function safelyReadRecord(root, id) {
  if (typeof id !== 'string' || !RECORD_FILENAME.test(id)) throw new Error('Identificador de histórico inválido.');
  const dir = await existingHistoryDirectory(root);
  if (!dir) throw new Error('Histórico ainda não existe.');
  const target = path.join(dir, id);
  const stat = await fs.lstat(target);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size > MAX_RECORD_BYTES) throw new Error('Arquivo de histórico inválido.');
  const record = JSON.parse(await fs.readFile(target, 'utf8'));
  if (record?.schemaVersion !== 1 || record?.id !== id || !Array.isArray(record?.steps)) throw new Error('Contrato de histórico inválido.');
  return record;
}

export async function readRunHistory(root, id) {
  return safelyReadRecord(root, id);
}

/** Newest first, no automatic deletion/pruning of existing history. */
export async function listRunHistory(root, { limit = 40 } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('Limite de histórico inválido.');
  const dir = await existingHistoryDirectory(root);
  if (!dir) return [];
  const files = (await fs.readdir(dir)).filter(name => RECORD_FILENAME.test(name)).sort().reverse().slice(0, limit);
  const output = [];
  for (const id of files) {
    try {
      const record = await safelyReadRecord(root, id);
      output.push({ id: record.id, timestamp: record.timestamp, ok: record.ok,
        dryRun: record.dryRun, partialSimulation: record.partialSimulation,
        stage: record.stage, stepCount: record.steps.length });
    } catch (err) {
      if (err.code !== 'ENOENT' && err.code !== 'EISDIR') {
        // Ignore a corrupt individual file, but never follow symlinks.
      }
    }
  }
  return output;
}
