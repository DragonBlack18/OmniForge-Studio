/** OmniForge Workspace IDE: bounded local search and create-only file/folder services. */
import fs from 'node:fs/promises';
import { constants as flags } from 'node:fs';
import path from 'node:path';
import { verifyWorkspace, readProjectFile } from '../workspace/workspace.mjs';

const PRIVATE_DIRS = new Set(['.git', '.omniforge', 'node_modules', 'dist', 'release',
  '.next', '.venv', 'venv', 'build', 'coverage', '.turbo', '.cache', 'target',
  '.gradle', '__pycache__']);
const PRIVATE_FILE = /^(?:\.env(?:\..*)?|\.npmrc|\.pypirc|id_(?:rsa|dsa|ed25519|ecdsa)(?:\.pub)?|credentials(?:\..*)?|secrets?(?:\..*)?)$/i;
const BINARY = /\.(?:pdf|exe|dll|so|dylib|msi|zip|7z|rar|gz|png|jpe?g|gif|webp|ico|bmp|tiff?|mp[34]|wav|ogg|flac|avi|mov|mkv|woff2?|ttf|otf|eot|sqlite3?|db|class|jar|pyc|pyo|bin|obj|lib|pdb|psd|blend|dwg|dxf|wasm|pem|p12|pfx|key|crt|cer)$/i;
const WINDOWS_DEVICE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const MAX_FILES = 1800, MAX_FILE_BYTES = 320_000, MAX_BYTES = 12_000_000;
const MAX_RESULTS = 160, MAX_PER_FILE = 8, MAX_DEPTH = 8, MAX_TIME_MS = 7000;

function newPathSegments(value) {
  if (typeof value !== 'string' || !value || value.length > 260 ||
    value.includes('\\') || value.startsWith('/') || value.startsWith('~') ||
    /[\u0000-\u001f\u007f<>"|?*:]/.test(value)) {
    throw new Error('Caminho inválido: informe um caminho relativo usando /.');
  }
  const segments = value.split('/');
  if (segments.length > 9 || segments.some(x => !x || x === '.' || x === '..' ||
    x.length > 100 || /[. ]$/.test(x) || WINDOWS_DEVICE.test(x) ||
    PRIVATE_DIRS.has(x.toLowerCase()))) {
    throw new Error('Caminho contém pasta protegida ou nome inválido.');
  }
  return segments;
}
async function verifiedTarget(root, segments) {
  const base = await verifyWorkspace(root);
  let folder = base;
  for (const name of segments.slice(0, -1)) {
    folder = path.join(folder, name);
    const info = await fs.lstat(folder);
    if (info.isSymbolicLink() || !info.isDirectory())
      throw new Error('Pasta pai não é um diretório seguro.');
    const real = await fs.realpath(folder);
    if (!real.startsWith(base + path.sep)) throw new Error('Pasta fora do projeto.');
  }
  return path.join(folder, segments.at(-1));
}
export async function createWorkspaceFile(root, relative) {
  const target = await verifiedTarget(root, newPathSegments(relative));
  let handle;
  try { handle = await fs.open(target, 'wx', 0o600); }
  catch (err) {
    if (err.code === 'EEXIST') throw new Error('O arquivo já existe. Nenhum conteúdo foi sobrescrito.');
    throw err;
  } finally { if (handle) await handle.close(); }
  const loaded = await readProjectFile(root, relative);
  return { path: relative, revision: loaded.revision, bytes: 0 };
}
export async function createWorkspaceFolder(root, relative) {
  const target = await verifiedTarget(root, newPathSegments(relative));
  try { await fs.mkdir(target, { mode: 0o700 }); }
  catch (err) {
    if (err.code === 'EEXIST') throw new Error('A pasta já existe. Nada foi alterado.');
    throw err;
  }
  return { path: relative, created: true };
}

function assertOptions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    typeof value.query !== 'string' || value.query.length < 2 ||
    value.query.length > 120 || /[\u0000-\u001f\u007f]/.test(value.query) ||
    typeof value.caseSensitive !== 'boolean')
    throw new Error('Busca inválida: informe 2 a 120 caracteres e maiúsculas true/false.');
  return { query: value.query, caseSensitive: value.caseSensitive };
}
async function safeRead(filename) {
  let handle;
  try {
    handle = await fs.open(filename, flags.O_RDONLY |
      (process.platform === 'win32' ? 0 : (flags.O_NOFOLLOW || 0)));
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > MAX_FILE_BYTES) return null;
    const buffer = Buffer.allocUnsafe(stat.size);
    const { bytesRead } = await handle.read(buffer, 0, stat.size, 0);
    if (bytesRead !== stat.size || buffer.includes(0)) return null;
    try {
      return { bytes: stat.size, text: new TextDecoder('utf-8', {
        fatal: true, ignoreBOM: true
      }).decode(buffer) };
    } catch { return null; }
  } catch (err) {
    if (['ENOENT', 'ELOOP', 'EACCES', 'EPERM', 'EISDIR'].includes(err.code)) return null;
    throw err;
  } finally { if (handle) await handle.close(); }
}
function excerpt(line, index, length) {
  const start = Math.max(0, index - 62);
  const end = Math.min(line.length, index + length + 94);
  return (start ? '…' : '') + line.slice(start, end).replace(/\t/g, '  ') +
    (end < line.length ? '…' : '');
}

/** Literal text only, no arbitrary regex, network access or persistence. */
export async function searchWorkspaceText(root, options) {
  const { query, caseSensitive } = assertOptions(options);
  const cwd = await verifyWorkspace(root);
  const pattern = query.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const regex = new RegExp(pattern, caseSensitive ? 'g' : 'gi');
  const stack = [{ absolute: cwd, relative: '', depth: 0 }];
  const results = [];
  const started = Date.now();
  let visited = 0, filesScanned = 0, filesMatched = 0;
  let bytesScanned = 0, skippedFiles = 0, truncated = false;
  outer: while (stack.length) {
    if (Date.now() - started > MAX_TIME_MS) { truncated = true; break; }
    const { absolute, relative, depth } = stack.pop();
    let entries;
    try { entries = await fs.readdir(absolute, { withFileTypes: true }); }
    catch (err) {
      if (['ENOENT', 'EACCES', 'EPERM'].includes(err.code)) { skippedFiles++; continue; }
      throw err;
    }
    entries.sort((a, b) => b.name.localeCompare(a.name));
    for (const entry of entries) {
      if (Date.now() - started > MAX_TIME_MS || visited >= MAX_FILES ||
        results.length >= MAX_RESULTS || bytesScanned >= MAX_BYTES) {
        truncated = true; break outer;
      }
      if (entry.isSymbolicLink()) { skippedFiles++; continue; }
      const sub = relative ? relative + '/' + entry.name : entry.name;
      if (entry.isDirectory()) {
        if (PRIVATE_DIRS.has(entry.name.toLowerCase())) continue;
        if (depth < MAX_DEPTH) stack.push({
          absolute: path.join(absolute, entry.name), relative: sub, depth: depth + 1
        });
        else truncated = true;
        continue;
      }
      if (!entry.isFile() || PRIVATE_FILE.test(entry.name) || BINARY.test(entry.name)) continue;
      visited++;
      const item = await safeRead(path.join(absolute, entry.name));
      if (!item) { skippedFiles++; continue; }
      if (bytesScanned + item.bytes > MAX_BYTES) { truncated = true; break outer; }
      bytesScanned += item.bytes; filesScanned++;
      let fileHits = 0;
      const lines = item.text.split(/\r\n|\n|\r/);
      for (let index = 0; index < lines.length; index++) {
        regex.lastIndex = 0;
        let match;
        while ((match = regex.exec(lines[index])) !== null) {
          if (fileHits === 0) filesMatched++;
          results.push({
            path: sub, line: index + 1, column: match.index + 1,
            snippet: excerpt(lines[index], match.index, match[0].length)
          });
          fileHits++;
          if (fileHits >= MAX_PER_FILE || results.length >= MAX_RESULTS) break;
        }
        if (fileHits >= MAX_PER_FILE || results.length >= MAX_RESULTS) break;
      }
      if (results.length >= MAX_RESULTS) { truncated = true; break outer; }
    }
  }
  return { query, caseSensitive, results, filesScanned, filesMatched,
    skippedFiles, bytesScanned, truncated };
}
