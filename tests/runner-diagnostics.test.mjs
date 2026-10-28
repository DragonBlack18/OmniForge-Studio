import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { WORKFLOW_TEMPLATES } from '../core/templates.mjs';
import { runFlow } from '../core/runner.mjs';
import { recordRunHistory, readRunHistory } from '../core/history.mjs';

test('decisão real com ramo SKIP não é rotulada como simulação parcial',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'omni-diagnostic-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const flow=structuredClone(WORKFLOW_TEMPLATES.find(x=>x.id==='pedido-ramificado').flow);
 const real=await runFlow(flow,{workspace:root,dryRun:false});
 assert.equal(real.ok,true);assert.equal(real.dryRun,false);assert.equal(real.partialSimulation,false);
 assert.equal(real.steps.filter(s=>s.status==='SKIP').length,1);
 const record=await recordRunHistory(root,real);
 assert.equal((await readRunHistory(root,record.id)).partialSimulation,false);
 assert.match(await fs.readFile(path.join(root,'.omniforge','output','valor-alto.json'),'utf8'),/total/);
 await assert.rejects(fs.stat(path.join(root,'.omniforge','output','valor-normal.json')),{code:'ENOENT'});
});

test('simulação pura não é parcial quando não depende de serviços externos',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'omni-diagnostic-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const flow=structuredClone(WORKFLOW_TEMPLATES.find(x=>x.id==='pedido-ramificado').flow);
 const simulation=await runFlow(flow,{workspace:root,dryRun:true});
 assert.equal(simulation.ok,true);assert.equal(simulation.partialSimulation,false);
 assert.equal(simulation.steps.filter(s=>s.status==='SKIP').length,1);
 await assert.rejects(fs.stat(path.join(root,'.omniforge')),{code:'ENOENT'});
});
