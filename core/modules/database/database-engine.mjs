/** Runs only in a disposable process. SQLite never receives a filesystem path. */
import { DatabaseSync, constants as SQL } from 'node:sqlite';
import { DATABASE_LIMITS as L } from './database-contract.mjs';

const READ_ACTIONS = new Set([SQL.SQLITE_SELECT, SQL.SQLITE_READ, SQL.SQLITE_FUNCTION, SQL.SQLITE_RECURSIVE]);
const DENIED_ACTIONS = new Set([SQL.SQLITE_ATTACH, SQL.SQLITE_DETACH, SQL.SQLITE_TRANSACTION,
  SQL.SQLITE_SAVEPOINT, SQL.SQLITE_PRAGMA, SQL.SQLITE_CREATE_VTABLE, SQL.SQLITE_DROP_VTABLE,
  SQL.SQLITE_CREATE_TEMP_INDEX, SQL.SQLITE_CREATE_TEMP_TABLE, SQL.SQLITE_CREATE_TEMP_TRIGGER,
  SQL.SQLITE_CREATE_TEMP_VIEW, SQL.SQLITE_DROP_TEMP_INDEX, SQL.SQLITE_DROP_TEMP_TABLE,
  SQL.SQLITE_DROP_TEMP_TRIGGER, SQL.SQLITE_DROP_TEMP_VIEW]);
const DENIED_FUNCTIONS = new Set(['load_extension', 'readfile', 'writefile', 'fts3_tokenizer',
  'sqlite_readfile', 'sqlite_writefile']);

function failure(message, code = 'SQLITE_OPERATION_FAILED') {
  const error = new Error(message); error.code = code; return error;
}

function checkSingleStatement(sql, statement) {
  const compiled = statement.sourceSQL;
  if (!sql.startsWith(compiled) || !/^(?:\s|--[^\r\n]*(?:\r?\n|$)|\/\*[\s\S]*?\*\/)*$/.test(sql.slice(compiled.length))) {
    throw failure('Esta ação aceita uma instrução SQL. Para scripts, use Aplicar alterações sem parâmetros.');
  }
}

function args(params) {
  return Array.isArray(params) ? params : [params];
}

function textPreview(text, maximum = L.cellPreviewBytes) {
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.byteLength <= maximum) return { value: text, truncated: false, bytes: bytes.byteLength };
  // TextDecoder drops an incomplete final code point instead of introducing a replacement character.
  return { value: new TextDecoder().decode(bytes.subarray(0, maximum), { stream: true }),
    truncated: true, bytes: bytes.byteLength };
}

function cell(value) {
  if (value === null) return { type: 'null', value: null };
  if (typeof value === 'bigint') return { type: 'integer', value: value.toString() };
  if (typeof value === 'number') return { type: 'real', value: Number.isFinite(value) ? value : String(value) };
  if (typeof value === 'string') return { type: 'text', ...textPreview(value) };
  const bytes = Buffer.from(value);
  return { type: 'blob', value: bytes.subarray(0, 128).toString('hex'), bytes: bytes.byteLength,
    truncated: bytes.byteLength > 128 };
}

function collect(statement, params) {
  const columns = statement.columns().map(item => ({ name: textPreview(item.name, 512).value,
    type: textPreview(item.type || '', 512).value, table: textPreview(item.table || '', 512).value }));
  if (!columns.length) throw failure('Consultar aceita uma instrução que retorna linhas. Use Aplicar alterações para editar o banco.');
  if (columns.length > L.columns) throw failure('A consulta excede 256 colunas.');
  statement.setReadBigInts(true);
  statement.setReturnArrays(true);
  const rows = [];
  let bytes = Buffer.byteLength(JSON.stringify(columns)), truncated = false, truncatedCells = 0;
  if (bytes > L.resultBytes) throw failure('Os metadados da consulta excedem o limite de resultado.');
  for (const row of statement.iterate(...args(params))) {
    if (rows.length >= L.rows) { truncated = true; break; }
    const values = row.map(cell);
    const size = Buffer.byteLength(JSON.stringify(values));
    if (bytes + size > L.resultBytes) { truncated = true; break; }
    rows.push(values); bytes += size;
    truncatedCells += values.filter(value => value.truncated).length;
  }
  return { columns, rows, rowCount: rows.length, truncated, truncatedCells, bytes };
}

function schema(db) {
  const items = db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND type IN ('table','view','index','trigger') ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'view' THEN 1 WHEN 'index' THEN 2 ELSE 3 END, name LIMIT ?")
    .all(L.schemaObjects + 1);
  let truncated = items.length > L.schemaObjects;
  let columnsLeft = L.schemaColumns, columnsTruncated = false, budget = 512 * 1024;
  const objects = [];
  for (const item of items.slice(0, L.schemaObjects)) {
    if (Buffer.byteLength(item.name) > 512 || Buffer.byteLength(item.tbl_name) > 512) { truncated = true; continue; }
    let columns = [];
    if (item.type === 'table' || item.type === 'view') {
      columns = db.prepare('SELECT cid, name, type, "notnull", dflt_value, pk, hidden FROM pragma_table_xinfo(?) LIMIT ?')
        .all(item.name, Math.max(0, Math.min(L.columns, columnsLeft)) + 1);
      const maximum = Math.max(0, Math.min(L.columns, columnsLeft));
      if (columns.length > maximum) columnsTruncated = true;
      columns = columns.slice(0, maximum).filter(column => {
        if (Buffer.byteLength(column.name) <= 512) return true;
        columnsTruncated = true; return false;
      }).map(column => ({ name: column.name,
        type: textPreview(column.type || '', 512).value, notNull: Boolean(column.notnull), primaryKey: column.pk,
        hidden: column.hidden, defaultValue: column.dflt_value == null ? null : textPreview(column.dflt_value, 1024).value }));
      columnsLeft -= columns.length;
    }
    const definition = item.sql ? textPreview(item.sql, 4096) : { value: '', truncated: false };
    const object = { type: item.type, name: item.name, table: item.tbl_name,
      sql: definition.value, definitionTruncated: definition.truncated, columns };
    budget -= Buffer.byteLength(JSON.stringify(object));
    if (budget < 0) { truncated = true; break; }
    objects.push(object);
  }
  return { objects, truncated, columnsTruncated };
}

/** Native authorizer enforces read-only queries and blocks filesystem/transaction escapes. */
export function executeDatabaseJob({ operation, image, sql = '', params = [] }) {
  const started = performance.now();
  const db = new DatabaseSync(':memory:', { allowExtension: false, enableForeignKeyConstraints: true,
    enableDoubleQuotedStringLiterals: false, defensive: true, timeout: 500 });
  let trusted = false, denial = '';
  function internal(fn) { const old = trusted; trusted = true; try { return fn(); } finally { trusted = old; } }
  try {
    if (image) {
      const bytes = Buffer.from(image);
      if (bytes.length > L.imageBytes) throw failure('O banco excede 32 MiB.');
      db.deserialize(bytes);
    }
    db.enableDefensive(true);
    for (const [key, value] of Object.entries({ length: 8 * 1024 * 1024, sqlLength: L.sqlBytes,
      column: L.columns, exprDepth: 100, compoundSelect: 50, vdbeOp: 250_000,
      functionArg: 100, attach: 0, likePatternLength: 4096, variableNumber: 256, triggerDepth: 50 })) db.limits[key] = value;
    db.exec('PRAGMA temp_store=MEMORY; PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF;');
    const pageSize = Number(db.prepare('PRAGMA page_size').get().page_size);
    db.exec('PRAGMA max_page_count=' + Math.floor(L.imageBytes / pageSize));
    db.setAuthorizer((action, first, second) => {
      if (trusted) return SQL.SQLITE_OK;
      if (DENIED_ACTIONS.has(action) ||
          (action === SQL.SQLITE_FUNCTION && DENIED_FUNCTIONS.has(String(second || first).toLowerCase())) ||
          (operation === 'query' && !READ_ACTIONS.has(action))) {
        denial = operation === 'query' ?
          'Consultar é somente leitura. Use Aplicar alterações; transações, PRAGMA, anexos e extensões não são permitidos.' :
          'SQL bloqueado: transações são geridas pelo aplicativo; PRAGMA, ATTACH/DETACH, VACUUM, tabelas temporárias/virtuais e extensões não são permitidos.';
        return SQL.SQLITE_DENY;
      }
      return SQL.SQLITE_OK;
    });
    if (operation === 'inspect' || operation === 'create') {
      const result = internal(() => {
        if (operation === 'inspect') {
          const check = db.prepare('PRAGMA quick_check(1)').get();
          if (check.quick_check !== 'ok') throw failure('Integridade SQLite inválida: ' + String(check.quick_check).slice(0, 300));
        }
        return { schema: schema(db), sqliteVersion: db.prepare('SELECT sqlite_version() AS version').get().version };
      });
      return { ...result, image: internal(() => Buffer.from(db.serialize())), elapsedMs: Math.round(performance.now() - started) };
    }
    if (operation === 'query') {
      internal(() => db.exec('PRAGMA query_only=ON'));
      const statement = db.prepare(sql);
      try {
        checkSingleStatement(sql, statement);
        return { result: collect(statement, params), elapsedMs: Math.round(performance.now() - started) };
      } finally { statement.close(); }
    }
    if (operation !== 'apply') throw failure('Operação SQLite desconhecida.');
    const before = internal(() => db.prepare('SELECT total_changes() AS n').get().n);
    internal(() => db.exec('BEGIN IMMEDIATE'));
    try {
      if (Object.keys(params).length) {
        const statement = db.prepare(sql);
        try { checkSingleStatement(sql, statement); statement.setReadBigInts(true); statement.run(...args(params)); }
        finally { statement.close(); }
      } else db.exec(sql);
      internal(() => db.exec('COMMIT'));
    } catch (error) {
      try { internal(() => db.exec('ROLLBACK')); } catch { /* The entire disposable image is discarded on error. */ }
      throw error;
    }
    const bytes = internal(() => Buffer.from(db.serialize()));
    if (bytes.length > L.imageBytes) throw failure('A alteração excederia o limite de 32 MiB; a sessão anterior foi preservada.');
    return { image: bytes, schema: internal(() => schema(db)),
      changes: internal(() => db.prepare('SELECT total_changes() AS n').get().n) - before,
      elapsedMs: Math.round(performance.now() - started) };
  } catch (error) {
    throw failure(denial || String(error.message).slice(0, 1200), error.code || 'SQLITE_OPERATION_FAILED');
  } finally { db.close(); }
}
