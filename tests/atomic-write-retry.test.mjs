import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { atomicWrite, renameAtomicWithRetry } from '../core/workspace.mjs';

const sharingError = code => Object.assign(new Error('sharing violation'), { code });

test('Windows: transient EPERM/EACCES/EBUSY cause bounded retry and eventual success', async () => {
  const attempts = [], sleeps = [];
  await renameAtomicWithRetry('temp', 'final', {
    platform: 'win32',
    rename: async () => {
      attempts.push(true);
      if (attempts.length < 4) throw sharingError(['EPERM', 'EACCES', 'EBUSY'][attempts.length - 1]);
    },
    wait: async ms => sleeps.push(ms)
  });
  assert.equal(attempts.length, 4);
  assert.deepEqual(sleeps, [25, 50, 100]);
});

test('Windows: repeated sharing violations fail closed after fixed number of retries', async () => {
  let attempts = 0;
  const sleeps = [];
  await assert.rejects(renameAtomicWithRetry('temp', 'final', {
    platform: 'win32',
    rename: async () => { attempts++; throw sharingError('EPERM'); },
    wait: async ms => sleeps.push(ms)
  }), { code: 'EPERM' });
  assert.equal(attempts, 9);
  assert.deepEqual(sleeps, [25, 50, 100, 175, 250, 350, 450, 550]);
});

test('non-transient errors and non-Windows platforms never retry', async () => {
  for (const [platform, code] of [['win32', 'EISDIR'], ['linux', 'EPERM']]) {
    let attempts = 0;
    await assert.rejects(renameAtomicWithRetry('temp', 'final', {
      platform,
      rename: async () => { attempts++; throw sharingError(code); },
      wait: async () => { throw Error('unexpected retry'); }
    }), { code });
    assert.equal(attempts, 1);
  }
});

test('atomic replacement keeps data valid and removes temporary files', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'omni-atomic-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const target = path.join(dir, 'schedules.json');
  await atomicWrite(target, '{"schedules":[1]}\n');
  await atomicWrite(target, '{"schedules":[2]}\n');
  assert.equal(await fs.readFile(target, 'utf8'), '{"schedules":[2]}\n');
  assert.deepEqual(await fs.readdir(dir), ['schedules.json']);
});
