import test from 'node:test';
import assert from 'node:assert/strict';
import { createOperationGate } from '../src/utils/operation-gate.mjs';

test('single-flight rejects overlapping workbench actions without queuing side effects', async () => {
  const gate = createOperationGate();
  let unlock;
  const pending = new Promise(resolve => { unlock = resolve; });
  const calls = [];
  const first = gate.run(async () => {
    calls.push('first');
    await pending;
    return 'saved';
  });
  assert.equal(gate.busy, true);
  const second = await gate.run(() => { calls.push('second'); });
  assert.deepEqual(second, { accepted: false });
  assert.deepEqual(calls, ['first']);
  unlock();
  assert.deepEqual(await first, { accepted: true, value: 'saved' });
  assert.equal(gate.busy, false);
  assert.deepEqual(await gate.run(() => { calls.push('third'); return 3; }),
    { accepted: true, value: 3 });
  assert.deepEqual(calls, ['first', 'third']);
});

test('single-flight releases gate on async rejection and synchronous throw', async () => {
  const gate = createOperationGate();
  await assert.rejects(gate.run(async () => { throw new Error('failure'); }), /failure/);
  assert.equal(gate.busy, false);
  await assert.rejects(gate.run(() => { throw new Error('sync'); }), /sync/);
  assert.equal(gate.busy, false);
  assert.deepEqual(await gate.run(async () => 'recovered'),
    { accepted: true, value: 'recovered' });
});

test('distinct workbench sessions never share an operation lock', async () => {
  const a = createOperationGate();
  const b = createOperationGate();
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const running = a.run(() => held);
  assert.equal(a.busy, true);
  assert.equal(b.busy, false);
  assert.deepEqual(await b.run(() => 'independent'),
    { accepted: true, value: 'independent' });
  release();
  await running;
});

test('rejects non-functions without taking the lock', async () => {
  const gate = createOperationGate();
  await assert.rejects(gate.run(null), /inválida/);
  assert.equal(gate.busy, false);
});
