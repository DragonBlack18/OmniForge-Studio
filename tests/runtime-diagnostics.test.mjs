import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const { createDiagnostics, exportDiagnostics } = createRequire(import.meta.url)('../electron/modules/runtime-diagnostics.cjs');
const fixture = () => createDiagnostics({ version:'0.8.0',versions:{node:'22',electron:'45',chrome:'1',secret:'TOKEN'},
  packaged:false,platform:'test',arch:'x64',clock:()=>1_000_000,memory:()=>({rss:1234}) });
test('diagnostics include only whitelisted technical metadata, never supplied paths or errors',()=>{
  const store=fixture(); store.record('permission-denied'); store.record('/home/user/secret');
  const report=store.snapshot({preferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,preload:'SECRET'},
    operations:{execution:true,workspace:'SECRET'},recoveryAvailable:true});
  assert.equal(report.protections.sandbox,true); assert.equal(report.operations.execution,true);
  assert.equal(report.runtime.mainRssBytes,1234); assert.equal(report.application.channel,'experimental');
  assert.equal(report.eventTotals['permission-denied'],1);
  assert.doesNotMatch(JSON.stringify(report),/SECRET|TOKEN|\/home\/|preload|workspace/);
  report.recentEvents[0].code='mutated';report.eventTotals['permission-denied']=99;
  assert.equal(store.snapshot().recentEvents[0].code,'permission-denied');
  assert.equal(store.snapshot().eventTotals['permission-denied'],1);
});
test('diagnostics ring is bounded and total counters survive eviction',()=>{
  const store=fixture();for(let i=0;i<200;i++)store.record('ipc-denied');
  assert.equal(store.snapshot().recentEvents.length,64);
  assert.equal(store.snapshot().eventTotals['ipc-denied'],200);
});
test('diagnostic export is explicit, JSON-only and never overwrites or follows a link',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'omni-diagnostic-'));
  try {
    const file=path.join(root,'report.json');assert.deepEqual(await fs.readdir(root),[]);
    assert.deepEqual(await exportDiagnostics(file,fixture().snapshot()),{saved:true});
    assert.equal(JSON.parse(await fs.readFile(file,'utf8')).schemaVersion,1);
    const original=await fs.readFile(file);
    await assert.rejects(exportDiagnostics(file,{changed:true}),/já existe/);
    assert.deepEqual(await fs.readFile(file),original);
    await assert.rejects(exportDiagnostics(path.join(root,'report.exe'),{}),/JSON/);
    await assert.rejects(exportDiagnostics('relative.json',{}),/JSON/);
    await assert.rejects(exportDiagnostics(path.join(root,'large.json'),{x:'x'.repeat(64_000)}),/limite/);
    const link=path.join(root,'link.json');
    try { await fs.symlink(file,link); await assert.rejects(exportDiagnostics(link,{}),/já existe/); }
    catch(e){if(!['EPERM','EACCES'].includes(e.code))throw e;}
    assert.deepEqual(await fs.readFile(file),original);
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
