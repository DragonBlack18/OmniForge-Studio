/**
 * Single-flight coordinator for one workbench session.
 * React state is a visual indicator, not a synchronous concurrency primitive.
 * Rejected overlapping actions are not queued: they cannot later mutate a
 * different workspace after the active action has finished.
 */
export function createOperationGate() {
  let busy = false;
  return Object.freeze({
    get busy() { return busy; },
    async run(action) {
      if (typeof action !== 'function') throw new TypeError('Operação inválida.');
      if (busy) return { accepted: false };
      busy = true;
      try { return { accepted: true, value: await action() }; }
      finally { busy = false; }
    }
  });
}
