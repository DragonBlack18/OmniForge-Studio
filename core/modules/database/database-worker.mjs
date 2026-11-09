/** One job per process: kill is a hard deadline even inside synchronous native SQLite. */
import { executeDatabaseJob } from './database-engine.mjs';

function handle(message) {
  try {
    const result = executeDatabaseJob(message);
    const response = { ok: true, ...result };
    if (process.parentPort) process.parentPort.postMessage(response);
    else process.send(response, () => process.disconnect());
  } catch (error) {
    const response = { ok: false, error: { message: error.message, code: error.code } };
    if (process.parentPort) process.parentPort.postMessage(response);
    else process.send(response, () => process.disconnect());
  }
}
if (process.parentPort) process.parentPort.once('message', event => handle(event.data));
else process.once('message', handle);
