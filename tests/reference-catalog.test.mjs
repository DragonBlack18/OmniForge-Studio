import test from 'node:test';
import assert from 'node:assert/strict';
import {REFERENCE_CATALOG,REFERENCE_GROUPS,REFERENCE_STATUS,filterReferences,referenceSource} from '../core/modules/workspace/reference-catalog.mjs';
import {readFile} from 'node:fs/promises';

test('catalogue retains all 150 distinct original references and fixed official destinations',()=>{
  assert.equal(REFERENCE_CATALOG.length,150);
  assert.equal(new Set(REFERENCE_CATALOG.map(row=>row.name)).size,150);
  assert.deepEqual(REFERENCE_CATALOG.map(row=>row.id),Array.from({length:150},(_,i)=>i+1));
  assert.equal(REFERENCE_GROUPS.length,13);
  const hosts=new Set(['github.com','developer.blender.org','help.autodesk.com','spectrum.adobe.com','code.visualstudio.com','www.electronjs.org','nodered.org']);
  for(const row of REFERENCE_CATALOG){
    const url=new URL(row.url);assert.equal(url.protocol,'https:');assert.equal(url.username+url.password+url.port,'');
    assert.ok(hosts.has(url.hostname));assert.ok(REFERENCE_STATUS[row.status]);assert.ok(row.proposal.length>20);
  }
  assert.equal(REFERENCE_CATALOG.filter(row=>row.url.startsWith('https://github.com/')).length,144);
});
test('reference filters combine accented terms, category and actual integration state',()=>{
  assert.deepEqual(filterReferences({query:'ORGANIZACAO worker',status:'integrated'}).map(row=>row.name),['ELK.js']);
  assert.deepEqual(filterReferences({query:'dxf',group:'formats',status:'integrated'}).map(row=>row.name),['dxf-parser']);
  assert.equal(filterReferences({query:'nothing-that-exists'}).length,0);
  assert.equal(filterReferences().length,150);
  assert.equal(filterReferences({status:'integrated'}).length,8);
});
test('native source lookup accepts only catalogue ids, never arbitrary URLs or coercion',()=>{
  assert.equal(referenceSource(1),'https://github.com/n8n-io/n8n');
  for(const input of ['1','https://evil.invalid/',{},null,0,151,1.5,NaN])assert.throws(()=>referenceSource(input));
});
test('new installed reference labels match the locked package versions',async()=>{
  const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  for(const [label,name] of [['ELK.js','elkjs'],['dxf-parser','dxf-parser']])
    assert.equal(REFERENCE_CATALOG.find(row=>row.name===label).evidence,name+'@'+pkg.dependencies[name]);
  for(const name of ['n8n','VS Code','OCCT','xterm.js','node-pty'])
    assert.notEqual(REFERENCE_CATALOG.find(row=>row.name===name).status,'integrated');
});
