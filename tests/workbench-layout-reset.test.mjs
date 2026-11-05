import test from 'node:test';
import assert from 'node:assert/strict';
import {createLayoutStore,PROFILE_LIMIT,LAYOUT_KEY} from '../src/workbench/layout/layout-model.mjs';
test('explicit resets obey the same capacity limit as resizing and update recency',()=>{
  const data=new Map(),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
  const store=createLayoutStore(storage),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  for(let n=0;n<PROFILE_LIMIT;n++)store.edit(id(n),'cad','inspectorWidth',350);
  store.reset(id(0));store.reset(id(PROFILE_LIMIT));
  const rows=JSON.parse(data.get(LAYOUT_KEY)).profiles;
  assert.equal(rows.length,PROFILE_LIMIT);assert.equal(rows.some(row=>row.scope===id(1)),false);
  assert.equal(rows.some(row=>row.scope===id(0)),true);assert.equal(rows.at(-1).scope,id(PROFILE_LIMIT));
  for(let n=40;n<200;n++)store.reset(id(n));
  assert.equal(JSON.parse(data.get(LAYOUT_KEY)).profiles.length,PROFILE_LIMIT);
  assert.equal(createLayoutStore(storage).getSnapshot(id(199)).status,'saved');
});
