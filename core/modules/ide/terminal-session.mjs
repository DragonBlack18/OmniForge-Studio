import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { terminalDimensions, terminalEnvironment, terminalInput, TERMINAL_RATE_BYTES,
  TERMINAL_HISTORY_CHARS } from './terminal-contract.mjs';

const ACTIVE = new Set(['starting', 'running', 'closing']);
export const TERMINAL_WORKER_PATH = fileURLToPath(new URL('./terminal-worker.cjs', import.meta.url));

/** Supervision and transport; native PTY only loads inside its own process. */
export class TerminalSession {
  constructor({ createWorker, onEvent = () => {}, onFinished = () => {}, startupMs = 12_000, shutdownMs = 5000 } = {}) {
    if (typeof createWorker !== 'function') throw new Error('Host do terminal não configurado.');
    this.createWorker = createWorker; this.onEvent = onEvent; this.onFinished = onFinished;
    this.startupMs = startupMs; this.shutdownMs = shutdownMs;
    this.worker = null; this.current = null; this.history = ''; this.historyTruncated = false;
    this.attached = false; this.closing = false; this.failure = ''; this.exitDetails = null;
    this.startupTimer = null; this.shutdownTimer = null; this.heartbeat = null;
    this.rateStart = Date.now(); this.rateBytes = 0; this.resolveStart = null; this.rejectStart = null;
  }
  get isRunning() { return ACTIVE.has(this.current?.status); }
  snapshot() { return this.current ? { ...this.current } : null; }
  emit(type, details = {}) {
    if (this.current) this.current.version++;
    try { this.onEvent({ type, session: this.snapshot(), ...details }); } catch { /* Renderer can disappear. */ }
  }
  post(message) {
    try { this.worker?.postMessage(message); return Boolean(this.worker); }
    catch { this.failure ||= 'Comunicação com o processo do terminal interrompida.'; this.close(); return false; }
  }
  start(plan) {
    if (this.isRunning) return Promise.reject(new Error('Já existe uma sessão de terminal ativa.'));
    this.history = ''; this.historyTruncated = false; this.attached = false;
    this.failure = ''; this.closing = false; this.exitDetails = null;
    this.current = { id: randomUUID(), workspace: plan.workspace, shellId: plan.shell.id,
      shellLabel: plan.shell.label, executable: plan.shell.executable, status: 'starting', pid: null,
      cols: plan.cols, rows: plan.rows, sequence: 0, version: 0, startedAt: new Date().toISOString(),
      finishedAt: null, exitCode: null, message: 'Iniciando terminal…' };
    return new Promise((resolve, reject) => {
      this.resolveStart = resolve; this.rejectStart = reject;
      const environment = terminalEnvironment();
      try {
        this.worker = this.createWorker(TERMINAL_WORKER_PATH, { env: environment,
          cwd: plan.workspace, stdio: 'ignore', serviceName: 'OmniForge Terminal' });
        this.worker.on('message', message => this.receive(message, { ...plan, environment }));
        this.worker.once('error', () => { this.failure ||= 'O processo auxiliar do terminal falhou.'; this.close(); });
        this.worker.once('exit', code => this.finish(code));
        this.startupTimer = setTimeout(() => {
          this.failure = 'O PTY não respondeu dentro do prazo de inicialização.'; this.close();
        }, this.startupMs);
        this.heartbeat = setInterval(() => this.post({ type: 'heartbeat' }), 2500);
        this.heartbeat.unref?.();
      } catch {
        this.failure = 'Não foi possível criar o processo auxiliar do terminal.'; this.finish(1);
      }
    });
  }
  receive(message, plan) {
    if (!message || typeof message !== 'object' || !this.isRunning) return;
    if (message.type === 'ready') {
      if (this.closing) this.post({ type: 'close' });
      else this.post({ type: 'start', plan });
    } else if (message.type === 'started') {
      if (this.closing) { this.post({ type: 'close' }); return; }
      clearTimeout(this.startupTimer); this.startupTimer = null;
      this.current.status = 'running'; this.current.pid = message.pid;
      this.current.message = 'Sessão ativa. Os comandos têm as permissões da sua conta.';
      this.emit('started');
      this.resolveStart?.(this.snapshot()); this.resolveStart = null; this.rejectStart = null;
    } else if (message.type === 'data') {
      if (typeof message.chunk !== 'string' || message.chunk.length > 4096 ||
          !Number.isSafeInteger(message.sequence) || message.sequence !== this.current.sequence + 1) {
        this.failure = 'Sequência de saída do terminal inválida.'; this.close(); return;
      }
      this.current.sequence = message.sequence;
      const joined = this.history + message.chunk;
      if (joined.length > TERMINAL_HISTORY_CHARS) this.historyTruncated = true;
      this.history = joined.slice(-TERMINAL_HISTORY_CHARS);
      if (this.attached && !this.closing) this.emit('data', { sequence: message.sequence, chunk: message.chunk });
      else this.ack(message.sequence);
    } else if (message.type === 'failure') {
      this.failure = String(message.error || 'Falha no PTY local.').slice(0, 300); this.close();
    } else if (message.type === 'exit') {
      this.exitDetails = { exitCode: Number.isInteger(message.exitCode) ? message.exitCode : null };
      this.failure ||= typeof message.error === 'string' ? message.error.slice(0, 300) : '';
      // Completion is authoritative only after the utility process exits.
      this.shutdownTimer ||= setTimeout(() => this.forceStop(), this.shutdownMs);
    }
  }
  finish(workerCode) {
    if (!this.current || !this.isRunning) return;
    clearTimeout(this.startupTimer); clearTimeout(this.shutdownTimer); clearInterval(this.heartbeat);
    this.worker = null;
    this.current.status = this.failure ? 'failed' : this.closing ? 'closed' : 'exited';
    this.current.exitCode = this.exitDetails?.exitCode ?? (Number.isInteger(workerCode) ? workerCode : null);
    this.current.finishedAt = new Date().toISOString();
    this.current.message = this.failure || (this.closing ? 'Sessão encerrada.' : 'O shell encerrou a sessão.');
    if (!this.exitDetails && !this.closing && !this.failure) {
      this.current.status = 'failed'; this.current.message = 'O processo do terminal terminou inesperadamente.';
    }
    this.rejectStart?.(new Error(this.current.message)); this.rejectStart = null; this.resolveStart = null;
    this.emit('finished');
    this.onFinished(this.snapshot());
  }
  forceStop() {
    this.failure ||= 'O terminal não confirmou o encerramento no prazo; foi solicitado término forçado.';
    try { this.worker?.kill(); } catch {}
    // A utility process kill normally emits exit. Do not hold the host forever
    // when a broken native bridge fails to emit it; report a failure explicitly.
    if (!this.isRunning) return;
    this.shutdownTimer = setTimeout(() => {
      if (!this.isRunning) return;
      this.failure ||= 'Não foi possível confirmar o encerramento do processo auxiliar.'; this.finish(1);
    }, 2000);
  }
  close() {
    if (!this.isRunning) return false;
    if (this.closing) return true;
    this.closing = true;
    this.current.status = 'closing'; this.current.message = 'Encerrando sessão e processos…';
    clearTimeout(this.startupTimer); this.startupTimer = null;
    this.emit('closing');
    // Avoid post() here: a broken port must not recursively call close().
    try { this.worker?.postMessage({ type: 'close' }); } catch {}
    this.shutdownTimer = setTimeout(() => this.forceStop(), this.shutdownMs);
    return true;
  }
  write(data) {
    terminalInput(data);
    if (this.current?.status !== 'running') throw new Error('Abra uma sessão de terminal antes de digitar.');
    const now = Date.now();
    if (now - this.rateStart >= 1000) { this.rateStart = now; this.rateBytes = 0; }
    const bytes = Buffer.byteLength(data);
    if (this.rateBytes + bytes > TERMINAL_RATE_BYTES) throw new Error('Muita entrada no terminal. Aguarde um instante antes de colar novamente.');
    this.rateBytes += bytes;
    return this.post({ type: 'input', data });
  }
  resize(cols, rows) {
    terminalDimensions(cols, rows);
    if (this.current?.status !== 'running') return false;
    if (this.current.cols === cols && this.current.rows === rows) return true;
    this.current.cols = cols; this.current.rows = rows;
    return this.post({ type: 'resize', cols, rows });
  }
  ack(sequence) {
    if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence > (this.current?.sequence || 0)) return false;
    return this.post({ type: 'ack', sequence });
  }
  attach() {
    this.attached = true;
    const snapshot = { ...this.snapshot(), output: this.history, historyTruncated: this.historyTruncated };
    this.ack(this.current?.sequence || 0);
    return snapshot;
  }
  detach() { this.attached = false; this.ack(this.current?.sequence || 0); return true; }
}
