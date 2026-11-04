/**
 * v0.7.4 - crash recovery for CAD sketches, isolated from IDE and workflows.
 * A checkpoint lives ONLY in Electron userData. It cannot modify the project
 * CAD document; the explicit saveCadDocument path owns that operation.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { atomicWrite, verifyWorkspace } from '../workspace/workspace.mjs';
import { loadCadDocument } from './cad-store.mjs';
import { validateCadSketch } from './cad2d.mjs';

const FOLDER = 'cad-recovery';
const MAX_SKETCH_BYTES = 1_500_000;
const MAX_RECORD_BYTES = 1_600_000;
const MAX_CHECKPOINTS = 20;
const HASH = /^[a-f0-9]{64}$/;
const FILE = /^[a-f0-9]{64}\.json$/;
const locks = new Map();
const digest = data => createHash('sha256').update(data).digest('hex');

function validRevision(value, nullable = false) {
  return (nullable && value === null) || (typeof value === 'string' && HASH.test(value));
}

async function profileDirectory(userData) {
  if (typeof userData !== 'string' || !path.isAbsolute(userData))
    throw new Error('Perfil CAD de recuperação inválido.');
  const stat = await fs.lstat(userData);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error('Perfil CAD de recuperação inseguro.');
  return fs.realpath(userData);
}

async function locate(userData, workspace, create = false) {
  const root = await verifyWorkspace(workspace);
  const profile = await profileDirectory(userData);
  const folder = path.join(profile, FOLDER);
  try {
    const stat = await fs.lstat(folder);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error('Pasta de recuperação CAD insegura.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (!create) return { file: null, folder };
    try { await fs.mkdir(folder, { mode: 0o700 }); }
    catch (e) { if (e.code !== 'EEXIST') throw e; }
    const stat = await fs.lstat(folder);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error('Pasta de recuperação CAD insegura.');
  }
  const key = process.platform === 'win32' ? root.toLowerCase() : root;
  return { file: path.join(folder, digest(key) + '.json'), folder };
}

async function readRecord(file) {
  if (!file) return null;
  let stat;
  try { stat = await fs.lstat(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_RECORD_BYTES)
    throw new Error('Rascunho CAD inseguro ou maior que o limite.');
  const raw = await fs.readFile(file);
  if (raw.byteLength > MAX_RECORD_BYTES || raw.includes(0))
    throw new Error('Rascunho CAD com conteúdo inválido.');
  let record;
  try { record = JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(raw)); }
  catch { throw new Error('Rascunho CAD corrompido; arquivo preservado.'); }
  if (!record || record.schemaVersion !== 1 || !validRevision(record.baseRevision, true) ||
      typeof record.savedAt !== 'string' || !Number.isFinite(Date.parse(record.savedAt)) ||
      Object.keys(record).sort().join(',') !== 'baseRevision,savedAt,schemaVersion,sketch')
    throw new Error('Contrato de recuperação CAD inválido; rascunho preservado.');
  try { validateCadSketch(record.sketch); }
  catch { throw new Error('Geometria de recuperação CAD inválida; rascunho preservado.'); }
  if (Buffer.byteLength(JSON.stringify(record.sketch)) > MAX_SKETCH_BYTES)
    throw new Error('Rascunho CAD excede 1,5 MB.');
  return { ...record, draftRevision: digest(raw) };
}

// A profile-wide gate serializes quotas and optimistic concurrency across all
// workspaces within this Electron main process. It does not delete old drafts.
async function serial(folder, operation) {
  const previous = locks.get(folder) || Promise.resolve();
  let release;
  const next = new Promise(resolve => { release = resolve; });
  locks.set(folder, next);
  await previous;
  try { return await operation(); }
  finally {
    release();
    if (locks.get(folder) === next) locks.delete(folder);
  }
}

export async function readCadDraft(userData, workspace) {
  const { file } = await locate(userData, workspace);
  return readRecord(file);
}

export async function writeCadDraft(userData, workspace, sketch, baseRevision, expectedDraftRevision) {
  if (!validRevision(baseRevision, true) || !validRevision(expectedDraftRevision, true))
    throw new Error('Token de revisão CAD inválido.');
  validateCadSketch(sketch);
  const encoded = JSON.stringify(sketch);
  if (Buffer.byteLength(encoded) > MAX_SKETCH_BYTES)
    throw new Error('Desenho CAD excede 1,5 MB.');
  const { file, folder } = await locate(userData, workspace, true);
  return serial(folder, async () => {
    const previous = await readRecord(file);
    if ((previous?.draftRevision ?? null) !== expectedDraftRevision)
      throw new Error('Rascunho CAD alterado por outra sessão; reabra antes de continuar.');
    const original = await loadCadDocument(workspace);
    if (original.revision !== baseRevision)
      throw new Error('Desenho CAD alterado fora do editor; rascunho anterior preservado.');
    if (!previous) {
      const names = (await fs.readdir(folder)).filter(name => FILE.test(name));
      if (names.length >= MAX_CHECKPOINTS)
        throw new Error('Limite de 20 desenhos CAD recuperáveis atingido.');
    }
    const savedAt = new Date().toISOString();
    const body = JSON.stringify({ schemaVersion: 1, baseRevision, sketch, savedAt }) + '\n';
    if (Buffer.byteLength(body) > MAX_RECORD_BYTES)
      throw new Error('Limite de armazenamento CAD excedido.');
    await atomicWrite(file, body, 0o600);
    return { savedAt, draftRevision: digest(body) };
  });
}

export async function discardCadDraft(userData, workspace, expectedDraftRevision) {
  if (!validRevision(expectedDraftRevision))
    throw new Error('Token do rascunho CAD inválido.');
  const { file, folder } = await locate(userData, workspace);
  if (!file) return false;
  return serial(folder, async () => {
    const record = await readRecord(file);
    if (!record) return false;
    if (record.draftRevision !== expectedDraftRevision)
      throw new Error('Rascunho CAD atualizado por outra sessão; exclusão bloqueada.');
    await fs.unlink(file);
    return true;
  });
}
