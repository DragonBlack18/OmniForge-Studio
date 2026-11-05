/** v0.7.9 — encrypted, bounded recovery checkpoints, NEVER the executable flow. */
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { getNodeDefinition } from './catalog.mjs';
import { atomicWrite, verifyWorkspace, readFlowDocument } from '../workspace/workspace.mjs';

const MAGIC = Buffer.from('OFLOW1\n');
const HASH = /^[a-f0-9]{64}$/;
const FILE = /^[a-f0-9]{64}\.oflow$/;
const ID = /^[A-Za-z0-9_:.-]{1,160}$/;
const MAX_FLOW = 2_000_000;
const MAX_FILE = 2_100_000;
const MAX_DRAFTS = 20;
const locks = new Map();
const digest = data => createHash('sha256').update(data).digest('hex');
const revision = token => token === null || (typeof token === 'string' && HASH.test(token));
const object = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

/** An unfinished graph need not be executable, but must be bounded and coherent. */
export function assertRecoverableFlow(flow) {
  if (!object(flow) || flow.schemaVersion !== 1 || typeof flow.name !== 'string' || flow.name.length > 100 ||
      !Array.isArray(flow.nodes) || flow.nodes.length > 400 || !Array.isArray(flow.edges) || flow.edges.length > 800)
    throw new Error('Contrato do rascunho de fluxo inválido.');
  const nodes = new Set(), edges = new Set();
  for (const n of flow.nodes) {
    if (!object(n) || typeof n.id !== 'string' || !ID.test(n.id) || nodes.has(n.id) ||
        typeof n.type !== 'string' || !ID.test(n.type) || !getNodeDefinition(n.type) || !object(n.position) ||
        !Number.isFinite(n.position.x) || !Number.isFinite(n.position.y) ||
        Math.abs(n.position.x) > 1_000_000 || Math.abs(n.position.y) > 1_000_000 || !object(n.config))
      throw new Error('Bloco inválido no rascunho de fluxo.');
    nodes.add(n.id);
  }
  for (const e of flow.edges) {
    if (!object(e) || typeof e.id !== 'string' || !ID.test(e.id) || edges.has(e.id) ||
        !nodes.has(e.source) || !nodes.has(e.target) ||
        ['sourceHandle','targetHandle'].some(k => e[k] != null && (typeof e[k] !== 'string' || !ID.test(e[k]))))
      throw new Error('Conexão inválida no rascunho de fluxo.');
    edges.add(e.id);
  }
  let encoded;
  try { encoded = JSON.stringify(flow); } catch { throw new Error('Rascunho não serializável.'); }
  if (Buffer.byteLength(encoded) > MAX_FLOW) throw new Error('Rascunho de fluxo excede 2 MB.');
  return encoded;
}

async function locate(profile, workspace, create = false) {
  const root = await verifyWorkspace(workspace);
  if (typeof profile !== 'string' || !path.isAbsolute(profile)) throw new Error('Perfil de recuperação inválido.');
  const info = await fs.lstat(profile);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Perfil de recuperação inseguro.');
  const home = await fs.realpath(profile), folder = path.join(home, 'flow-recovery');
  try {
    const stat = await fs.lstat(folder);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Pasta de recuperação insegura.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (create) {
      try { await fs.mkdir(folder, { mode: 0o700 }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
      const stat = await fs.lstat(folder);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Pasta de recuperação insegura.');
    }
  }
  const workspaceKey = digest(process.platform === 'win32' ? root.toLowerCase() : root);
  return { root, folder, workspaceKey, file: path.join(folder, workspaceKey + '.oflow') };
}
async function serial(key, operation) {
  const previous = locks.get(key) || Promise.resolve();
  let release;
  const next = new Promise(resolve => { release = resolve; });
  locks.set(key, next);
  await previous;
  try { return await operation(); }
  finally { release(); if (locks.get(key) === next) locks.delete(key); }
}
async function readRecord(location, codec) {
  let info;
  try { info = await fs.lstat(location.file); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > MAX_FILE)
    throw new Error('Rascunho inseguro ou maior que o limite; preservado.');
  const handle = await fs.open(location.file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  let bytes;
  try {
    const current = await handle.stat();
    if (!current.isFile() || current.nlink !== 1 || current.size > MAX_FILE)
      throw new Error('Rascunho inseguro; preservado.');
    const buffer = Buffer.alloc(MAX_FILE + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, null);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    bytes = buffer.subarray(0, offset);
  } finally { await handle.close(); }
  if (bytes.length > MAX_FILE || !bytes.subarray(0, MAGIC.length).equals(MAGIC))
    throw new Error('Rascunho corrompido; arquivo preservado.');
  let record;
  try {
    const text = await codec.decrypt(bytes.subarray(MAGIC.length));
    if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_FILE) throw new Error();
    record = JSON.parse(text);
  } catch { throw new Error('Não foi possível decifrar o rascunho; arquivo preservado.'); }
  if (!object(record) || record.schemaVersion !== 1 || record.workspaceKey !== location.workspaceKey ||
      !revision(record.baseRevision) || typeof record.savedAt !== 'string' || !Number.isFinite(Date.parse(record.savedAt)) ||
      Object.keys(record).sort().join(',') !== 'baseRevision,flow,savedAt,schemaVersion,workspaceKey')
    throw new Error('Rascunho incompatível com este projeto; preservado.');
  assertRecoverableFlow(record.flow);
  return { ...record, draftRevision: digest(bytes) };
}
async function sourceRevision(root) {
  try { return { sourceRevision: (await readFlowDocument(root)).revision, sourceUnavailable: false }; }
  catch { return { sourceRevision: null, sourceUnavailable: true }; }
}
export async function readFlowDraft(profile, workspace, codec) {
  const loc = await locate(profile, workspace);
  return serial(loc.folder, async () => {
    const record = await readRecord(loc, codec);
    if (!record) return null;
    const { workspaceKey, ...publicRecord } = record;
    return { ...publicRecord, ...await sourceRevision(loc.root) };
  });
}
export async function writeFlowDraft(profile, workspace, flow, baseRevision, expectedDraftRevision, codec) {
  if (!revision(baseRevision) || !revision(expectedDraftRevision)) throw new Error('Revisão do rascunho inválida.');
  const encoded = assertRecoverableFlow(flow);
  // No profile files or plaintext fallback when protected storage is unavailable.
  await codec.available();
  const loc = await locate(profile, workspace, true);
  return serial(loc.folder, async () => {
    const previous = await readRecord(loc, codec);
    if ((previous?.draftRevision ?? null) !== expectedDraftRevision)
      throw new Error('Rascunho alterado por outra sessão; reabra o projeto.');
    if (!previous && (await fs.readdir(loc.folder)).filter(n => FILE.test(n)).length >= MAX_DRAFTS)
      throw new Error('Limite de 20 fluxos recuperáveis atingido. Descarte um rascunho antigo.');
    if (previous && previous.baseRevision === baseRevision && JSON.stringify(previous.flow) === encoded)
      return { draftRevision: previous.draftRevision, savedAt: previous.savedAt };
    const savedAt = new Date().toISOString();
    const record = JSON.stringify({ schemaVersion:1, workspaceKey:loc.workspaceKey, baseRevision, flow:JSON.parse(encoded), savedAt });
    const cipher = await codec.encrypt(record);
    if (!Buffer.isBuffer(cipher) || !cipher.length || cipher.length + MAGIC.length > MAX_FILE)
      throw new Error('Registro protegido inválido ou maior que o limite.');
    const bytes = Buffer.concat([MAGIC, cipher]);
    // Intentionally preserve an unsaved buffer even when the source changed
    // externally. Its OLD baseRevision remains unchanged; restoration checks it.
    await atomicWrite(loc.file, bytes, 0o600);
    return { draftRevision:digest(bytes), savedAt };
  });
}
export async function discardFlowDraft(profile, workspace, expectedDraftRevision, codec) {
  if (typeof expectedDraftRevision !== 'string' || !HASH.test(expectedDraftRevision))
    throw new Error('Revisão do rascunho obrigatória.');
  const loc = await locate(profile, workspace);
  return serial(loc.folder, async () => {
    const previous = await readRecord(loc, codec);
    if (!previous) return false;
    if (previous.draftRevision !== expectedDraftRevision)
      throw new Error('Rascunho alterado por outra sessão; exclusão bloqueada.');
    await fs.unlink(loc.file);
    return true;
  });
}
