import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomicWrite, verifyWorkspace } from './workspace.mjs';
import { validateCapabilityDefinition } from './capabilities.mjs';

const REGISTRY_DIR = 'project-catalog';
const REGISTRY_FILE = 'projects.json';
const MAX_PROJECTS = 100;
const MAX_BYTES = 256 * 1024;
const MANIFEST_LIMIT = 64 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertProjectId(id) {
  if (typeof id !== 'string' || !UUID.test(id)) throw new Error('Identificador do projeto inválido.');
  return id;
}

async function secureRegistryDirectory(dataRoot, { create = false } = {}) {
  if (typeof dataRoot !== 'string' || !path.isAbsolute(dataRoot)) throw new Error('Diretório de dados do aplicativo inválido.');
  const base = path.resolve(dataRoot);
  // Never traverse a symlink in the registry's own storage directory.
  for (const dir of [base, path.join(base, REGISTRY_DIR)]) {
    try {
      const st = await fs.lstat(dir);
      if (!st.isDirectory() || st.isSymbolicLink()) throw new Error('Pasta de catálogo insegura.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (!create) return null;
      await fs.mkdir(dir, { mode: 0o700 });
    }
  }
  return path.join(base, REGISTRY_DIR);
}

function validateRegistry(db) {
  if (!db || db.schemaVersion !== 1 || !Array.isArray(db.projects) || db.projects.length > MAX_PROJECTS) throw new Error('Catálogo de projetos corrompido ou incompatível.');
  const ids = new Set(), paths = new Set();
  for (const item of db.projects) {
    if (!item || !UUID.test(item.id) || typeof item.path !== 'string' || !path.isAbsolute(item.path) || item.path.length > 1600 ||
      typeof item.label !== 'string' || item.label.length > 120 || typeof item.createdAt !== 'string') throw new Error('Registro de projeto inválido.');
    const key = process.platform === 'win32' ? path.normalize(item.path).toLowerCase() : path.normalize(item.path);
    if (ids.has(item.id) || paths.has(key)) throw new Error('Catálogo contém entradas duplicadas.');
    if (item.capabilities !== undefined) {
      if (!Array.isArray(item.capabilities) || item.capabilities.length > 20) throw new Error('Lista de capacidades inválida.');
      const capIds = new Set();
      for (const cap of item.capabilities) {
        const validated = validateCapabilityDefinition(cap);
        if (capIds.has(validated.id)) throw new Error('Capacidades duplicadas.');
        capIds.add(validated.id);
      }
    }
    ids.add(item.id); paths.add(key);
  }
  return db;
}

async function loadRegistry(dataRoot) {
  const dir = await secureRegistryDirectory(dataRoot);
  if (!dir) return { schemaVersion: 1, projects: [] };
  const file = path.join(dir, REGISTRY_FILE);
  try {
    const st = await fs.lstat(file);
    if (!st.isFile() || st.isSymbolicLink() || st.size > MAX_BYTES) throw new Error('Arquivo de catálogo inseguro ou muito grande.');
    return validateRegistry(JSON.parse(await fs.readFile(file, 'utf8')));
  } catch (error) {
    if (error.code === 'ENOENT') return { schemaVersion: 1, projects: [] };
    throw error;
  }
}

async function saveRegistry(dataRoot, db) {
  validateRegistry(db);
  const data = JSON.stringify(db, null, 2) + '\n';
  if (Buffer.byteLength(data) > MAX_BYTES) throw new Error('Catálogo maior que o limite permitido.');
  const folder = await secureRegistryDirectory(dataRoot, { create: true });
  const target = path.join(folder, REGISTRY_FILE);
  try {
    const st = await fs.lstat(target);
    if (st.isSymbolicLink() || !st.isFile()) throw new Error('Catálogo foi substituído por link ou diretório.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await atomicWrite(target, data);
}

function canonicalKey(value) { return process.platform === 'win32' ? path.normalize(value).toLowerCase() : path.normalize(value); }

async function readManifest(root, name) {
  const file = path.join(root, name);
  try {
    const st = await fs.lstat(file);
    if (st.isSymbolicLink() || !st.isFile() || st.size > MANIFEST_LIMIT) return null;
    return await fs.readFile(file, 'utf8');
  } catch (err) { if (['ENOENT', 'EACCES', 'EPERM'].includes(err.code)) return null; throw err; }
}

/** Read-only project classification. Never starts interpreters, scripts or npm. */
export async function inspectProject(root) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw new Error('Selecione uma pasta absoluta.');
  const given = path.resolve(root);
  const info = await fs.lstat(given);
  if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('Projetos devem ser pastas reais, não links.');
  const abs = await verifyWorkspace(given);
  const pkgText = await readManifest(abs, 'package.json');
  let pkg;
  if (pkgText) { try { pkg = JSON.parse(pkgText); } catch { /* malformed manifest is never executed */ } }
  const exists = async n => (await readManifest(abs, n)) !== null;
  let kind = 'Pasta / genérico';
  if (pkg) kind = pkg.devDependencies?.electron || pkg.dependencies?.electron ? 'Electron / Node.js' : 'Node.js';
  else if (await exists('pyproject.toml') || await exists('requirements.txt')) kind = 'Python';
  else if (await exists('go.mod')) kind = 'Go';
  else if (await exists('Cargo.toml')) kind = 'Rust';
  else if (await exists('pom.xml') || await exists('build.gradle')) kind = 'Java';
  const name = typeof pkg?.name === 'string' && pkg.name.length < 100 ? pkg.name : path.basename(abs);
  return { path: abs, label: name.slice(0, 120), kind };
}

/** Offline projects remain in the catalog; no workspace folder is modified on lookup. */
export async function listProjects(dataRoot) {
  const db = await loadRegistry(dataRoot);
  return Promise.all(db.projects.map(async entry => {
    try {
      const info = await inspectProject(entry.path);
      return { ...entry, available: true, kind: info.kind };
    } catch { return { ...entry, available: false, kind: 'Indisponível' }; }
  }));
}

export async function registerProject(dataRoot, sourcePath) {
  const info = await inspectProject(sourcePath);
  const db = await loadRegistry(dataRoot);
  const existing = db.projects.find(entry => canonicalKey(entry.path) === canonicalKey(info.path));
  if (existing) return { ...existing, available: true, kind: info.kind, alreadyRegistered: true };
  if (db.projects.length >= MAX_PROJECTS) throw new Error('Limite de 100 projetos atingido.');
  const entry = { id: randomUUID(), path: info.path, label: info.label, createdAt: new Date().toISOString(), lastOpenedAt: null };
  db.projects.push(entry);
  await saveRegistry(dataRoot, db);
  return { ...entry, available: true, kind: info.kind, alreadyRegistered: false };
}

export async function getProject(dataRoot, id) {
  assertProjectId(id);
  const db = await loadRegistry(dataRoot);
  const entry = db.projects.find(item => item.id === id);
  if (!entry) throw new Error('Projeto não encontrado no catálogo.');
  const info = await inspectProject(entry.path);
  return { ...entry, available: true, kind: info.kind };
}

export async function markProjectOpened(dataRoot, id) {
  assertProjectId(id);
  const db = await loadRegistry(dataRoot);
  const item = db.projects.find(entry => entry.id === id);
  if (!item) throw new Error('Projeto não encontrado no catálogo.');
  item.lastOpenedAt = new Date().toISOString();
  await saveRegistry(dataRoot, db);
}

/** Forgetting a project only edits the app-data catalog; NEVER removes project files. */
export async function forgetProject(dataRoot, id) {
  assertProjectId(id);
  const db = await loadRegistry(dataRoot);
  const idx = db.projects.findIndex(entry => entry.id === id);
  if (idx < 0) throw new Error('Projeto não encontrado.');
  db.projects.splice(idx, 1);
  await saveRegistry(dataRoot, db);
  return { removed: true, id };
}


export async function registerCapability(dataRoot, projectId, rawDefinition) {
  assertProjectId(projectId);
  const definition = validateCapabilityDefinition(rawDefinition);
  const db = await loadRegistry(dataRoot);
  const project = db.projects.find(p => p.id === projectId);
  if (!project) throw new Error('Projeto de destino não encontrado.');
  if ((project.capabilities || []).some(c => c.id === definition.id)) throw new Error('Este identificador de capacidade já existe.');
  if ((project.capabilities || []).length >= 20) throw new Error('Limite de 20 capacidades por projeto atingido.');
  project.capabilities = [...(project.capabilities || []), definition];
  await saveRegistry(dataRoot, db);
  return { projectId, ...definition };
}

export async function forgetCapability(dataRoot, projectId, capabilityId) {
  assertProjectId(projectId);
  if (typeof capabilityId !== 'string' || !/^[a-z][a-z0-9_-]{1,39}$/.test(capabilityId)) throw new Error('Identificador de capacidade inválido.');
  const db = await loadRegistry(dataRoot);
  const project = db.projects.find(p => p.id === projectId);
  if (!project) throw new Error('Projeto não encontrado.');
  const previous = project.capabilities || [];
  project.capabilities = previous.filter(c => c.id !== capabilityId);
  if (project.capabilities.length === previous.length) throw new Error('Capacidade não encontrada.');
  await saveRegistry(dataRoot, db);
  return { removed: true, projectId, capabilityId };
}
