import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initialCadSketch, makeCadEntity, addCadEntity } from '../core/cad2d.mjs';
import { saveCadDocument } from '../core/cad-store.mjs';
import { createNode } from '../core/catalog.mjs';
import { runFlow } from '../core/runner.mjs';
import { validateFlow } from '../core/graph.mjs';

function workflow(type){
 const a=createNode('trigger.manual','start',{x:0,y:0});
 const b=createNode(type,'cad',{x:200,y:0});
 const c=createNode('io.writeJson','finish',{x:400,y:0});c.config.fileName='relatorio.json';
 return {schemaVersion:1,name:'Relatório CAD',nodes:[a,b,c],edges:[
  {id:'e1',source:'start',sourceHandle:'out',target:'cad',targetHandle:'in'},
  {id:'e2',source:'cad',sourceHandle:'out',target:'finish',targetHandle:'in'}
 ]};
}
async function dir(t){const d=await fs.mkdtemp(path.join(os.tmpdir(),'of-cad-flow-'));t.after(()=>fs.rm(d,{recursive:true,force:true}));return d;}

test('fluxo manual → CAD real salvo → relatório JSON real',async t=>{
 const root=await dir(t);let s=initialCadSketch();
 s=addCadEntity(s,makeCadEntity('line',{x:0,y:0},{x:30,y:40}));
 await saveCadDocument(root,s,null);
 const flow=workflow('cad.sketchReport');
 assert.equal(validateFlow(flow).valid,true);
 const result=await runFlow(flow,{workspace:root,dryRun:false});
 assert.equal(result.ok,true,result.error);
 const report=JSON.parse(await fs.readFile(path.join(root,'.omniforge/output/relatorio.json'),'utf8'));
 assert.equal(report.units,'mm');assert.equal(report.count,1);assert.equal(report.totalLength,50);
 assert.equal(result.partialSimulation,false);
});
test('nó CAD exige desenho salvo e falha sem inventar relatório',async t=>{
 const root=await dir(t),flow=workflow('cad.sketchReport');
 const result=await runFlow(flow,{workspace:root,dryRun:false});
 assert.equal(result.ok,false);assert.match(result.error,/Salve primeiro/);
 await assert.rejects(fs.stat(path.join(root,'.omniforge/output/relatorio.json')),{code:'ENOENT'});
});
test('exportar CAD pelo canvas produz DXF real e dry-run não modifica arquivos',async t=>{
 const root=await dir(t);let s=initialCadSketch();s=addCadEntity(s,makeCadEntity('circle',{x:0,y:0},{x:10,y:0}));
 await saveCadDocument(root,s,null);
 const flow=workflow('cad.exportDrawing');
 assert.equal(validateFlow(flow).valid,true);
 const simulation=await runFlow(flow,{workspace:root,dryRun:true});
 assert.equal(simulation.ok,true);assert.equal(simulation.artifacts[0].simulated,true);
 await assert.rejects(fs.stat(path.join(root,'.omniforge/output/cad-sketch.dxf')),{code:'ENOENT'});
 const real=await runFlow(flow,{workspace:root,dryRun:false});
 assert.equal(real.ok,true,real.error);
 assert.match(await fs.readFile(path.join(root,'.omniforge/output/cad-sketch.dxf'),'utf8'),/\nCIRCLE\n/);
 const output=JSON.parse(await fs.readFile(path.join(root,'.omniforge/output/relatorio.json'),'utf8'));
 assert.equal(output.simulated,false);assert.equal(output.format,'dxf');
});
test('formato CAD inválido é rejeitado antes de executar',()=>{
 const flow=workflow('cad.exportDrawing');flow.nodes[1].config.format='dwg';
 // Structural validation permits only configured choices when validated by module.
 assert.equal(validateFlow(flow).valid,false);
});
