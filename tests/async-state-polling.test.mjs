import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { waitForState, waitForPageState } from '../scripts/lib/wait-for-state.mjs';
test('async polling checks resolved false values until true, never the promise itself',async()=>{
  let calls=0,active=0,max=0;
  await waitForState(async()=>{active++;max=Math.max(max,active);await delay(2);active--;return ++calls===4;},{timeout:1000,interval:1});
  assert.equal(calls,4);assert.equal(max,1);
});
test('async polling propagates observation errors and bounds never-resolving IPC',async()=>{
  await assert.rejects(waitForState(()=>{throw Error('do not suppress');}),/do not suppress/);
  let calls=0;
  await assert.rejects(waitForState(()=>{calls++;return new Promise(()=>{});},{timeout:20,interval:1}),/Tempo limite/);
  assert.equal(calls,1);
});
test('page adapter awaits IPC and treats nonboolean/truthy promises as incomplete',async()=>{
  const results=[false,null,1,true];let calls=0;
  const page={evaluate:async(fn,arg)=>{assert.equal(arg,'scope');return results[calls++];}};
  await waitForPageState(page,()=>true,'scope',{timeout:1000,interval:1});assert.equal(calls,4);
});
test('asynchronous desktop observations never use synchronous browser polling',async()=>{
  for(const name of await fs.readdir('scripts')){
    if(!/^smoke-.*\.mjs$/.test(name))continue;
    const source=await fs.readFile('scripts/'+name,'utf8');
    assert.doesNotMatch(source,/\.waitForFunction\(\s*async\b/,name);
  }
});
