import test from 'node:test';
import assert from 'node:assert/strict';
import {createEditorNavigation} from '../src/modules/ide/editor-navigation.mjs';

function fixture() {
  let snapshot={scope:'one',active:'a',documents:[
    {key:'a',path:'a.ts',uri:'file:///one/a.ts'},
    {key:'b',path:'b.ts',uri:'file:///one/b.ts'}
  ]},visible=true,id=0;
  const timers=new Map(),seen=[],errors=[];
  const bridge=createEditorNavigation({getSnapshot:()=>snapshot,
    activate:(path,position)=>seen.push({path,position}),isVisible:()=>visible,
    onError:error=>errors.push(error),
    schedule:callback=>{timers.set(++id,callback);return id;},cancel:key=>timers.delete(key)});
  return {bridge,timers,seen,errors,get snapshot(){return snapshot;},
    set snapshot(value){snapshot=value;},hide(){visible=false;},
    drain(){for(const [key,callback] of [...timers]){timers.delete(key);callback();}}};
}

test('definition acknowledges an opened model but never changes it during the Monaco command',()=>{
  const f=fixture();
  assert.equal(f.bridge.open('file:///one/b.ts',{startLineNumber:4,startColumn:7}),true);
  assert.deepEqual(f.seen,[]);assert.equal(f.timers.size,1);
  f.drain();assert.deepEqual(f.seen,[{path:'b.ts',position:{line:4,column:7}}]);
  assert.equal(f.timers.size,0);f.bridge.dispose();
});
test('navigation refuses unopened resources and normalizes positions without accessing disk',()=>{
  const f=fixture();
  assert.equal(f.bridge.open('file:///outside.ts'),false);
  assert.equal(f.bridge.open(null),false);assert.equal(f.timers.size,0);
  f.bridge.open('file:///one/b.ts',{lineNumber:NaN,column:-2});f.drain();
  assert.deepEqual(f.seen[0].position,{line:1,column:1});f.bridge.dispose();
});
test('only the latest queued navigation runs; project changes invalidate old requests',()=>{
  const f=fixture();
  f.bridge.open('file:///one/a.ts');f.bridge.open('file:///one/b.ts',{lineNumber:2,column:3});
  assert.equal(f.timers.size,1);f.drain();assert.equal(f.seen[0].path,'b.ts');
  f.bridge.open('file:///one/b.ts');f.snapshot={...f.snapshot,scope:'two'};
  f.drain();assert.equal(f.seen.length,1);f.bridge.dispose();
});
test('manual tab selection, target closure and leaving code cancel stale handoffs',()=>{
  for(const mutate of [f=>{f.snapshot={...f.snapshot,active:'b'};},
    f=>{f.snapshot={...f.snapshot,documents:[f.snapshot.documents[0]]};},f=>f.hide()]){
    const f=fixture();f.bridge.open('file:///one/b.ts');mutate(f);f.drain();
    assert.deepEqual(f.seen,[]);f.bridge.dispose();
  }
});
test('dispose invalidates a callback even if its scheduler has already dequeued it',()=>{
  const f=fixture();f.bridge.open('file:///one/b.ts');const late=[...f.timers.values()][0];
  f.bridge.dispose();f.bridge.dispose();late();assert.equal(f.timers.size,0);
  assert.deepEqual(f.seen,[]);assert.equal(f.bridge.open('file:///one/a.ts'),false);
});
test('activation failure is reported by the owner, not hidden by a global error filter',()=>{
  const errors=[];let callback;
  const bridge=createEditorNavigation({getSnapshot:()=>({scope:'x',active:'a',documents:[{key:'a',path:'a.ts',uri:'a'}]}),
    activate:()=>{throw new Error('activation failed');},isVisible:()=>true,onError:error=>errors.push(error),
    schedule:fn=>{callback=fn;return 1;},cancel:()=>{}});
  bridge.open('a');callback();assert.equal(errors[0].message,'activation failed');bridge.dispose();
  assert.throws(()=>createEditorNavigation({}),/inválido/);
});
