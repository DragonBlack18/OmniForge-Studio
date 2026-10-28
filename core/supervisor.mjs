/**
 * OmniForge v0.2.1: bounded supervised OS process for the declarative runner.
 * Crash/timeout isolation is NOT a sandbox for untrusted code.
 */
import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const WORKER = fileURLToPath(new URL('./run-child.cjs', import.meta.url));
const ENV_ALLOWLIST = new Set([
  'PATH','SYSTEMROOT','WINDIR','TEMP','TMP','TMPDIR','HOME',
  'USERPROFILE','LOCALAPPDATA','APPDATA','LANG'
]);
export const DEFAULT_RUN_TIMEOUT_MS = 120_000;
export const MAX_RUN_TIMEOUT_MS = 180_000;
function workerEnvironment() {
  const env = { ELECTRON_RUN_AS_NODE: '1' };
  for (const [key, value] of Object.entries(process.env))
    if (ENV_ALLOWLIST.has(key.toUpperCase()) && typeof value === 'string') env[key] = value;
  return env;
}
export function runSupervisedFlow(flow, options = {}, {
  timeoutMs = DEFAULT_RUN_TIMEOUT_MS, signal, onProgress
} = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > MAX_RUN_TIMEOUT_MS)
    throw new Error('Tempo limite de execução inválido (100 a 180000 ms).');
  if (!options || typeof options.workspace !== 'string' || !options.workspace ||
      typeof options.dryRun !== 'boolean' || typeof options.networkApproved !== 'boolean' ||
      !Array.isArray(options.projects) || options.projects.length > 200 ||
      (options.extensions !== undefined &&
       (!Array.isArray(options.extensions) || options.extensions.length > 40)))
    throw new Error('Parâmetros do executor supervisionado inválidos.');
  if (signal && (typeof signal.aborted !== 'boolean' || typeof signal.addEventListener !== 'function'))
    throw new Error('Sinal de cancelamento inválido.');
  const runId = randomUUID();
  const steps = [];
  let partialArtifacts = [];
  const failed = reason => ({
    ok:false,runId,dryRun:options.dryRun,partialSimulation:false,
    stage:'supervision',steps:[...steps],artifacts:[...partialArtifacts],error:reason
  });
  if (signal?.aborted) return Promise.resolve(failed('Execução cancelada antes do início.'));
  let child;
  try {
    child = fork(WORKER, [], {
      execPath:process.execPath,execArgv:[],windowsHide:true,
      stdio:['ignore','ignore','ignore','ipc'],env:workerEnvironment()
    });
  } catch {
    return Promise.resolve(failed('Não foi possível iniciar o executor separado.'));
  }
  return new Promise(resolve => {
    let finished=false, timer, onAbort;
    const finish = result => {
      if (finished) return;
      finished=true;
      clearTimeout(timer);
      if (onAbort && signal) signal.removeEventListener('abort',onAbort);
      try { if(child.connected) child.disconnect(); } catch {}
      resolve(result);
    };
    const terminate = () => { try { child.kill(); } catch {} };
    child.on('message', msg => {
      if (finished || !msg || typeof msg !== 'object') return;
      if (msg.type === 'step' && steps.length < 400) {
        const raw=msg.step;
        if (!raw || !['PASS','FAIL','SKIP'].includes(raw.status)) return;
        const step={
          nodeId:String(raw.nodeId ?? '').slice(0,80),
          type:String(raw.type ?? '').slice(0,80),
          status:raw.status,
          elapsedMs:Number.isSafeInteger(raw.elapsedMs)?Math.max(0,raw.elapsedMs):0
        };
        steps.push(step);
        // Persist evidence of completed file writes even if the next step
        // hangs and the worker must be terminated. Never trust raw paths.
        if (Array.isArray(raw.artifacts) && raw.artifacts.length <= 100) {
          partialArtifacts = raw.artifacts.filter(a =>
            typeof a?.relativePath === 'string' &&
            /^\.omniforge\/output\/[a-zA-Z0-9_.-]{1,120}$/.test(a.relativePath) &&
            Number.isSafeInteger(a.bytes) && a.bytes >= 0 &&
            typeof a.simulated === 'boolean'
          ).map(a=>({relativePath:a.relativePath,bytes:a.bytes,simulated:a.simulated}));
        }
        try { onProgress?.(step); } catch {}
      } else if (msg.type === 'result') {
        if (typeof msg.result?.ok !== 'boolean' || !Array.isArray(msg.result.steps) ||
            !Array.isArray(msg.result.artifacts))
          finish(failed('O executor respondeu com um resultado incompatível.'));
        else finish(msg.result);
      }
    });
    child.once('error', () => {
      terminate(); finish(failed('O processo de execução não pôde ser iniciado.'));
    });
    child.once('exit', (code, exitSignal) => {
      finish(failed('Executor encerrado inesperadamente (código ' +
        (code===null?String(exitSignal):String(code)) + ').'));
    });
    timer=setTimeout(()=>{
      terminate();finish(failed('Execução interrompida: excedeu o limite de ' +
        timeoutMs + ' ms. Efeitos externos anteriores não são revertidos.'));
    },timeoutMs);
    if (signal) {
      onAbort=()=>{
        terminate();
        finish(failed('Execução cancelada pelo usuário. Efeitos externos anteriores não são revertidos.'));
      };
      signal.addEventListener('abort',onAbort,{once:true});
      if (signal.aborted) { onAbort();return; }
    }
    try {
      child.send({type:'run',flow,options},error=>{
        if(error){terminate();finish(failed('Falha no canal de comunicação do executor.'));}
      });
    } catch {
      terminate();finish(failed('Falha ao enviar a execução para o processo separado.'));
    }
  });
}
