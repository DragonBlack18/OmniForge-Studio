import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {initialCadSketch,makeCadEntity,addCadEntity,cadDxf,cadSvg,validateCadSketch} from '../core/modules/cad/cad2d.mjs';
import {editCadIdentity,editCadLayer} from '../core/modules/cad/cad-edit.mjs';
import {rotateCadEntity,mirrorCadEntity,offsetCadLine,arrayCadEntity,measureCadPoints} from '../core/modules/cad/cad-toolkit.mjs';
import {saveCadDocument,loadCadDocument} from '../core/modules/cad/cad-store.mjs';

function drawing(){
 let sketch=initialCadSketch();
 sketch=addCadEntity(sketch,makeCadEntity('line',{x:0,y:0},{x:40,y:0},'principal','l1'));
 sketch=addCadEntity(sketch,makeCadEntity('rectangle',{x:10,y:10},{x:30,y:20},'principal','r1'));
 sketch=addCadEntity(sketch,makeCadEntity('circle',{x:40,y:40},{x:45,y:40},'principal','c1'));
 return sketch;
}
const by=(s,id)=>s.entities.find(e=>e.id===id);

test('rotation and mirror use real millimetre geometry without mutating original objects',()=>{
 const source=drawing(), snapshot=structuredClone(source);
 const ninety=rotateCadEntity(source,'l1',{angle:90});
 assert.deepEqual(by(ninety,'l1').a,{x:20,y:-20});
 assert.deepEqual(by(ninety,'l1').b,{x:20,y:20});
 assert.deepEqual(source,snapshot);
 const origin=rotateCadEntity(source,'l1',{angle:90,pivot:'origin'});
 assert.deepEqual(by(origin,'l1').a,{x:0,y:0});
 assert.deepEqual(by(origin,'l1').b,{x:0,y:40});
 const flipped=mirrorCadEntity(ninety,'l1',{axis:'x',pivot:'center'});
 assert.deepEqual(by(flipped,'l1').a,{x:20,y:20});
 assert.deepEqual(by(flipped,'l1').b,{x:20,y:-20});
 assert.deepEqual(mirrorCadEntity(flipped,'l1',{axis:'x',pivot:'center'}).entities, ninety.entities);
 const pivot=mirrorCadEntity(source,'c1',{axis:'x',pivot:'origin'});
 assert.deepEqual(by(pivot,'c1').center,{x:40,y:-40});
 assert.equal(by(pivot,'c1').radius,5);
 assert.deepEqual(source,snapshot);
});

test('rectangles remain axis-aligned through quarter turns, rejecting unsupported arbitrary rotation',()=>{
 const source=drawing();
 const result=rotateCadEntity(source,'r1',{angle:90,pivot:'center'});
 const rect=by(result,'r1');
 assert.deepEqual(rect.a,{x:15,y:5});
 assert.deepEqual(rect.b,{x:25,y:25});
 assert.throws(()=>rotateCadEntity(source,'r1',{angle:45}),/90°/);
 assert.throws(()=>rotateCadEntity(source,'r1',{angle:NaN}),/número inválido/);
 assert.throws(()=>rotateCadEntity(source,'r1',{angle:90,pivot:'custom'}),/Pivô/);
 assert.doesNotMatch(cadDxf(result),/SPLINE/);
 assert.match(cadSvg(result),/rect/);
});

test('offset produces mathematically parallel line and checks layer permissions',()=>{
 const source=drawing(), snapshot=structuredClone(source);
 const left=offsetCadLine(source,'l1','parallel1',{distance:10,side:'left'});
 assert.deepEqual(by(left,'parallel1').a,{x:0,y:10});
 assert.deepEqual(by(left,'parallel1').b,{x:40,y:10});
 const right=offsetCadLine(source,'l1','parallel2',{distance:10,side:'right'});
 assert.deepEqual(by(right,'parallel2').a,{x:0,y:-10});
 assert.equal(left.entities.length,4);
 assert.equal((cadDxf(left).match(/\nLINE\n/g)||[]).length,6); // names do not leak into R12
 assert.deepEqual(source,snapshot);
 assert.throws(()=>offsetCadLine(source,'r1','invalid',{distance:5}),/linhas/);
 assert.throws(()=>offsetCadLine(source,'l1','invalid',{distance:0}),/positiva/);
 assert.throws(()=>offsetCadLine(source,'l1','l1',{distance:5}),/repetido/);
 assert.throws(()=>offsetCadLine(source,'l1','invalid',{distance:5,side:'north'}),/Lado/);
 const locked=editCadLayer(source,'principal',{locked:true});
 assert.throws(()=>offsetCadLine(locked,'l1','blocked',{distance:5}),/bloqueada/);
});

test('rectangular array creates real, deterministic copies preserving source and metadata',()=>{
 const source=editCadIdentity(drawing(),'l1',{name:'Traço guia'}),snapshot=structuredClone(source);
 let i=0;
 const output=arrayCadEntity(source,'l1',{rows:2,columns:3,stepX:80,stepY:25},()=>`array${++i}`);
 assert.equal(output.entities.length,source.entities.length+5);
 assert.equal(new Set(output.entities.map(e=>e.id)).size,output.entities.length);
 assert.deepEqual(by(output,'array1').a,{x:80,y:0});
 assert.deepEqual(by(output,'array3').a,{x:0,y:25});
 assert.deepEqual(by(output,'array5').a,{x:160,y:25});
 assert.equal(by(output,'array5').name,'Traço guia [2,3]');
 assert.deepEqual(source,snapshot);
 validateCadSketch(output);
 assert.match(cadDxf(output),/LINE/);
 assert.throws(()=>arrayCadEntity(source,'l1',{rows:9,columns:9},()=>crypto.randomUUID()),/64 cópias/);
 assert.throws(()=>arrayCadEntity(source,'l1',{rows:1,columns:1}),/1 a 64/);
 assert.throws(()=>arrayCadEntity(source,'l1',{rows:1,columns:2,stepX:0}),/diferente de zero/);
 assert.throws(()=>arrayCadEntity(source,'l1',{rows:2,columns:2,stepX:10,stepY:10},()=> 'same'),/repetido/);
 assert.throws(()=>arrayCadEntity(source,'l1',{rows:2,columns:2,stepX:999_999,stepY:20},()=>crypto.randomUUID()),/limites|inválida/);
 assert.deepEqual(source,snapshot);
});

test('object visibility, locks and v1 model remain strict across technical operations',()=>{
 const base=drawing();
 const hidden=editCadIdentity(base,'l1',{visible:false});
 const locked=editCadIdentity(base,'l1',{locked:true});
 for(const s of [hidden,locked]){
  assert.throws(()=>rotateCadEntity(s,'l1',{angle:30}),/bloqueada\/oculta/);
  assert.throws(()=>mirrorCadEntity(s,'l1',{axis:'x'}),/bloqueada\/oculta/);
  assert.throws(()=>arrayCadEntity(s,'l1',{rows:1,columns:2}),/bloqueada\/oculta/);
 }
 assert.throws(()=>mirrorCadEntity(base,'missing'),/não encontrado/);
 assert.throws(()=>mirrorCadEntity(base,'l1',{axis:'z'}),/Eixo/);
 const bad=structuredClone(base);bad.entities[0].a.x=1_000_001;
 assert.throws(()=>rotateCadEntity(bad,'l1',{angle:90}),/inválida|fora/);
});

test('measure point-to-point is read-only and returns world dx/dy/angle/length',()=>{
 assert.deepEqual(measureCadPoints({x:0,y:0},{x:3,y:4}),{dx:3,dy:4,distance:5,angle:53.1301});
 assert.deepEqual(measureCadPoints({x:0,y:10},{x:0,y:0}),{dx:0,dy:-10,distance:10,angle:-90});
 assert.throws(()=>measureCadPoints({x:Infinity,y:1},{x:2,y:3}),/inválido/);
 assert.throws(()=>measureCadPoints(null,{x:2,y:3}),/inválidos/);
});

test('technical operations persist with original schema and versioned CAS on disk',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'omniforge-toolkit-'));
 try{
  const source=drawing();
  const a=rotateCadEntity(source,'l1',{angle:90});
  const b=offsetCadLine(a,'l1','parallel',{distance:5});
  const c=arrayCadEntity(b,'c1',{rows:1,columns:3,stepX:20},(()=>{let i=0;return()=>`c_${++i}`})());
  const result=await saveCadDocument(root,c,null);
  const read=await loadCadDocument(root);
  assert.deepEqual(read.sketch,c);
  assert.equal(read.revision,result.revision);
  assert.equal(read.sketch.schemaVersion,1);
  assert.equal(read.sketch.units,'mm');
  assert.equal(read.sketch.entities.length,6);
  await assert.rejects(saveCadDocument(root,source,null),/revisão|alterado|conflito/i);
 } finally {await fs.rm(root,{recursive:true,force:true});}
});
