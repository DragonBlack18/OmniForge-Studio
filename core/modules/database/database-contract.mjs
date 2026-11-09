/** Shared limits for the native SQLite workbench. No filesystem or SQL execution. */
export const DATABASE_LIMITS = Object.freeze({
  imageBytes: 32 * 1024 * 1024, sqlBytes: 64 * 1024, parameterBytes: 64 * 1024,
  resultBytes: 1024 * 1024, rows: 1000, columns: 256, cellPreviewBytes: 4096,
  schemaObjects: 200, schemaColumns: 4096, timeoutMs: 10_000,
  files: 150, scannedEntries: 5000, depth: 6
});

export function databaseRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request) ||
      typeof request.sessionId !== 'string' || !/^[a-f0-9-]{36}$/.test(request.sessionId) ||
      typeof request.requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(request.requestId) ||
      !Number.isSafeInteger(request.revision) || request.revision < 0) {
    throw new Error('Sessão, operação ou revisão SQLite inválida. Atualize a sessão.');
  }
  if (typeof request.sql !== 'string' || !request.sql.trim() || request.sql.includes('\0') ||
      Buffer.byteLength(request.sql, 'utf8') > DATABASE_LIMITS.sqlBytes) {
    throw new Error('Informe SQL de até 64 KiB, sem caracteres nulos.');
  }
  const params = request.params ?? [];
  if (!Array.isArray(params) && (!params || typeof params !== 'object' ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(params)))) {
    throw new Error('Parâmetros devem ser um array ou objeto JSON simples.');
  }
  const entries = Object.entries(params);
  if (entries.length > 256 || entries.some(([key, value]) => key.length > 128 ||
      ['__proto__', 'prototype', 'constructor'].includes(key) || key.includes('\0') ||
      !(value === null || typeof value === 'string' ||
        (typeof value === 'number' && Number.isFinite(value) &&
          (!Number.isInteger(value) || Number.isSafeInteger(value))))) ||
      Buffer.byteLength(JSON.stringify(params), 'utf8') > DATABASE_LIMITS.parameterBytes) {
    throw new Error('Use até 256 parâmetros de texto, número seguro ou null, com até 64 KiB no total.');
  }
  return { sessionId: request.sessionId, requestId: request.requestId, revision: request.revision,
    sql: request.sql, params: Array.isArray(params) ? [...params] : { ...params } };
}

export function databaseRevision(request) {
  if (!request || typeof request.sessionId !== 'string' || !Number.isSafeInteger(request.revision) || request.revision < 0) {
    throw new Error('Revisão da sessão SQLite obrigatória.');
  }
  return { sessionId: request.sessionId, revision: request.revision };
}
