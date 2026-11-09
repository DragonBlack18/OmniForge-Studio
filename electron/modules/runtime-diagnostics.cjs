'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const CODES = new Set(['ipc-denied','payload-denied','ipc-busy','permission-denied',
  'download-denied','navigation-denied','renderer-gone','renderer-unresponsive','renderer-responsive','close-blocked','close-cancelled','close-approved','close-error']);
// This store accepts only event codes, never errors, paths, contents, commands or tokens.
function createDiagnostics({ version, versions, packaged, platform = process.platform,
  arch = process.arch, clock = Date.now, memory = process.memoryUsage }) {
  const started = clock(), events = [], totals = Object.create(null);
  const runtime = {};
  for (const key of ['electron','chrome','node']) runtime[key] = String(versions[key] || 'unavailable').slice(0,80);
  return {
    record(code) {
      if (!CODES.has(code)) return;
      totals[code] = Math.min((totals[code] || 0) + 1, Number.MAX_SAFE_INTEGER);
      events.push({ code, at: new Date(clock()).toISOString() });
      if (events.length > 64) events.shift();
    },
    snapshot({ preferences = {}, operations = {}, recoveryAvailable = false } = {}) {
      const active = {};
      for (const key of ['save','cad','registry','execution','task','schedulePrompt','taskPrompt','closing','diagnosticExport','unsaved',
        'terminal','terminalPrompt','databaseWork','databasePrompt','databaseSave']) active[key] = operations[key] === true;
      return {
        schemaVersion: 1, generatedAt: new Date(clock()).toISOString(),
        application: { name: 'OmniForge Studio', version, packaged: Boolean(packaged), channel: 'experimental' },
        runtime: { ...runtime, platform, arch, uptimeMs: Math.max(0, clock() - started), mainRssBytes: memory().rss },
        protections: { sandbox: preferences.sandbox === true, contextIsolation: preferences.contextIsolation === true,
          nodeIntegrationDisabled: preferences.nodeIntegration === false, webSecurity: preferences.webSecurity === true,
          encryptedFlowRecoveryAvailable: recoveryAvailable === true },
        operations: active, eventTotals: { ...totals }, recentEvents: events.map(event => ({ ...event })),
        scope: 'Local technical metadata only. Not a security certification; renderer memory, project files and credentials are not collected.'
      };
    }
  };
}
async function exportDiagnostics(file, snapshot) {
  if (typeof file !== 'string' || !path.isAbsolute(file) || path.extname(file).toLowerCase() !== '.json')
    throw Error('Selecione um novo arquivo JSON para o diagnóstico.');
  const data = JSON.stringify(snapshot, null, 2) + '\n';
  if (Buffer.byteLength(data) > 64_000) throw Error('Relatório de diagnóstico excede o limite.');
  // Never follow a link or overwrite an existing file, even after native selection.
  let handle;
  try {
    handle = await fs.open(file, 'wx', 0o600);
    await handle.writeFile(data, 'utf8');
    await handle.sync();
  } catch (error) {
    if (error.code === 'EEXIST') throw Error('O arquivo já existe. Escolha outro nome; nada foi sobrescrito.');
    throw Error('Não foi possível exportar o relatório de diagnóstico.');
  } finally { await handle?.close(); }
  return { saved: true };
}
module.exports = { createDiagnostics, exportDiagnostics };
