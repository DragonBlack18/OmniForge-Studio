/** Workspace-scoped, bounded SQLite snapshot reads and create-only exports. */
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { verifyWorkspace } from '../workspace/workspace.mjs';
import { DATABASE_LIMITS as L } from './database-contract.mjs';

const EXCLUDED = new Set(['.git', '.omniforge', 'node_modules', 'dist', 'release', '.venv', 'venv', '.next', 'build', 'coverage', '.cache', '__pycache__']);
const DEVICE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const EXTENSION = /\.(?:db|sqlite|sqlite3)$/i;
export const databaseHash = bytes => createHash('sha256').update(bytes).digest('hex');

export function databasePath(relative) {
  if (typeof relative !== 'string' || !relative || relative.length > 240 ||
      /^[~/]/.test(relative) || /[\\\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069<>"|?*:]/.test(relative) || !EXTENSION.test(relative)) {
    throw new Error('Use um caminho relativo do projeto com extensão .sqlite, .sqlite3 ou .db.');
  }
  const segments = relative.split('/');
  if (segments.length > 7 || segments.some(item => !item || item === '.' || item === '..' ||
      item.length > 100 || /[. ]$/.test(item) || DEVICE.test(item) || EXCLUDED.has(item.toLowerCase()) || item.startsWith('.'))) {
    throw new Error('Caminho SQLite inválido ou pasta protegida.');
  }
  return segments;
}

async function resolveTarget(root, relative) {
  const segments = databasePath(relative), base = await verifyWorkspace(root);
  let parent = base;
  for (const item of segments.slice(0, -1)) {
    parent = path.join(parent, item);
    const stat = await fs.lstat(parent);
    const real = await fs.realpath(parent);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (real !== base && !real.startsWith(base + path.sep))) {
      throw new Error('Pasta SQLite fora do projeto ou vinculada.');
    }
  }
  return { base, parent, name: segments.at(-1), file: path.join(parent, segments.at(-1)) };
}

async function noSidecars(file) {
  for (const suffix of ['-wal', '-shm', '-journal']) {
    try { await fs.lstat(file + suffix); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    throw new Error('Há um arquivo auxiliar SQLite (' + suffix + '). Feche as conexões e use uma cópia offline consolidada. O OmniForge não remove nem consolida arquivos auxiliares.');
  }
}

function sqliteImage(bytes) {
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
  if (bytes.length < 100 || bytes.length > L.imageBytes || bytes.subarray(0, 16).toString('binary') !== 'SQLite format 3\0') {
    throw new Error('Arquivo SQLite inválido, criptografado ou maior que 32 MiB.');
  }
  if (bytes[18] === 2 || bytes[19] === 2) throw new Error('Banco em modo WAL não é aceito nesta etapa. Exporte uma cópia offline em modo DELETE no aplicativo de origem.');
  if (bytes[18] !== 1 || bytes[19] !== 1) throw new Error('Versão do formato SQLite não suportada.');
  return bytes;
}

export async function readDatabaseSnapshot(root, relative) {
  const target = await resolveTarget(root, relative);
  await noSidecars(target.file);
  const before = await fs.lstat(target.file);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > L.imageBytes) {
    throw new Error('Selecione um arquivo SQLite regular, sem links e de até 32 MiB.');
  }
  const handle = await fs.open(target.file, constants.O_RDONLY | (process.platform === 'win32' ? 0 : constants.O_NOFOLLOW));
  try {
    const opened = await handle.stat();
    if (opened.dev !== before.dev || opened.ino !== before.ino || opened.nlink !== 1 || opened.size !== before.size) {
      throw new Error('O arquivo SQLite mudou durante a abertura.');
    }
    const bytes = Buffer.alloc(before.size + 1);
    let read = 0;
    while (read < bytes.length) {
      const result = await handle.read(bytes, read, bytes.length - read, read);
      if (!result.bytesRead) break;
      read += result.bytesRead;
    }
    const after = await handle.stat(), present = await fs.lstat(target.file);
    await resolveTarget(root, relative);
    await noSidecars(target.file);
    if (read !== before.size || after.size !== before.size || after.mtimeMs !== opened.mtimeMs ||
        after.ctimeMs !== opened.ctimeMs || after.nlink !== 1 || present.ino !== opened.ino ||
        present.dev !== opened.dev || present.isSymbolicLink()) {
      throw new Error('O arquivo SQLite mudou durante a leitura. Feche outras conexões e tente novamente.');
    }
    const image = sqliteImage(bytes.subarray(0, read));
    return { workspace: target.base, path: relative, image, revision: databaseHash(image), bytes: image.length };
  } finally { await handle.close(); }
}

export async function validateDatabaseDestination(root, relative) {
  const target = await resolveTarget(root, relative);
  await noSidecars(target.file);
  if ((await fs.readdir(target.parent)).some(name => name.toLowerCase() === target.name.toLowerCase())) {
    throw new Error('O destino já existe. Escolha um novo nome; nenhum banco será sobrescrito.');
  }
  return { workspace: target.base, relativePath: relative };
}

export async function saveDatabaseSnapshotCopy(root, relative, data) {
  const image = sqliteImage(data);
  await validateDatabaseDestination(root, relative);
  const target = await resolveTarget(root, relative);
  // O_EXCL is authoritative, including if another application creates the target after validation.
  const handle = await fs.open(target.file, 'wx', 0o600);
  let owned, finished = false;
  try {
    owned = await handle.stat();
    await handle.writeFile(image); await handle.sync();
    const present = await fs.lstat(target.file);
    const current = await handle.stat();
    await resolveTarget(root, relative); await noSidecars(target.file);
    if (current.nlink !== 1 || present.isSymbolicLink() || present.dev !== owned.dev || present.ino !== owned.ino) {
      throw new Error('O destino mudou durante a gravação. A sessão permanece disponível.');
    }
    finished = true;
    return { path: relative, bytes: image.length, revision: databaseHash(image) };
  } finally {
    await handle.close();
    if (!finished && owned) {
      try {
        const present = await fs.lstat(target.file);
        if (!present.isSymbolicLink() && present.dev === owned.dev && present.ino === owned.ino && present.nlink === 1) await fs.unlink(target.file);
      } catch { /* Never unlink an unknown file or another process's replacement. */ }
    }
  }
}

export async function listDatabaseFiles(root) {
  const workspace = await verifyWorkspace(root), files = [];
  let visited = 0, truncated = false, skipped = 0;
  async function visit(directory, prefix, depth) {
    if (depth > L.depth) { truncated = true; return; }
    let entries;
    try {
      const info = await fs.lstat(directory), real = await fs.realpath(directory);
      if (!info.isDirectory() || info.isSymbolicLink() || (real !== workspace && !real.startsWith(workspace + path.sep))) { skipped++; return; }
      entries = await fs.opendir(directory);
    }
    catch { skipped++; return; }
    for await (const entry of entries) {
      if (++visited > L.scannedEntries || files.length >= L.files) { truncated = true; return; }
      if (entry.name.startsWith('.') || EXCLUDED.has(entry.name.toLowerCase()) || entry.isSymbolicLink()) continue;
      const relative = prefix ? prefix + '/' + entry.name : entry.name;
      if (entry.isDirectory()) await visit(path.join(directory, entry.name), relative, depth + 1);
      else if (entry.isFile() && EXTENSION.test(entry.name)) {
        try {
          databasePath(relative);
          const stat = await fs.lstat(path.join(directory, entry.name));
          if (stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size <= L.imageBytes) files.push({ path: relative, bytes: stat.size });
          else skipped++;
        } catch { skipped++; }
      }
    }
  }
  await visit(workspace, '', 0);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { workspace, files, truncated, skipped };
}
