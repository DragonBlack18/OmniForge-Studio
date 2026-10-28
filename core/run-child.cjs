'use strict';
// Dedicated workflow worker. It accepts only one declarative run request.
if (typeof process.send !== 'function') process.exit(2);
let started = false;
process.once('message', async message => {
  if (started || message?.type !== 'run') { process.exitCode = 2; process.disconnect(); return; }
  started = true;
  try {
    const { runFlow } = await import('./runner.mjs');
    const result = await runFlow(message.flow, {
      ...message.options,
      onStep(step) {
        if (process.connected) process.send({ type: 'step', step });
      }
    });
    if (process.connected) process.send({ type: 'result', result }, () => process.disconnect());
  } catch {
    if (process.connected) process.send({
      type: 'result',
      result: { ok: false, dryRun: message.options?.dryRun === true,
        stage: 'worker', steps: [], artifacts: [],
        error: 'Falha interna do executor isolado.' }
    }, () => process.disconnect());
  }
});
