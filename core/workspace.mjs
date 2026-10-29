import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { exampleFlow, getNodeDefinition } from './catalog.mjs';

const ROOT_DIR = '.omniforge';
const FLOW_FILE = path.join(ROOT_DIR, 'flows', 'principal.json');
const EXCLUDED = new Set(['node_modules', '.git', 'dist', 'release', '.omniforge', '.next', '.venv', 'venv']);

export async function verifyWorkspace(root) {
  if (typeof root !== 'string') throw new Error('Caminho do projeto inválido.');
  const abs = await fs.realpath(root);
  if (!(await fs.stat(abs)).isDirectory()) throw new Error('Selecione uma pasta, não um arquivo.');
  return abs;
}

export async function makeTrustedDirectory(root, relative) {
  const segments = relative.split('/');
  let current = root;
  for (const segment of segments) {
    if (!segment || !/^[a-zA-Z0-9_.-]+$/.test(segment) || segment === '..' || segment === '.') throw new Error('Diretório interno inválido.');
    current = path.join(current, segment);
    try {
      const stat = await fs.lstat(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Diretório interno foi substituído por um link ou arquivo.');
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      await fs.mkdir(current);
    }
  }
  return current;
}

// On Windows antivirus/indexers can temporarily hold the destination open.
// Retry only transient sharing/access errors, without deleting or truncating
// the destination; if all attempts fail the original file remains intact.
const WINDOWS_RENAME_RETRY_DELAYS = [25, 50, 100, 175, 250, 350, 450, 550];
export async function renameAtomicWithRetry(source, destination, {
  rename = fs.rename,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
  platform = process.platform
} = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      if (platform !== 'win32' ||
          !['EPERM', 'EACCES', 'EBUSY'].includes(error?.code) ||
          attempt === WINDOWS_RENAME_RETRY_DELAYS.length) throw error;
      await wait(WINDOWS_RENAME_RETRY_DELAYS[attempt]);
    }
  }
}

export async function atomicWrite(file, text, mode = 0o600) {
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, text, { flag: 'wx', mode, encoding: 'utf8' });
    await fs.chmod(temp, mode); 
    await renameAtomicWithRetry(temp, file);
  } finally {
    await fs.rm(temp, { force: true }).catch(() => {});
  }
}

function flowHash(data) {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * A flow is deliberately allowed to contain disconnected nodes while the
 * author works. Only the runner requires an executable graph. The document
 * contract itself must remain bounded and parseable.
 */
function assertFlowDocument(flow) {
  if (!flow || flow.schemaVersion !== 1 || !Array.isArray(flow.nodes) || !Array.isArray(flow.edges) ||
      flow.nodes.length > 400 || flow.edges.length > 800 ||
      flow.nodes.some(n => !n || typeof n.id !== 'string' || !getNodeDefinition(n.type) ||
        !n.position || !Number.isFinite(n.position.x) || !Number.isFinite(n.position.y) ||
        !n.config || typeof n.config !== 'object' || Array.isArray(n.config))) {
    throw new Error('Fluxo salvo com contrato inválido ou tipos não registrados.');
  }
}

async function existingFlowBytes(abs) {
  const file = path.join(abs, FLOW_FILE);
  await verifyInternalReadDirectories(abs, [ROOT_DIR, 'flows']);
  if (await isSymlink(file)) throw new Error('Arquivo de fluxo não pode ser um link simbólico.');
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size > 2_000_000) throw new Error('Fluxo maior que 2 MB ou inválido.');
    return await fs.readFile(file);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/** Returns a flow and its optimistic-concurrency revision token. */
export async function readFlowDocument(root) {
  const abs = await verifyWorkspace(root);
  const bytes = await existingFlowBytes(abs);
  if (bytes === null) return { flow: exampleFlow(), revision: null };
  const flow = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  assertFlowDocument(flow);
  return { flow, revision: flowHash(bytes) };
}

export async function loadFlow(root) {
  return (await readFlowDocument(root)).flow;
}

/**
 * No silent overwrite: a save must present the revision read from disk.
 * The only missing-revision case is creating the flow for a new workspace.
 * Saves in the single Electron main process are serialized by the IPC layer.
 */
export async function saveFlow(root, flow, expectedRevision) {
  const abs = await verifyWorkspace(root);
  assertFlowDocument(flow);
  if (expectedRevision !== null &&
      (typeof expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(expectedRevision))) {
    throw new Error('Revisão do fluxo obrigatória. Reabra o projeto para atualizar.');
  }
  const data = JSON.stringify(flow, null, 2) + '\n';
  if (Buffer.byteLength(data) > 2_000_000) throw new Error('Fluxo excede 2 MB.');
  const existing = await existingFlowBytes(abs);
  const actual = existing === null ? null : flowHash(existing);
  if (actual !== expectedRevision) {
    throw new Error('O fluxo mudou fora do editor. Reabra o projeto antes de sobrescrever.');
  }
  const folder = await makeTrustedDirectory(abs, `${ROOT_DIR}/flows`);
  const file = path.join(folder, 'principal.json');
  if (await isSymlink(file)) throw new Error('Arquivo de fluxo não pode ser um link simbólico.');
  // Preserve recoverable data without writing into arbitrary project folders.
  if (existing !== null) {
    const history = await makeTrustedDirectory(abs, `${ROOT_DIR}/flow-history`);
    await atomicWrite(path.join(history, `${actual}.json`), existing.toString('utf8'));
  }
  await atomicWrite(file, data);
  return { path: FLOW_FILE, bytes: Buffer.byteLength(data), revision: flowHash(Buffer.from(data)) };
}

export async function writeOutputJson(root, fileName, value, { dryRun = false } = {}) {
  const abs = await verifyWorkspace(root);
  if (!/^[a-zA-Z0-9_-]{1,100}\.json$/i.test(fileName)) throw new Error('Nome de saída inválido.');
  const relative = `${ROOT_DIR}/output/${fileName}`;
  const data = JSON.stringify(value, null, 2) + '\n';
  if (Buffer.byteLength(data) > 2_000_000) throw new Error('Saída JSON excede 2 MB.');
  if (dryRun) return { relativePath: relative, bytes: Buffer.byteLength(data), simulated: true };
  const dir = await makeTrustedDirectory(abs, `${ROOT_DIR}/output`);
  const target = path.join(dir, fileName);
  if (await isSymlink(target)) throw new Error('Destino é link simbólico.');
  await atomicWrite(target, data);
  return { relativePath: relative, bytes: Buffer.byteLength(data), simulated: false };
}

/** Reads only an OmniForge output JSON, never an arbitrary path from a project. */
export async function readOutputJson(root, fileName) {
  const abs = await verifyWorkspace(root);
  if (typeof fileName !== 'string' || !/^[a-zA-Z0-9_-]{1,100}\.json$/i.test(fileName)) throw new Error('Nome de saída inválido.');
  await verifyInternalReadDirectories(abs, [ROOT_DIR, 'output']);
  const file = path.join(abs, ROOT_DIR, 'output', fileName);
  const info = await fs.lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 2_000_000) throw new Error('Arquivo JSON inválido, grande ou link simbólico.');
  const bytes = await fs.readFile(file);
  let json;
  try { json = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); }
  catch { throw new Error('Arquivo JSON existente está corrompido ou não é UTF-8.'); }
  return json;
}

async function verifyInternalReadDirectories(root, segments) {
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      const info = await fs.lstat(current);
      if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('Pasta interna não é diretório seguro.');
    } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  }
}

async function isSymlink(file) {
  try { return (await fs.lstat(file)).isSymbolicLink(); }
  catch (err) { if (err.code === 'ENOENT') return false; throw err; }
}

function checkedRelative(relative) {
  if (typeof relative !== 'string' || !relative.length || relative.length > 500 || relative.includes('\\') || relative.includes('\0') || path.isAbsolute(relative)) {
    throw new Error('Caminho de arquivo inválido.');
  }
  const parts = relative.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || part.includes(':'))) throw new Error('Acesso fora do projeto negado.');
  if (parts.some(part => EXCLUDED.has(part))) throw new Error('Pasta protegida não pode ser editada pelo navegador.');
  return parts;
}

async function resolveWorkspaceFile(root, relative) {
  const abs = await verifyWorkspace(root);
  const parts = checkedRelative(relative);
  let current = abs;
  for (const part of parts) {
    current = path.join(current, part);
    const info = await fs.lstat(current);
    if (info.isSymbolicLink()) throw new Error('Não é permitido seguir links simbólicos.');
  }
  const info = await fs.stat(current);
  if (!info.isFile() || info.size > 1_000_000) throw new Error('Arquivo indisponível ou maior que 1 MB.');
  return current;
}

export async function readProjectFile(root, relative) {
  const file = await resolveWorkspaceFile(root, relative);
  const buffer = await fs.readFile(file);
  if (buffer.includes(0)) throw new Error('Arquivos binários não são suportados neste editor.');
  let content;
  try { content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer); }
  catch { throw new Error('Arquivo não está em UTF-8 válido. Edição bloqueada para evitar corrupção.'); }
  return { content, revision: createHash('sha256').update(buffer).digest('hex') };
}

export async function saveProjectFile(root, relative, content, expectedRevision) {
  if (typeof content !== 'string' || Buffer.byteLength(content) > 1_000_000) throw new Error('Arquivo maior que 1 MB.');
  const file = await resolveWorkspaceFile(root, relative);
  if (typeof expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(expectedRevision)) throw new Error('Revisão do arquivo não informada.');
  const existing = await fs.readFile(file);
  const actualRevision = createHash('sha256').update(existing).digest('hex');
  if (actualRevision !== expectedRevision) throw new Error('O arquivo mudou fora do editor. Reabra antes de sobrescrever.');
  const originalMode = (await fs.stat(file)).mode & 0o777;
  await atomicWrite(file, content, originalMode);
  return { relativePath: relative, bytes: Buffer.byteLength(content), revision: createHash('sha256').update(content, 'utf8').digest('hex') };
}

export async function listProjectFiles(root, { maxFiles = 160, maxDepth = 5 } = {}) {
  const abs = await verifyWorkspace(root);
  const rows = [];
  const walk = async (directory, relative, depth) => {
    if (depth > maxDepth || rows.length >= maxFiles) return;
    const contents = (await fs.readdir(directory, { withFileTypes: true }))
      .filter(item => !EXCLUDED.has(item.name) && !item.isSymbolicLink())
      .sort((a, b) => (Number(b.isDirectory()) - Number(a.isDirectory())) || a.name.localeCompare(b.name));
    for (const item of contents) {
      if (rows.length >= maxFiles) break;
      const subpath = relative ? `${relative}/${item.name}` : item.name;
      if (item.isDirectory()) {
        rows.push({ path: subpath, kind: 'directory', depth });
        await walk(path.join(directory, item.name), subpath, depth + 1);
      } else if (item.isFile()) rows.push({ path: subpath, kind: 'file', depth });
    }
  };
  await walk(abs, '', 0);
  return rows;
}
