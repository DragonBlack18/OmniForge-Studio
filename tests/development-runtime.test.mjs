import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { readProjectFile } from '../core/modules/workspace/workspace.mjs';
import { findDevelopmentToolchain, listDevelopmentTargets, prepareDevelopmentTask,
  validateDevelopmentRequest, LocalDevelopmentRunner } from '../core/modules/ide/development-runtime.mjs';

async function fixture(t, files = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omni-development-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const [relative, content] of Object.entries(files)) {
    const filename = path.join(root, relative);
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await fs.writeFile(filename, content);
  }
  return root;
}
const nodeTool = async (_root, runtime) => {
  assert.equal(runtime, 'node');
  return { executable: process.execPath, canonical: process.execPath, source: 'test-node' };
};
async function selection(root, filename, action = 'run', args = []) {
  return { path: filename, revision: (await readProjectFile(root, filename)).revision, action, args };
}
async function launch(t, root, request, options = {}) {
  const runner = new LocalDevelopmentRunner({ timeoutMs: 8000, ...options });
  t.after(() => runner.cancel());
  const events = [];
  let resolveDone;
  const done = new Promise(resolve => { resolveDone = resolve; });
  const started = await runner.start({ workspace: root, request, onEvent: event => {
    events.push(event);
    if (event.type === 'finished') resolveDone(event.task);
  } });
  return { runner, started, done, events };
}

test('development discovery returns revisioned code only and does not run project code', async t => {
  const root = await fixture(t, {
    'main.cjs': "require('node:fs').writeFileSync('unexpected','1')",
    'src/example.py': "print('python')", 'src/editor.ts': 'const n: number = 1;',
    '.secret.py': 'secret', 'node_modules/vendor/a.js': 'secret',
    'dist/bundle.js': 'generated', '.venv/hidden.py': 'hidden', 'README.md': '# docs'
  });
  const catalog = await listDevelopmentTargets(root);
  assert.deepEqual(catalog.targets.map(item => item.path).sort(), ['main.cjs', 'src/example.py']);
  assert.equal(catalog.workspace, await fs.realpath(root));
  assert.equal(catalog.runtimes.node.available, true);
  assert.equal(catalog.truncated, false);
  for (const item of catalog.targets) assert.match(item.revision, /^[0-9a-f]{64}$/);
  await assert.rejects(fs.stat(path.join(root, 'unexpected')), { code: 'ENOENT' });
});

test('request validation rejects traversal, hidden paths, unsupported runtime, excess args and option injection fields', () => {
  const base = { path: 'code.js', revision: 'a'.repeat(64), action: 'run', args: [] };
  for (const filename of ['../code.js', '/tmp/code.js', 'src\\code.js', '.private/code.js', 'src/../code.js', 'C:/code.py', 'code.ts']) {
    assert.throws(() => validateDevelopmentRequest({ ...base, path: filename }));
  }
  assert.throws(() => validateDevelopmentRequest({ ...base, executable: '/bin/sh' }));
  assert.throws(() => validateDevelopmentRequest({ ...base, action: 'shell' }));
  assert.throws(() => validateDevelopmentRequest({ ...base, args: ['a\0b'] }));
  assert.throws(() => validateDevelopmentRequest({ ...base, args: Array(65).fill('x') }));
  assert.throws(() => validateDevelopmentRequest({ ...base, args: ['a'.repeat(2049)] }));
  assert.throws(() => validateDevelopmentRequest({ ...base, action: 'test', args: ['--eval'] }));
  assert.deepEqual(validateDevelopmentRequest({ ...base, args: ['a b', '; touch x', '--eval'] }).args,
    ['a b', '; touch x', '--eval']);
});

test('source symlinks are rejected and never offered by discovery', async t => {
  const root = await fixture(t, { 'outside.js': 'console.log(1)' });
  try { await fs.symlink(path.join(root, 'outside.js'), path.join(root, 'linked.js')); }
  catch (error) { if (error.code === 'EPERM') return t.skip('Windows runner disallows symlinks'); throw error; }
  const catalog = await listDevelopmentTargets(root);
  assert.deepEqual(catalog.targets.map(item => item.path), ['outside.js']);
  await assert.rejects(prepareDevelopmentTask(root, {
    path: 'linked.js', revision: 'a'.repeat(64), action: 'run', args: []
  }), /links simbólicos/);
});

test('file changed after discovery or during runtime resolution is blocked without running', async t => {
  const root = await fixture(t, { 'main.js': 'console.log(1)' });
  const request = await selection(root, 'main.js');
  await fs.writeFile(path.join(root, 'main.js'), 'console.log(2)');
  await assert.rejects(prepareDevelopmentTask(root, request), /mudou no disco/);
  const current = await selection(root, 'main.js');
  await assert.rejects(prepareDevelopmentTask(root, current, { resolveToolchain: async () => {
    await fs.writeFile(path.join(root, 'main.js'), 'console.log(3)');
    return { executable: process.execPath };
  } }), /mudou durante/);
});

test('runtime discovery is metadata-only, excludes relative PATH, and preserves a virtualenv invocation path', async t => {
  const fakePython = process.platform === 'win32' ? 'bin/python.exe' : 'bin/python3';
  const root = await fixture(t, { [fakePython]: 'not executed' });
  await fs.chmod(path.join(root, fakePython), 0o755);
  const found = await findDevelopmentToolchain(root, 'python', { environment: { PATH: path.join(root, 'bin') } });
  assert.equal(found.executable, path.join(root, fakePython));
  await assert.rejects(findDevelopmentToolchain(root, 'node', { environment: { PATH: 'relative' } }), /não encontrado/);
  if (process.platform === 'win32') return;
  const actualPython = await findDevelopmentToolchain(root, 'python');
  await fs.mkdir(path.join(root, '.venv/bin'), { recursive: true });
  await fs.symlink(actualPython.canonical, path.join(root, '.venv/bin/python'));
  const venv = await findDevelopmentToolchain(root, 'python');
  assert.equal(venv.executable, path.join(root, '.venv/bin/python'));
  assert.equal(venv.source, '.venv');
});

test('real Node script receives literal argv, writes its artifact, and emits stdout/stderr', async t => {
  const root = await fixture(t, { 'main.cjs': [
    "require('node:fs').writeFileSync('artifact.json', JSON.stringify(process.argv.slice(2)))",
    "console.log('NODE_REAL_PASS');console.error('stderr captured');"
  ].join('\n') });
  const args = ['texto com espaços', '; touch injected', '--eval', 'ação'];
  const { done, events } = await launch(t, root, await selection(root, 'main.cjs', 'run', args), { resolveToolchain: nodeTool });
  const result = await done;
  assert.equal(result.status, 'completed');
  assert.equal(result.exitCode, 0);
  assert.match(result.output, /NODE_REAL_PASS/);
  assert.match(result.output, /stderr captured/);
  assert.ok(events.some(event => event.type === 'output' && event.stream === 'stderr'));
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(root, 'artifact.json'), 'utf8')), args);
  await assert.rejects(fs.stat(path.join(root, 'injected')), { code: 'ENOENT' });
});

test('real syntax verification does not execute Node source and reports invalid syntax', async t => {
  const root = await fixture(t, {
    'valid.cjs': "require('node:fs').writeFileSync('must-not-exist','1')",
    'invalid.cjs': 'function {'
  });
  const good = await launch(t, root, await selection(root, 'valid.cjs', 'check'), { resolveToolchain: nodeTool });
  assert.equal((await good.done).status, 'completed');
  await assert.rejects(fs.stat(path.join(root, 'must-not-exist')), { code: 'ENOENT' });
  const bad = await launch(t, root, await selection(root, 'invalid.cjs', 'check'), { resolveToolchain: nodeTool });
  assert.equal((await bad.done).status, 'failed');
});

test('real Node test runner distinguishes passing and failing assertions', async t => {
  const root = await fixture(t, {
    'pass.test.cjs': "require('node:test')('works',()=>require('node:assert/strict').equal(2+2,4));",
    'fail.test.cjs': "require('node:test')('fails',()=>require('node:assert/strict').equal(2+2,5));"
  });
  const good = await launch(t, root, await selection(root, 'pass.test.cjs', 'test'), { resolveToolchain: nodeTool });
  assert.equal((await good.done).status, 'completed');
  const bad = await launch(t, root, await selection(root, 'fail.test.cjs', 'test'), { resolveToolchain: nodeTool });
  assert.equal((await bad.done).status, 'failed');
});

test('real Python execution passes Unicode argv and suppresses implicit bytecode writes', async t => {
  const root = await fixture(t, {
    'main.py': 'import json,sys,helper\nfrom pathlib import Path\nPath("python-output.json").write_text(json.dumps(sys.argv[1:]), encoding="utf-8")\nprint("PYTHON_REAL_PASS ação")\n',
    'helper.py': 'value = 1\n'
  });
  const { done } = await launch(t, root, await selection(root, 'main.py', 'run', ['ação com espaços', '--version']));
  const result = await done;
  assert.equal(result.status, 'completed', result.output);
  assert.match(result.output, /PYTHON_REAL_PASS ação/);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(root, 'python-output.json'), 'utf8')), ['ação com espaços', '--version']);
  await assert.rejects(fs.stat(path.join(root, '__pycache__')), { code: 'ENOENT' });
});

test('real Python check uses AST without running module or creating bytecode', async t => {
  const root = await fixture(t, {
    'valid.py': 'from pathlib import Path\nPath("must-not-exist").write_text("bad")\n',
    'invalid.py': 'def broken(\n'
  });
  const good = await launch(t, root, await selection(root, 'valid.py', 'check'));
  assert.equal((await good.done).status, 'completed');
  await assert.rejects(fs.stat(path.join(root, 'must-not-exist')), { code: 'ENOENT' });
  await assert.rejects(fs.stat(path.join(root, '__pycache__')), { code: 'ENOENT' });
  const bad = await launch(t, root, await selection(root, 'invalid.py', 'check'));
  assert.equal((await bad.done).status, 'failed');
});

test('real Python unittest reports pass, failing assertion and empty test suite accurately', async t => {
  const root = await fixture(t, {
    'tests/test_pass.py': 'import unittest\nclass Example(unittest.TestCase):\n    def test_sum(self):\n        self.assertEqual(2+2,4)\n',
    'tests/test_fail.py': 'import unittest\nclass Example(unittest.TestCase):\n    def test_sum(self):\n        self.assertEqual(2+2,5)\n',
    'tests/test_empty.py': 'value = 42\n'
  });
  for (const [filename, status] of [['test_pass.py', 'completed'], ['test_fail.py', 'failed'], ['test_empty.py', 'failed']]) {
    const run = await launch(t, root, await selection(root, 'tests/' + filename, 'test'));
    const result = await run.done;
    assert.equal(result.status, status, result.output);
    if (filename === 'test_empty.py') assert.equal(result.exitCode, 2);
  }
});

test('nonzero exit is failure; inherited credentials and preload environment never reach child', async t => {
  const root = await fixture(t, { 'env.cjs': [
    "console.log(JSON.stringify({secret:process.env.OMNI_TEST_SECRET,preload:process.env.NODE_OPTIONS,python:process.env.PYTHONPATH}))",
    'process.exit(7)'
  ].join('\n') });
  const before = { secret: process.env.OMNI_TEST_SECRET, options: process.env.NODE_OPTIONS, python: process.env.PYTHONPATH };
  process.env.OMNI_TEST_SECRET = 'should-not-be-inherited';
  process.env.NODE_OPTIONS = '--require does-not-exist';
  process.env.PYTHONPATH = 'should-not-be-inherited';
  t.after(() => {
    for (const [key, value] of [['OMNI_TEST_SECRET', before.secret], ['NODE_OPTIONS', before.options], ['PYTHONPATH', before.python]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  const { done } = await launch(t, root, await selection(root, 'env.cjs'), { resolveToolchain: nodeTool });
  const result = await done;
  assert.equal(result.status, 'failed');
  assert.equal(result.exitCode, 7);
  assert.equal(result.output.trim(), '{}');
});

test('running scripts are mutually exclusive and cancellation releases the runner', async t => {
  const root = await fixture(t, { 'hang.cjs': "console.log('ready');setInterval(()=>{},1000)" });
  const request = await selection(root, 'hang.cjs');
  const { runner, done } = await launch(t, root, request, { resolveToolchain: nodeTool });
  await assert.rejects(runner.start({ workspace: root, request }), /já está em andamento/);
  assert.equal(runner.cancel(), true);
  assert.equal(runner.cancel(), true);
  assert.equal((await done).status, 'cancelled');
  assert.equal(runner.isRunning, false);
});

test('timeout and excessive output fail closed instead of reporting success', async t => {
  const root = await fixture(t, {
    'hang.cjs': 'setInterval(()=>{},1000)',
    'flood.cjs': "process.stdout.write('x'.repeat(200000));setInterval(()=>{},1000)"
  });
  const timeout = await launch(t, root, await selection(root, 'hang.cjs'), { timeoutMs: 200, resolveToolchain: nodeTool });
  assert.equal((await timeout.done).status, 'timeout');
  const flood = await launch(t, root, await selection(root, 'flood.cjs'), { resolveToolchain: nodeTool });
  const result = await flood.done;
  assert.equal(result.status, 'output-limit');
  assert.equal(result.truncated, true);
  assert.ok(result.output.length <= 48000);
});

test('a changed approved interpreter and cancellation during preparation prevent launch', async t => {
  const root = await fixture(t, { 'main.cjs': "require('node:fs').writeFileSync('unexpected','1')" });
  const request = await selection(root, 'main.cjs');
  const runner = new LocalDevelopmentRunner({ resolveToolchain: nodeTool });
  await assert.rejects(runner.start({ workspace: root, request, approvedExecutable: '/different/node' }), /mudou após/);
  assert.equal(runner.snapshot(), null);
  let resume;
  const blocked = new LocalDevelopmentRunner({ resolveToolchain: () => new Promise(resolve => { resume = resolve; }) });
  const pending = blocked.start({ workspace: root, request });
  while (!resume) await new Promise(resolve => setImmediate(resolve));
  assert.equal(blocked.cancel(), true);
  resume(await nodeTool(root, 'node'));
  await assert.rejects(pending, /cancelada antes/);
  assert.equal(blocked.isRunning, false);
  await assert.rejects(fs.stat(path.join(root, 'unexpected')), { code: 'ENOENT' });
});

test('split UTF-8 output is decoded incrementally without replacement characters', async t => {
  const root = await fixture(t, { 'unicode.cjs': [
    "const bytes=Buffer.from('ação ✅');",
    'let i=0; const timer=setInterval(()=>{if(i===bytes.length){clearInterval(timer);return;}process.stdout.write(bytes.subarray(i,i+1));i++},5);'
  ].join('\n') });
  const { done } = await launch(t, root, await selection(root, 'unicode.cjs'), { resolveToolchain: nodeTool });
  assert.equal((await done).output, 'ação ✅');
});

test('cancellation terminates an ordinary descendant instead of leaving a delayed write behind', async t => {
  const root = await fixture(t, { 'parent.cjs': [
    "const {spawn}=require('node:child_process');",
    "const child=spawn(process.execPath,['-e',\"console.log('DESCENDANT_READY');setTimeout(()=>require('node:fs').writeFileSync('orphan.txt','bad'),1000)\"],{stdio:['ignore','inherit','inherit']});",
    'setInterval(()=>{},1000);'
  ].join('\n') });
  const { runner, done } = await launch(t, root, await selection(root, 'parent.cjs'), { resolveToolchain: nodeTool });
  const deadline = Date.now() + 5000;
  while (!runner.snapshot().output.includes('DESCENDANT_READY') && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.match(runner.snapshot().output, /DESCENDANT_READY/);
  runner.cancel();
  assert.equal((await done).status, 'cancelled');
  await new Promise(resolve => setTimeout(resolve, 1200));
  await assert.rejects(fs.stat(path.join(root, 'orphan.txt')), { code: 'ENOENT' });
});

test('a missing runtime binary yields a real failed result and releases its slot', async t => {
  const root = await fixture(t, { 'main.js': 'console.log(1)' });
  const { runner, done } = await launch(t, root, await selection(root, 'main.js'), {
    resolveToolchain: async () => ({ executable: path.join(root, 'missing-node') })
  });
  const result = await done;
  assert.equal(result.status, 'failed');
  assert.match(result.message, /ENOENT/);
  assert.equal(runner.isRunning, false);
});
