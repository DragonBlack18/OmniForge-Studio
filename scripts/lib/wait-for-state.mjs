import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';

/** Await each observation before testing it. No overlapping polls or ignored errors. */
export async function waitForState(observe, { timeout = 20_000, interval = 25,
  description = 'estado assíncrono' } = {}) {
  if (typeof observe !== 'function' || !Number.isFinite(timeout) || timeout <= 0 ||
      !Number.isFinite(interval) || interval <= 0) throw new TypeError('Espera inválida.');
  const deadline = performance.now() + timeout;
  const failure = () => new Error('Tempo limite aguardando ' + description + '.');
  for (;;) {
    const remaining = deadline - performance.now();
    if (remaining <= 0) throw failure();
    let timer;
    try {
      const result = await Promise.race([
        Promise.resolve().then(observe),
        new Promise((_, reject) => { timer = setTimeout(() => reject(failure()), remaining); })
      ]);
      if (result === true) return;
    } finally { clearTimeout(timer); }
    const left = deadline - performance.now();
    if (left <= 0) throw failure();
    await delay(Math.min(interval, left));
  }
}

export function waitForPageState(page, predicate, arg, options) {
  return waitForState(() => page.evaluate(predicate, arg), options);
}
