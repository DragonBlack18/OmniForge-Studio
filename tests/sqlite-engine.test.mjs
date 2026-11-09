import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { executeDatabaseJob as execute } from '../core/modules/database/database-engine.mjs';
import { databaseRequest, DATABASE_LIMITS } from '../core/modules/database/database-contract.mjs';

const create = sql => execute({ operation: 'apply', image: execute({ operation: 'create' }).image, sql }).image;
const query = (image, sql, params = []) => execute({ operation: 'query', image, sql, params }).result;
const values = result => result.rows.map(row => row.map(cell => cell.value));

test('real SQLite creates relational schema, commits inserts, joins and bound parameters', () => {
  const image = create('CREATE TABLE people(id INTEGER PRIMARY KEY, name TEXT NOT NULL); CREATE TABLE orders(person_id INTEGER REFERENCES people(id), total REAL); INSERT INTO people VALUES(1,\'Ana\'); INSERT INTO orders VALUES(1,12.5); CREATE INDEX orders_person ON orders(person_id);');
  assert.deepEqual(values(query(image, 'SELECT name,total FROM people JOIN orders ON people.id=orders.person_id WHERE name=:name', { name: 'Ana' })), [['Ana', 12.5]]);
  const schema = execute({ operation: 'inspect', image }).schema;
  assert.equal(schema.objects.filter(item => item.type === 'table').length, 2);
  assert.equal(schema.objects.find(item => item.name === 'people').columns[0].primaryKey, 1);
  assert.equal(schema.objects.find(item => item.name === 'people').columns[1].notNull, true);
  assert.equal(schema.objects.find(item => item.name === 'orders_person').type, 'index');
});

test('integer64, duplicate column names, NULL, real numbers and binary bytes remain distinct', () => {
  const result = query(create('CREATE TABLE t(x);'), "SELECT 9223372036854775807 AS x, 1 AS x, NULL AS n, 1.25 AS f, x'00ff10' AS blob, 'ação' AS text");
  assert.equal(result.columns[0].name, result.columns[1].name);
  assert.deepEqual(result.rows[0].slice(0, 4), [{ type: 'integer', value: '9223372036854775807' },
    { type: 'integer', value: '1' }, { type: 'null', value: null }, { type: 'real', value: 1.25 }]);
  assert.deepEqual(result.rows[0][4], { type: 'blob', value: '00ff10', bytes: 3, truncated: false });
  assert.equal(result.rows[0][5].value, 'ação');
});

test('parameters bind literal SQL-looking text, reject unknown values and never concatenate SQL', () => {
  let image = create('CREATE TABLE t(value TEXT);');
  const literal = "x'); DROP TABLE t; --";
  image = execute({ operation: 'apply', image, sql: 'INSERT INTO t VALUES (?)', params: [literal] }).image;
  assert.deepEqual(values(query(image, 'SELECT value FROM t WHERE value=?', [literal])), [[literal]]);
  assert.throws(() => query(image, 'SELECT :known', { wrong: 1 }), /Unknown named parameter/);
  const base = { sessionId: 'a'.repeat(8) + '-aaaa-aaaa-aaaa-' + 'a'.repeat(12), requestId: 'operation', revision: 0, sql: 'SELECT ?' };
  for (const params of [[true], [Infinity], [Number.MAX_SAFE_INTEGER + 1], [{ nested: true }], null]) {
    if (params === null) continue;
    assert.throws(() => databaseRequest({ ...base, params }), /parâmetros|Parâmetros/);
  }
  assert.throws(() => databaseRequest({ ...base, sql: 'x'.repeat(DATABASE_LIMITS.sqlBytes + 1) }), /64 KiB/);
  assert.throws(() => databaseRequest({ ...base, params: ['x'.repeat(DATABASE_LIMITS.parameterBytes)] }), /64 KiB/);
});

test('read mode cannot mutate through DML, DDL, WITH or RETURNING', () => {
  const image = create('CREATE TABLE t(x); INSERT INTO t VALUES(1);');
  for (const sql of ['DELETE FROM t RETURNING x', 'UPDATE t SET x=2', 'CREATE TABLE leaked(x)',
    'WITH source(x) AS (SELECT 2) INSERT INTO t SELECT x FROM source RETURNING x']) {
    assert.throws(() => query(image, sql), /somente leitura/);
  }
  assert.deepEqual(values(query(image, 'SELECT * FROM t')), [['1']]);
});

test('one-statement query detects hidden tail while quoted semicolons and comments remain valid', () => {
  const image = create('CREATE TABLE t(x);');
  for (const sql of ['SELECT 1; DELETE FROM t', 'SELECT 1; /* comment */ SELECT 2', 'SELECT 1; -- comment\nDROP TABLE t']) {
    assert.throws(() => query(image, sql), /uma instrução/);
  }
  assert.deepEqual(values(query(image, "SELECT ';--/*' AS literal; -- trailing comment\n /* safe */")), [[';--/*']]);
  assert.throws(() => execute({ operation: 'apply', image, sql: 'INSERT INTO t VALUES (?); DELETE FROM t;', params: [1] }), /uma instrução/);
});

test('authorizer blocks transaction escapes, temporary state, file access and extensions', () => {
  const image = create('CREATE TABLE t(x);');
  for (const sql of ['BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT user', "ATTACH '/never-created.sqlite' AS other",
    "VACUUM INTO '/never-created.sqlite'", 'PRAGMA writable_schema=ON', 'PRAGMA journal_mode=WAL',
    'CREATE TEMP TABLE temporary(x)', 'CREATE VIRTUAL TABLE v USING fts5(x)',
    "SELECT load_extension('arbitrary')", 'SELECT * FROM pragma_journal_mode']) {
    assert.throws(() => execute({ operation: 'apply', image, sql }), /bloqueado|not authorized|no such|too many attached|cannot VACUUM/);
  }
});

test('full script failure and foreign key failure never return a replacement image', () => {
  const image = create('CREATE TABLE t(x UNIQUE); INSERT INTO t VALUES(1); CREATE TABLE parent(id PRIMARY KEY); CREATE TABLE child(pid REFERENCES parent(id));');
  for (const sql of ['INSERT INTO t VALUES(2); INSERT INTO t VALUES(1);', 'CREATE TABLE transient(x); SELECT missing FROM t;',
    'INSERT INTO t VALUES(3); INSERT INTO child VALUES(999);']) {
    assert.throws(() => execute({ operation: 'apply', image, sql }), /UNIQUE|missing|FOREIGN KEY/);
    assert.deepEqual(values(query(image, 'SELECT x FROM t')), [['1']]);
    assert.deepEqual(values(query(image, "SELECT name FROM sqlite_schema WHERE name='transient'")), []);
  }
});

test('native parser handles triggers containing semicolons as one atomic script', () => {
  const image = create('CREATE TABLE t(x); CREATE TABLE audit(x); CREATE TRIGGER t_insert AFTER INSERT ON t BEGIN INSERT INTO audit VALUES(new.x); INSERT INTO audit VALUES(new.x+1); END; INSERT INTO t VALUES(5);');
  assert.deepEqual(values(query(image, 'SELECT * FROM audit')), [['5'], ['6']]);
});

test('result rows, bytes, cell previews and metadata are bounded', () => {
  const image = create('CREATE TABLE t(x);');
  const many = query(image, 'WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<1100) SELECT x FROM n');
  assert.equal(many.rows.length, 1000); assert.equal(many.truncated, true);
  const cells = query(image, "SELECT printf('%10000s','a'), zeroblob(1000)");
  assert.equal(cells.truncatedCells, 2); assert.equal(cells.rows[0][0].bytes, 10000);
  assert.ok(Buffer.byteLength(cells.rows[0][0].value) <= DATABASE_LIMITS.cellPreviewBytes);
  const bytes = query(image, "WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<1000) SELECT printf('%4000s','a') FROM n");
  assert.equal(bytes.truncated, true); assert.ok(bytes.rows.length < 1000); assert.ok(bytes.bytes <= DATABASE_LIMITS.resultBytes);
  const external = new DatabaseSync(':memory:');
  external.exec('CREATE TABLE t(x "' + 'LONGTYPE'.repeat(1000) + '"); INSERT INTO t VALUES(1)');
  try { assert.ok(query(external.serialize(), 'SELECT * FROM t').columns[0].type.length <= 512); }
  finally { external.close(); }
});

test('untrusted views cannot turn privileged introspection into file/extension or PRAGMA access', () => {
  for (const definition of ["SELECT load_extension('forbidden')", 'SELECT * FROM pragma_database_list',
    'SELECT * FROM pragma_writable_schema(1)']) {
    const db = new DatabaseSync(':memory:'); db.exec('CREATE VIEW hostile AS ' + definition);
    const image = db.serialize(); db.close();
    assert.throws(() => execute({ operation: 'inspect', image }), /unsafe use/);
    assert.throws(() => query(image, 'SELECT * FROM hostile'), /unsafe use|somente leitura/);
  }
});
