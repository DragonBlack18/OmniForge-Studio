/** Owns accepted snapshots. Subprocesses can fail or be killed without losing prior edits. */
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { verifyWorkspace } from '../workspace/workspace.mjs';
import { DATABASE_LIMITS as L, databaseRequest, databaseRevision } from './database-contract.mjs';
import { databaseHash, readDatabaseSnapshot, saveDatabaseSnapshotCopy, validateDatabaseDestination } from './database-files.mjs';
export { listDatabaseFiles } from './database-files.mjs';
export { databaseRequest, databaseRevision } from './database-contract.mjs';
export const databaseWorkerPath = fileURLToPath(new URL('./database-worker.mjs', import.meta.url));

export function nodeDatabaseProcess() {
  return fork(databaseWorkerPath, [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    serialization: 'advanced', execArgv: [] });
}
function operationError(message, code) { const error = new Error(message); error.code = code; return error; }

export class DatabaseSession {
  #image = null;
  #state = null;
  #active = null;
  #sequence = 0;
  #busy = false;
  #saving = false;
  #spawn;
  #timeout;
  #onEvent;
  #savedHash = null;
  #generation = 0;
  #disposeAfterSave = false;
  constructor({ spawnProcess = nodeDatabaseProcess, timeoutMs = L.timeoutMs, onEvent = () => {} } = {}) {
    this.#spawn = spawnProcess; this.#timeout = Math.max(50, Math.min(timeoutMs, L.timeoutMs)); this.#onEvent = onEvent;
  }
  get isActive() { return this.#busy || Boolean(this.#active); }
  get isSaving() { return this.#saving; }
  get hasSession() { return Boolean(this.#state); }
  get hasUnsavedChanges() { return Boolean(this.#state?.dirty); }
  snapshot() { return this.#state ? structuredClone({ ...this.#state, sequence: this.#sequence,
    running: Boolean(this.#active), requestId: this.#active?.requestId || null }) : null; }
  #emit(type, extra = {}) {
    this.#sequence++;
    try { this.#onEvent({ type, sequence: this.#sequence, state: this.snapshot(), ...extra }); }
    catch { /* Native ownership is independent of the renderer's availability. */ }
  }
  #idle() {
    if (this.isActive || this.#saving) throw new Error('Conclua ou interrompa a operação SQLite atual.');
  }
  assertRevision(request) {
    const token = databaseRevision(request);
    if (!this.#state || token.sessionId !== this.#state.sessionId || token.revision !== this.#state.revision) {
      throw new Error('A sessão SQLite mudou. Atualize a revisão antes de continuar.');
    }
    return token;
  }
  #job(input, requestId) {
    return new Promise((resolve, reject) => {
      let child, timer, ended = false;
      const finish = (error, result) => {
        if (ended) return;
        ended = true; clearTimeout(timer);
        if (this.#active?.requestId === requestId) this.#active = null;
        try { child?.kill('SIGKILL'); } catch { /* Already exited. */ }
        if (error) reject(error); else resolve(result);
      };
      try {
        child = this.#spawn();
        this.#active = { requestId, cancel: reason => finish(operationError(
          reason === 'timeout' ? 'Tempo de 10 s excedido. A última versão aceita da sessão foi preservada.' :
            'Operação SQLite interrompida. A última versão aceita da sessão foi preservada.',
          reason === 'timeout' ? 'SQLITE_TIMEOUT' : 'SQLITE_CANCELLED')) };
        child.once('message', message => {
          if (!message || typeof message.ok !== 'boolean') return finish(operationError('Resposta SQLite inválida.', 'SQLITE_WORKER_FAILED'));
          if (!message.ok) return finish(operationError(message.error?.message || 'Operação SQLite falhou.', message.error?.code));
          if (message.image && message.image.byteLength > L.imageBytes) return finish(operationError('Banco excede 32 MiB.', 'SQLITE_SIZE_LIMIT'));
          finish(null, message);
        });
        child.once('error', error => finish(operationError('Não foi possível iniciar SQLite: ' + error.message, 'SQLITE_WORKER_FAILED')));
        child.once('exit', () => finish(operationError('O processo SQLite foi encerrado sem concluir. A sessão anterior foi preservada.', 'SQLITE_WORKER_FAILED')));
        timer = setTimeout(() => this.#active?.requestId === requestId && this.#active.cancel('timeout'), this.#timeout);
        timer.unref?.();
        if (typeof child.postMessage === 'function') child.postMessage(input); else child.send(input);
        this.#emit('started');
      } catch (error) { finish(error); }
    });
  }
  cancel(request) {
    if (request && (request.sessionId !== this.#state?.sessionId || request.requestId !== this.#active?.requestId)) return false;
    if (!this.#active && !this.#busy) return false;
    this.#generation++;
    this.#active?.cancel('cancelled'); return true;
  }
  async create(root) {
    this.#idle();
    if (this.#state) throw new Error('Feche a sessão SQLite atual antes de criar outro banco.');
    this.#busy = true;
    const token = this.#generation;
    try {
      const workspace = await verifyWorkspace(root);
      if (token !== this.#generation) throw operationError('Abertura SQLite interrompida.', 'SQLITE_CANCELLED');
      const result = await this.#job({ operation: 'create' }, randomUUID());
      if (token !== this.#generation) throw operationError('Abertura SQLite interrompida.', 'SQLITE_CANCELLED');
      this.#image = Buffer.from(result.image); this.#savedHash = null;
      this.#state = { workspace, sessionId: randomUUID(), revision: 0, sourcePath: null, sourceRevision: null,
        bytes: this.#image.length, dirty: true, schema: result.schema, sqliteVersion: result.sqliteVersion, lastSavedCopy: null };
      this.#emit('changed'); return this.snapshot();
    } finally { this.#busy = false; }
  }
  async open(root, relative) {
    this.#idle();
    if (this.#state) throw new Error('Feche a sessão SQLite atual antes de abrir outro banco.');
    this.#busy = true;
    const token = this.#generation;
    try {
      const source = await readDatabaseSnapshot(root, relative);
      if (token !== this.#generation) throw operationError('Abertura SQLite interrompida.', 'SQLITE_CANCELLED');
      const result = await this.#job({ operation: 'inspect', image: source.image }, randomUUID());
      if (token !== this.#generation) throw operationError('Abertura SQLite interrompida.', 'SQLITE_CANCELLED');
      this.#image = Buffer.from(result.image); this.#savedHash = databaseHash(this.#image);
      this.#state = { workspace: source.workspace, sessionId: randomUUID(), revision: 0,
        sourcePath: source.path, sourceRevision: source.revision, bytes: this.#image.length,
        dirty: false, schema: result.schema, sqliteVersion: result.sqliteVersion, lastSavedCopy: null };
      this.#emit('changed'); return this.snapshot();
    } finally { this.#busy = false; }
  }
  async execute(request, operation = 'query') {
    this.#idle();
    const accepted = databaseRequest(request); this.assertRevision(accepted);
    if (!['query', 'apply'].includes(operation)) throw new Error('Operação SQLite inválida.');
    this.#busy = true;
    try {
      const result = await this.#job({ operation, image: this.#image, sql: accepted.sql, params: accepted.params }, accepted.requestId);
      this.assertRevision(accepted);
      if (operation === 'apply') {
        this.#image = Buffer.from(result.image);
        this.#state = { ...this.#state, revision: this.#state.revision + 1, schema: result.schema,
          bytes: this.#image.length, dirty: databaseHash(this.#image) !== this.#savedHash };
      }
      this.#emit('finished', { status: 'completed', requestId: accepted.requestId });
      return { state: this.snapshot(), result: result.result || null, changes: result.changes ?? 0,
        elapsedMs: result.elapsedMs, requestId: accepted.requestId };
    } catch (error) {
      this.#emit('finished', { status: error.code === 'SQLITE_CANCELLED' ? 'cancelled' : error.code === 'SQLITE_TIMEOUT' ? 'timeout' : 'failed',
        requestId: accepted.requestId, message: error.message });
      throw error;
    } finally { this.#busy = false; }
  }
  async prepareSave(request) {
    this.#idle(); this.assertRevision(request);
    const result = await validateDatabaseDestination(this.#state.workspace, request.relativePath);
    return { ...result, sessionId: this.#state.sessionId, revision: this.#state.revision, bytes: this.#image.length };
  }
  async saveCopy(request) {
    this.#idle(); this.assertRevision(request);
    this.#saving = true;
    try {
      const copy = await saveDatabaseSnapshotCopy(this.#state.workspace, request.relativePath, this.#image);
      this.#savedHash = databaseHash(this.#image);
      this.#state = { ...this.#state, dirty: false, lastSavedCopy: copy.path };
      this.#emit('saved', { copy });
      return { state: this.snapshot(), copy };
    } finally {
      this.#saving = false;
      if (this.#disposeAfterSave) { this.#disposeAfterSave = false; this.dispose(); }
    }
  }
  reset({ discard = false } = {}) {
    if (this.#saving) throw new Error('Aguarde a cópia SQLite terminar de salvar.');
    if (this.hasUnsavedChanges && !discard) throw new Error('Salve uma cópia ou feche a sessão SQLite para descartar as alterações.');
    this.cancel(); this.#image = null; this.#state = null; this.#savedHash = null;
    this.#emit('closed'); return true;
  }
  dispose() {
    // Once an exclusive write begins it must finish before releasing the accepted image.
    if (this.#saving) { this.#disposeAfterSave = true; return false; }
    this.#generation++; this.cancel(); this.#image = null; this.#state = null; this.#savedHash = null;
    return true;
  }
}
