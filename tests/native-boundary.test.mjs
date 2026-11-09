import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { developmentUrl, trustedDocument, assertSender, assertPayload, createBoundary,
  installSessionPolicy, commitInProgress, assertCanExecute } = require('../electron/security/boundary.cjs');
const { resolveResource, PRODUCTION_CSP } = require('../electron/security/protocol.cjs');
function fixture(url = 'omni://app/') {
  const frame = { url }, wc = { mainFrame: frame, isDestroyed: () => false };
  const window = { webContents: wc, isDestroyed: () => false };
  return { window, event: { sender: wc, senderFrame: frame } };
}
test('native IPC validates top-frame identity, window lifetime and canonical URL', () => {
  const { window, event } = fixture();
  assert.doesNotThrow(() => assertSender(event, window));
  assert.throws(() => assertSender({ ...event, senderFrame: { url: event.senderFrame.url } }, window), /não autorizada/);
  assert.throws(() => assertSender({ ...event, sender: {} }, window), /não autorizada/);
  assert.throws(() => assertSender(event, null), /não autorizada/);
  assert.throws(() => assertSender(event, { ...window, isDestroyed: () => true }), /não autorizada/);
  for (const url of ['omni://evil/','omni://app.evil/','omni://user@app/','omni://app:80/',
    'omni://app/?credential=x','omni://app/other.html','https://app/','file:///app/index.html','about:blank','invalid'])
    assert.equal(trustedDocument(url), false, url);
  for (const url of ['omni://app/','omni://app/index.html','omni://app/#tool']) assert.equal(trustedDocument(url),true);
});
test('development origin is loopback-only and packaged app ignores environment override', () => {
  assert.equal(developmentUrl(true,'https://evil.example/'),null);
  assert.equal(developmentUrl(false,''),null);
  assert.equal(developmentUrl(false,'http://127.0.0.1:5173'),'http://127.0.0.1:5173/');
  for (const value of ['http://127.0.0.1:5173.evil/','http://localhost:5173/','https://127.0.0.1:5173/',
    'http://127.0.0.1:5173/?x=1','http://user@127.0.0.1:5173/','http://127.0.0.1:5173/file'])
    assert.throws(() => developmentUrl(false,value),undefined,value);
  assert.equal(trustedDocument('http://127.0.0.1:5173/', 'http://127.0.0.1:5173/'),true);
  assert.equal(trustedDocument('http://127.0.0.1:5174/', 'http://127.0.0.1:5173/'),false);
});
test('IPC quota accepts bounded real documents, UTF-8 and optional values', () => {
  assert.equal(assertPayload([null, undefined, 'á', true, 12, { nodes: [{ config: { payload: '{"x":42}' } }] }]),true);
  assert.equal(assertPayload(['x'.repeat(1_500_000)]),true);
  assert.throws(() => assertPayload(['界'.repeat(740_000)]), /maior/);
  assert.throws(() => assertPayload(new Array(7).fill(null)), /Argumentos/);
  assert.throws(() => assertPayload([Infinity]), /Tipo/);
  assert.throws(() => assertPayload([new Date()]), /Tipo/);
  assert.throws(() => assertPayload([Buffer.from('secret')]), /Tipo/);
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => assertPayload([cyclic]), /estrutura/);
  assert.throws(() => assertPayload([new Array(80_001)]), /estrutura/);
  let executed = false; const getter = Object.defineProperty({},'x',{ enumerable:true, get(){executed=true;} });
  assert.throws(() => assertPayload([getter]), /Campo/);
  assert.equal(executed,false);
});
test('IPC quotas release on failure and keep cancellation lane available under saturation', async () => {
  const { window, event } = fixture(); const recorded = []; let called = 0;
  const run = createBoundary({ getWindow: () => window, record: code => recorded.push(code) });
  await assert.rejects(run('readFile', () => { called++; }, { ...event, sender:{} }, ['x']), /não autorizada/);
  await assert.rejects(run('readFile', () => { called++; }, event, ['x'.repeat(2_200_001)]), /maior/);
  assert.equal(called,0);
  let release; const pending = new Promise(resolve => { release=resolve; });
  const calls = Array.from({length:32},()=>run('readFile',()=>pending,event,[]));
  await assert.rejects(run('readFile',()=>true,event,[]),/simultâneas/);
  assert.equal(await run('cancelFlow',()=>true,event,[]),true);
  release('done'); await Promise.all(calls);
  await assert.rejects(run('readFile',()=>{throw Error('expected');},event,[]),/expected/);
  assert.equal(await run('readFile',()=>42,event,[]),42);
  assert.deepEqual(recorded,['ipc-denied','payload-denied','ipc-busy']);
});
test('native session denies permission checks, requests, devices and renderer downloads', () => {
  const session = new EventEmitter(); const callbacks={};
  for(const method of ['setPermissionCheckHandler','setPermissionRequestHandler','setDevicePermissionHandler'])
    session[method] = callback => { callbacks[method]=callback; };
  const recorded=[]; installSessionPolicy(session,code=>recorded.push(code));
  assert.equal(callbacks.setPermissionCheckHandler(),false);
  assert.equal(callbacks.setDevicePermissionHandler(),false);
  let granted=true; callbacks.setPermissionRequestHandler(null,'camera',value=>{granted=value;});
  assert.equal(granted,false); let prevented=false;
  session.emit('will-download',{preventDefault(){prevented=true;}});
  assert.equal(prevented,true); assert.deepEqual(recorded,['permission-denied','download-denied']);
});
test('native flow cannot start during write, project registration, CAD, task or scheduling consent', () => {
  assert.doesNotThrow(()=>assertCanExecute({}));
  for(const key of ['save','cad','registry','execution','task','schedulePrompt','terminalPrompt','databasePrompt','databaseSave','databaseWork'])
    assert.throws(()=>assertCanExecute({[key]:true}),/operação atual/);
  for(const key of ['save','cad','registry'])assert.equal(commitInProgress({[key]:true}),true);
  assert.equal(commitInProgress({unsaved:true,execution:true}),false);
  assert.doesNotThrow(()=>assertCanExecute({terminal:true}));
  assert.equal(commitInProgress({terminal:true}),false);
});
test('custom protocol rejects traversal, credentials, ports, alternate methods and NTFS streams', () => {
  assert.equal(resolveResource({url:'omni://app/'},'/dist').absolute,path.resolve('/dist','index.html'));
  assert.equal(resolveResource({url:'omni://app/assets/editor.js',method:'HEAD'},'/dist').head,true);
  for (const url of ['omni://evil/index.html','omni://user@app/index.html','omni://app:80/index.html',
    'omni://app/%2e%2e%2fsecret','omni://app/%5c..%5csecret','omni://app/assets/a.js:secret',
    'omni://app/%00','omni://app//secret','omni://app/%zz','https://app/index.html'])
    assert.throws(()=>resolveResource({url},'/dist'),undefined,url);
  assert.throws(()=>resolveResource({url:'omni://app/',method:'POST'},'/dist'),/method/);
  assert.match(PRODUCTION_CSP,/connect-src 'self';/);
  assert.doesNotMatch(PRODUCTION_CSP,/127\.0\.0\.1|unsafe-eval|https?:/);
  assert.match(PRODUCTION_CSP,/form-action 'none'/);
});

test('closing rejects new operations while keeping diagnostic/cancel control lane alive', async()=>{
  const {window,event}=fixture();let closing=true,calls=0;
  const invoke=createBoundary({getWindow:()=>window,isClosing:()=>closing});
  await assert.rejects(invoke('saveFlow',()=>calls++,event,[]),/Fechamento/);
  assert.equal(calls,0);
  assert.equal(await invoke('runtimeDiagnostics',()=>true,event,[]),true);
  assert.equal(await invoke('cancelFlow',()=>true,event,[]),true);
  assert.equal(await invoke('closeTerminal',()=>true,event,['session-id']),true);
  assert.equal(await invoke('cancelDatabaseQuery',()=>true,event,[]),true);
  await assert.rejects(invoke('writeTerminal',()=>true,event,['session-id','echo forbidden']),/Fechamento/);
  closing=false;assert.equal(await invoke('saveFlow',()=>42,event,[]),42);
});
