/** Terminal policy. A deliberately approved shell keeps the user's OS permissions. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { verifyWorkspace } from '../workspace/workspace.mjs';

export const TERMINAL_INPUT_BYTES = 16_384;
export const TERMINAL_RATE_BYTES = 131_072;
export const TERMINAL_HISTORY_CHARS = 128_000;

export function terminalDimensions(cols, rows) {
  if (!Number.isInteger(cols) || cols < 20 || cols > 500 ||
      !Number.isInteger(rows) || rows < 5 || rows > 200) {
    throw new Error('Dimensões do terminal inválidas (20–500 colunas, 5–200 linhas).');
  }
  return { cols, rows };
}

export function terminalInput(data) {
  if (typeof data !== 'string' || !data.length || Buffer.byteLength(data) > TERMINAL_INPUT_BYTES || data.includes('\0')) {
    throw new Error('Entrada do terminal inválida: até 16 KB por envio, sem bytes nulos.');
  }
  return data;
}

export function validateTerminalOpen(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request) ||
      Object.keys(request).some(key => !['shellId', 'cols', 'rows'].includes(key)) ||
      !['powershell', 'cmd', 'bash', 'sh'].includes(request.shellId)) {
    throw new Error('Solicitação de terminal inválida. Selecione um ambiente disponível.');
  }
  return { shellId: request.shellId, ...terminalDimensions(request.cols, request.rows) };
}

export function terminalEnvironment(environment = process.env) {
  const permitted = new Set(['PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE',
    'APPDATA', 'LOCALAPPDATA', 'LANG', 'LC_ALL', 'COMSPEC', 'PATHEXT', 'PROGRAMFILES', 'PROGRAMFILES(X86)']);
  const env = {};
  for (const [key, value] of Object.entries(environment)) {
    if (permitted.has(key.toUpperCase()) && typeof value === 'string') env[key] = value;
  }
  return { ...env, TERM: 'xterm-256color', COLORTERM: 'truecolor', TERM_PROGRAM: 'OmniForge',
    PYTHONUTF8: '1', PYTHONUNBUFFERED: '1' };
}

export async function listTerminalShells({ platform = process.platform, environment = process.env,
  release = os.release(), stat = fs.stat, realpath = fs.realpath } = {}) {
  let definitions;
  if (platform === 'win32') {
    if (Number(release.split('.')[2]) < 18309) {
      return { shells: [], reason: 'Esta versão exige Windows com ConPTY (build 18309 ou posterior).' };
    }
    const root = environment.SystemRoot || environment.SYSTEMROOT || environment.WINDIR;
    if (!root || !path.win32.isAbsolute(root)) return { shells: [], reason: 'Pasta do Windows não localizada.' };
    definitions = [
      { id: 'powershell', label: 'Windows PowerShell', executable: path.win32.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), args: ['-NoLogo', '-NoProfile'] },
      { id: 'cmd', label: 'Prompt de Comando', executable: path.win32.join(root, 'System32', 'cmd.exe'), args: ['/D'] }
    ];
  } else {
    definitions = [
      { id: 'bash', label: 'Bash', executable: '/bin/bash', args: ['--noprofile', '--norc', '-i'] },
      { id: 'sh', label: 'Shell POSIX', executable: '/bin/sh', args: ['-i'] }
    ];
  }
  const shells = [];
  for (const definition of definitions) {
    try {
      const canonical = await realpath(definition.executable);
      const info = await stat(canonical);
      if (info.isFile() && (platform === 'win32' || (info.mode & 0o111))) shells.push({ ...definition, canonical });
    } catch { /* A missing shell is unavailable, never silently substituted. */ }
  }
  return { shells, reason: shells.length ? '' : 'Nenhum shell compatível foi encontrado no sistema.' };
}

export async function prepareTerminalOpen(workspace, request, { shells = listTerminalShells } = {}) {
  const input = validateTerminalOpen(request);
  const root = await verifyWorkspace(workspace);
  const available = await shells();
  const shell = available.shells.find(item => item.id === input.shellId);
  if (!shell) throw new Error(available.reason || 'O ambiente selecionado não está mais disponível.');
  return { ...input, workspace: root, shell };
}
