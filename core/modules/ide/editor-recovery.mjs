/**
 * Local recovery checkpoints for unsaved IDE documents (v0.7.3).
 *
 * This service NEVER writes to the selected workspace. Each bounded draft is
 * kept in Electron userData under a SHA-256 filename. Reading/restoring a
 * draft cannot overwrite source files; normal optimistic-concurrency saving
 * remains the only write path for project source.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { atomicWrite, readProjectFile, verifyWorkspace } from '../workspace/workspace.mjs';

const FOLDER = 'editor-recovery';
const MAX_CONTENT = 240_000;
const MAX_FILE = 280_000;
const MAX_DRAFTS = 40;
const HASH = /^[a-f0-9]{64}$/;
const RECORD = /^[a-f0-9]{64}\.json$/;
const PRIVATE = /^(?:\.env(?:\..*)?|\.npmrc|\.pypirc|credentials(?:\..*)?|secrets?(?:\..*)?|id_(?:rsa|dsa|ed25519|ecdsa)(?:\.pub)?)$/i;
const PRIVATE_EXTENSION = /\.(?:pem|key|p12|pfx)$/i;
const locks = new Map();

function digest(text) {
  return createHash('sha256').update(text).digest('hex');
}
function validRevision(value, optional = false) {
  return optional && value === null || typeof value === 'string' && HASH.test(value);
}
function checkRevision(value, name, optional = false) {
  if (!validRevision(value, optional)) throw new Error(name + ' inválida.');
}
function checkPrivate(relative) {
  const leaf = relative.split('/').at(-1) || '';
  if (PRIVATE.test(leaf) || PRIVATE_EXTENSION.test(leaf)) {
    throw new Error('Rascunhos de arquivos de credenciais não são armazenados automaticamente.');
  }
}
async function checkedProfile(userData) {
  if (typeof userData !== 'string' || !path.isAbsolute(userData)) {
    throw new Error('Perfil local de recuperação inválido.');
  }
  const canonical = await fs.realpath(userData);
  const stat = await fs.lstat(userData);
  if (!stat.isDirectory() || stat.isSymbolicLink() || !path.isAbsolute(canonical)) {
    throw new Error('Perfil local de recuperação inseguro.');
  }
  return canonical;
}
async function locate(userData, workspace, relative, create = false) {
  const canonical = await verifyWorkspace(workspace);
  // Reuse canonical file validation: no traversal, symlink, binary or >1MB.
  const disk = await readProjectFile(canonical, relative);
  checkPrivate(relative);
  const profile = await checkedProfile(userData);
  const folder = path.join(profile, FOLDER);
  try {
    const stat = await fs.lstat(folder);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error('Pasta de recuperação insegura.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (create) {
      try { await fs.mkdir(folder, { mode:0o700 }); }
      catch (e) { if (e.code !== 'EEXIST') throw e; }
      const stat = await fs.lstat(folder);
      if (!stat.isDirectory() || stat.isSymbolicLink())
        throw new Error('Pasta de recuperação insegura.');
    } else return { file:null, folder, disk };
  }
  const key = process.platform === 'win32' ? canonical.toLowerCase() : canonical;
  const filename = digest(key + '\0' + relative) + '.json';
  return { file:path.join(folder, filename), folder, disk };
}
async function readRecord(file) {
  if (!file) return null;
  let stat;
  try { stat = await fs.lstat(file); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_FILE) {
    throw new Error('Rascunho de recuperação inseguro ou acima do limite.');
  }
  const data = await fs.readFile(file);
  if (data.byteLength > MAX_FILE || data.includes(0)) throw new Error('Rascunho binário rejeitado.');
  let item;
  try { item = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(data)); }
  catch { throw new Error('Rascunho de recuperação corrompido; arquivo preservado.'); }
  if (item?.schemaVersion !== 1 || typeof item.content !== 'string' ||
      Buffer.byteLength(item.content) > MAX_CONTENT ||
      !validRevision(item.baseRevision) ||
      typeof item.savedAt !== 'string' || !Number.isFinite(Date.parse(item.savedAt)) ||
      Object.keys(item).sort().join(',') !== 'baseRevision,content,savedAt,schemaVersion') {
    throw new Error('Contrato de recuperação inválido; conteúdo preservado.');
  }
  return { ...item, draftRevision:digest(data) };
}
async function serial(file, callback) {
  const predecessor = locks.get(file) || Promise.resolve();
  let release;
  const next = new Promise(resolve => { release = resolve; });
  locks.set(file, next);
  await predecessor;
  try { return await callback(); }
  finally {
    release();
    if (locks.get(file) === next) locks.delete(file);
  }
}
export async function readEditorDraft(userData, workspace, relative) {
  const { file } = await locate(userData, workspace, relative);
  const item = await readRecord(file);
  if (!item) return null;
  return { ...item };
}
export async function writeEditorDraft(userData, workspace, relative, content, baseRevision, expectedDraftRevision) {
  checkRevision(baseRevision, 'Revisão original');
  checkRevision(expectedDraftRevision, 'Revisão anterior do rascunho', true);
  if (typeof content !== 'string' || Buffer.byteLength(content) > MAX_CONTENT || content.includes('\0')) {
    throw new Error('Rascunho inválido ou maior que 240 KB.');
  }
  const { file, folder, disk } = await locate(userData, workspace, relative, true);
  if (disk.revision !== baseRevision) {
    throw new Error('Arquivo original mudou fora do editor. Rascunho anterior foi preservado.');
  }
  return serial(file, async () => {
    const previous = await readRecord(file);
    if ((previous?.draftRevision || null) !== expectedDraftRevision) {
      throw new Error('Rascunho alterado por outra sessão. Reabra o arquivo antes de continuar.');
    }
    if (!previous) {
      const names = (await fs.readdir(folder)).filter(name => RECORD.test(name));
      if (names.length >= MAX_DRAFTS) throw new Error('Limite de 40 rascunhos de recuperação atingido.');
    }
    // Repeat after waiting for the local per-file lock.
    const latestDisk = await readProjectFile(workspace, relative);
    if (latestDisk.revision !== baseRevision) {
      throw new Error('Revisão original divergente; rascunho não sobrescrito.');
    }
    const body = JSON.stringify({
      schemaVersion:1, baseRevision, content, savedAt:new Date().toISOString()
    }) + '\n';
    if (Buffer.byteLength(body) > MAX_FILE) throw new Error('Limite de armazenamento excedido.');
    await atomicWrite(file, body, 0o600);
    return { draftRevision:digest(body), savedAt:JSON.parse(body).savedAt };
  });
}
export async function discardEditorDraft(userData, workspace, relative, expectedDraftRevision) {
  checkRevision(expectedDraftRevision, 'Revisão do rascunho');
  const { file } = await locate(userData, workspace, relative);
  if (!file) return false;
  return serial(file, async () => {
    const item = await readRecord(file);
    if (!item) return false;
    if (item.draftRevision !== expectedDraftRevision) {
      throw new Error('Rascunho atualizado por outra sessão; exclusão bloqueada.');
    }
    await fs.unlink(file);
    return true;
  });
}
