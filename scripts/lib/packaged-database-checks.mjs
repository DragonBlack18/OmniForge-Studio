/** Self-contained: this function is serialized into the installed Electron/Node payload. */
export async function runPackagedDatabaseChecks(coreRoot, workspace) {
  const { pathToFileURL } = await import('node:url');
  const path = await import('node:path');
  const fs = await import('node:fs/promises');
  const assert = (await import('node:assert/strict')).default;
  const { DatabaseSession } = await import(pathToFileURL(path.join(coreRoot, 'modules', 'database', 'database-session.mjs')).href);
  const { randomUUID } = await import('node:crypto');
  const session = new DatabaseSession();
  const request = sql => ({ ...session.snapshot(), requestId: randomUUID(), sql, params: [] });
  try {
    await session.create(workspace);
    const version = (await session.execute(request('SELECT sqlite_version()'))).result.rows[0][0].value;
    assert.match(version, /^3\./);
    await session.execute(request('CREATE TABLE installed_check(id INTEGER PRIMARY KEY, value TEXT UNIQUE); INSERT INTO installed_check VALUES(1,\'installed native SQLite\');'), 'apply');
    const revision = session.snapshot().revision;
    await assert.rejects(session.execute(request("INSERT INTO installed_check VALUES(2,'temporary'); INSERT INTO installed_check VALUES(3,'installed native SQLite');"), 'apply'), /UNIQUE/);
    assert.equal(session.snapshot().revision, revision);
    assert.equal((await session.execute(request('SELECT count(*) FROM installed_check'))).result.rows[0][0].value, '1');
    const saved = await session.saveCopy({ ...session.snapshot(), relativePath: 'installed-check.sqlite' });
    assert.equal(saved.state.dirty, false);
    const original = await fs.readFile(path.join(workspace, 'installed-check.sqlite'));
    assert.equal(original.subarray(0, 16).toString(), 'SQLite format 3\0');
    await assert.rejects(session.saveCopy({ ...session.snapshot(), relativePath: 'installed-check.sqlite' }), /destino já existe/);
    session.reset(); await session.open(workspace, 'installed-check.sqlite');
    const value = (await session.execute(request('SELECT value FROM installed_check WHERE id=1'))).result.rows[0][0].value;
    assert.equal(value, 'installed native SQLite');
    assert.deepEqual(await fs.readFile(path.join(workspace, 'installed-check.sqlite')), original);
    return { sqliteVersion: version, create: true, query: true, apply: true, rollback: true,
      exclusiveCopy: true, reopen: true, sourcePreserved: true };
  } finally { session.dispose(); }
}
