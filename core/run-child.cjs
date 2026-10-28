'use strict';
// One declarative workflow per process. If the parent dies, immediately stop
// effects instead of running a detached automation after the desktop crashes.
if (typeof process.send !== 'function') process.exit(2);
let started=false;
let completed=false;
process.once('disconnect', () => {
  if (!completed) process.exit(1);
});
function sendFinalResult(result) {
  if (!process.connected) return;
  process.send({type:'result', result}, error => {
    if (error) { process.exitCode=1; return; }
    completed=true;
    if (process.connected) process.disconnect();
  });
}
process.once('message', async message => {
  if (started || message?.type !== 'run') {
    process.exitCode=2;
    if (process.connected) process.disconnect();
    return;
  }
  started=true;
  try {
    const { runFlow } = await import('./runner.mjs');
    const result = await runFlow(message.flow, {
      ...message.options,
      onStep(step) {
        if (process.connected) process.send({type:'step',step});
      }
    });
    sendFinalResult(result);
  } catch {
    // Never return raw system, file, secret or API exception details.
    sendFinalResult({
      ok:false,dryRun:message.options?.dryRun===true,
      stage:'worker',steps:[],artifacts:[],
      error:'Falha interna do executor isolado.'
    });
  }
});
