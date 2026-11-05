import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {initialCadSketch,makeCadEntity,addCadEntity,replaceCadEntity,deleteCadEntity,validateCadSketch,cadSvg,cadDxf,cadStats,cadBounds,snapCadPoint} from '../core/modules/cad/cad2d.mjs';
import {editCadIdentity,editCadLayer,transformCadEntity,duplicateCadEntity,setCadDimensions,cadGeometrySummary} from '../core/modules/cad/cad-edit.mjs';
import {saveCadDocument,loadCadDocument} from '../core/modules/cad/cad-store.mjs';
import {createCadPointer} from '../src/modules/cad/cad-pointer.mjs';
const drawing=()=>addCadEntity(initialCadSketch(),makeCadEntity('line',{x:0,y:0},{x:40,y:0},'principal','line1'));
test('object metadata validates, persists, retains identity and never mutates the input',async()=>{
  const sketch=drawing(),before=structuredClone(sketch);
  const next=editCadIdentity(sketch,'line1',{name:'Perfil externo',layerId:'construcao',visible:true});
  assert.deepEqual(sketch,before);assert.equal(next.entities[0].id,'line1');assert.equal(next.entities[0].name,'Perfil externo');
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'of-studio-'));
  try {const saved=await saveCadDocument(dir,next,null);const loaded=await loadCadDocument(dir);assert.equal(loaded.revision,saved.revision);assert.deepEqual(loaded.sketch,next);}
  finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('locked objects reject rename, transform, delete and geometry updates until explicit unlock',()=>{
  const locked=editCadIdentity(drawing(),'line1',{locked:true});
  for(const op of [()=>editCadIdentity(locked,'line1',{name:'Changed'}),()=>deleteCadEntity(locked,'line1'),()=>replaceCadEntity(locked,{...locked.entities[0],b:{x:80,y:0}}),()=>transformCadEntity(locked,'line1',{dx:1}),()=>duplicateCadEntity(locked,'line1','copy')])assert.throws(op,/bloquead/);
  assert.equal(editCadIdentity(locked,'line1',{locked:false}).entities[0].locked,false);
});
test('layer transfer and layer edits respect source/target locks and dangling references',()=>{
  const lockedTarget=editCadLayer(drawing(),'construcao',{locked:true});
  assert.throws(()=>editCadIdentity(lockedTarget,'line1',{layerId:'construcao'}),/bloqueada/);
  assert.throws(()=>editCadIdentity(drawing(),'line1',{layerId:'absent'}),/inexistente/);
  const lockedSource=editCadLayer(drawing(),'principal',{locked:true});
  assert.throws(()=>editCadIdentity(lockedSource,'line1',{locked:false}),/bloqueada/);
  assert.throws(()=>editCadLayer(lockedSource,'principal',{name:'Bad'}),/Desbloqueie/);
  assert.equal(editCadLayer(lockedSource,'principal',{visible:false}).layers[0].visible,false);
});
test('hidden objects are absent from SVG, DXF, snapping and visible statistics',()=>{
  const hidden=editCadIdentity(drawing(),'line1',{visible:false});
  assert.equal(cadStats(hidden).visible,0);assert.equal(cadBounds(hidden),null);
  assert.doesNotMatch(cadSvg(hidden),/<line /);assert.doesNotMatch(cadDxf(hidden),/\nLINE\n/);
  assert.equal(snapCadPoint({x:39,y:0},hidden,1,5).kind,'grid');
  assert.equal(cadStats(hidden).count,1);assert.equal(cadBounds(hidden,{visibleOnly:false}).maxX,40);
});
test('line length/angle and rectangle size edit true geometry with bounds validation',()=>{
  const line=setCadDimensions(drawing(),'line1',{length:100,angle:90});
  assert.deepEqual(line.entities[0].b,{x:0,y:100});assert.equal(cadGeometrySummary(line.entities[0]).angle,90);
  let rect=addCadEntity(initialCadSketch(),makeCadEntity('rectangle',{x:40,y:30},{x:0,y:0},'principal','rect'));
  rect=setCadDimensions(rect,'rect',{x:5,y:6,width:100,height:20});
  assert.deepEqual(rect.entities[0].a,{x:5,y:6});assert.deepEqual(rect.entities[0].b,{x:105,y:26});
  assert.throws(()=>setCadDimensions(rect,'rect',{x:999999,y:0,width:20,height:20}),/fora|limite/);
  assert.throws(()=>setCadDimensions(line,'line1',{length:0,angle:0}),/limite/);
});
test('transforms and copies are deterministic, preserve metadata and reject invalid values',()=>{
  const sketch=editCadIdentity(drawing(),'line1',{name:'A'});
  const scaled=transformCadEntity(sketch,'line1',{dx:10,dy:5,scale:2});
  assert.deepEqual(scaled.entities[0].a,{x:-10,y:5});assert.deepEqual(scaled.entities[0].b,{x:70,y:5});
  const copied=duplicateCadEntity(sketch,'line1','line2');assert.equal(copied.entities.length,2);
  assert.equal(copied.entities[1].name,'A — cópia');assert.deepEqual(copied.entities[1].a,{x:10,y:10});
  for(const scale of [0,-1,NaN,Infinity,1001])assert.throws(()=>transformCadEntity(sketch,'line1',{scale}));
  assert.throws(()=>duplicateCadEntity(sketch,'line1','line1'),/duplicado/);
  assert.throws(()=>transformCadEntity(sketch,'missing',{}),/encontrado/);
  const circle=addCadEntity(initialCadSketch(),makeCadEntity('circle',{x:20,y:20},{x:30,y:20},'principal','c'));
  const translated=transformCadEntity(circle,'c',{dx:4,dy:-3,scale:2});
  assert.deepEqual(translated.entities[0].center,{x:24,y:17});assert.equal(translated.entities[0].radius,20);
});
test('additive metadata schema accepts legacy documents and rejects hostile or malformed values',()=>{
  assert.equal(validateCadSketch(drawing()).schemaVersion,1);
  for(const name of ['', '  ','x'.repeat(81),'a\ncontrol',23])assert.throws(()=>editCadIdentity(drawing(),'line1',{name}));
  for(const visible of [0,'false',null])assert.throws(()=>editCadIdentity(drawing(),'line1',{visible}));
  assert.throws(()=>editCadIdentity(drawing(),'line1',{type:'circle'}),/editável/);
  assert.throws(()=>editCadLayer(drawing(),'principal',{color:'red;url(evil)'}));
  assert.throws(()=>editCadLayer(drawing(),'principal',{name:''}));
});
test('cursor stream coalesces events and removes listeners and frames on dispose',()=>{
  let callback,cancelled,calls=0;
  const store=createCadPointer(fn=>{calls++;callback=fn;return 1;},id=>{cancelled=id;});
  let renders=0;const unsubscribe=store.subscribe(()=>renders++);
  for(let i=0;i<100;i++)store.update({x:i,y:0,kind:'free'});
  assert.equal(calls,1);assert.equal(renders,0);callback();assert.equal(renders,1);assert.equal(store.getSnapshot().x,99);
  unsubscribe();store.update({x:300,y:0,kind:'free'});store.dispose();assert.equal(cancelled,1);callback();assert.equal(renders,1);
  store.update({x:400,y:0,kind:'free'});assert.equal(calls,2);
});
