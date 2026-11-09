import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {initialCadSketch,makeCadArc,addCadEntity,cadBounds,cadEntityMetrics,cadSvg,cadDxf,snapCadPoint,replaceCadEntity,validateCadSketch} from '../core/modules/cad/cad2d.mjs';
import {cadArcPoint,cadArcSweep,cadArcPath} from '../core/modules/cad/cad-arcs.mjs';
import {parseCadDxf} from '../core/modules/cad/cad-import.mjs';
import {transformCadEntity,duplicateCadEntity} from '../core/modules/cad/cad-edit.mjs';
import {rotateCadEntity,mirrorCadEntity,arrayCadEntity,offsetCadEntity} from '../core/modules/cad/cad-toolkit.mjs';
import {saveCadDocument,loadCadDocument} from '../core/modules/cad/cad-store.mjs';
import {writeCadDraft,readCadDraft} from '../core/modules/cad/cad-recovery.mjs';

const approx=(actual,expected,tolerance=.00015)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} ≠ ${expected}`);
const document=(start=0,end=90)=>addCadEntity(initialCadSketch(),makeCadArc({x:0,y:0},10,start,end,'principal','arc1'));
const pairs=(...values)=>values.join('\n')+'\n';
const dxf=(...values)=>pairs(0,'SECTION',2,'HEADER',9,'$INSUNITS',70,4,0,'ENDSEC',0,'SECTION',2,'ENTITIES',...values,0,'ENDSEC',0,'EOF');

test('analytic arc preserves true quarter-circle dimensions, bounds and snapping',()=>{
  const drawing=document();
  assert.deepEqual(cadBounds(drawing),{minX:0,maxX:10,minY:0,maxY:10});
  approx(cadEntityMetrics(drawing.entities[0]).length,5*Math.PI);
  assert.equal(cadEntityMetrics(drawing.entities[0]).area,0);
  assert.deepEqual(snapCadPoint({x:10.1,y:.1},drawing,10,5),{x:10,y:0,kind:'object'});
  const midpoint=cadArcPoint(drawing.entities[0],45);
  assert.deepEqual(snapCadPoint(midpoint,drawing,10,5),{...midpoint,kind:'object'});
  assert.match(cadSvg(drawing),/<path d="M 10 0 A 10 10 0 0 1 0 10"/);
  assert.equal(cadArcPath(drawing.entities[0],true),'M 10 0 A 10 10 0 0 0 0 -10');
});

test('arcs crossing zero and spanning more than 180 degrees use exact cardinal extrema',()=>{
  const short=document(300,60),long=document(60,300);
  approx(cadArcSweep(short.entities[0]),120);
  assert.deepEqual(cadBounds(short),{minX:5,maxX:10,minY:-8.6603,maxY:8.6603});
  assert.deepEqual(cadBounds(long),{minX:-10,maxX:5,minY:-10,maxY:10});
  assert.match(cadSvg(long),/A 10 10 0 1 1/);
});

test('ARC DXF retains center, radius and angle precision on import-export-import',()=>{
  const parsed=parseCadDxf(dxf(0,'ARC',8,'0',10,23.125,20,-15.25,40,17.125,50,350.123456789,51,73.987654321));
  const arc=parsed.sketch.entities[0];
  assert.equal(arc.type,'arc');
  approx(arc.startAngle,350.123456789,1e-9);
  const reopened=parseCadDxf(cadDxf(parsed.sketch),{assumeMillimeters:true}).sketch.entities[0];
  for(const key of ['radius','startAngle','endAngle'])approx(reopened[key],arc[key],1e-9);
  assert.deepEqual(reopened.center,arc.center);
  assert.deepEqual(cadArcPoint(reopened,reopened.startAngle),cadArcPoint(arc,arc.startAngle));
});

test('positive and negative DXF bulges become exact semicircles with correct orientation',()=>{
  for(const bulge of [1,-1]){
    const {sketch}=parseCadDxf(dxf(0,'LWPOLYLINE',90,2,70,0,10,0,20,0,42,bulge,10,20,20,0));
    const arc=sketch.entities[0];
    assert.equal(arc.type,'arc');assert.equal(arc.radius,10);assert.deepEqual(arc.center,{x:10,y:0});
    assert.equal(cadArcSweep(arc),180);
    assert.equal(cadBounds(sketch).minY,bulge>0?-10:0);
    assert.equal(cadBounds(sketch).maxY,bulge>0?0:10);
    const reopened=parseCadDxf(cadDxf(sketch),{assumeMillimeters:true}).sketch;
    assert.deepEqual(cadBounds(reopened),cadBounds(sketch));
    approx(cadEntityMetrics(reopened.entities[0]).length,10*Math.PI);
  }
});

test('closed polyline keeps curved closing segment and straight segments separately',()=>{
  const {sketch}=parseCadDxf(dxf(0,'LWPOLYLINE',90,3,70,1,10,0,20,0,10,20,20,0,10,20,20,20,42,.5));
  assert.deepEqual(sketch.entities.map(e=>e.type),['line','line','arc']);
  const closing=sketch.entities[2];
  const start=cadArcPoint(closing,closing.startAngle),end=cadArcPoint(closing,closing.endAngle);
  approx(start.x,20);approx(start.y,20);approx(end.x,0);approx(end.y,0);
});

test('rotation, double reflection, scale, copies and array retain analytic arcs and source',()=>{
  const original=document(20,250),snapshot=structuredClone(original),arc=original.entities[0];
  const rotated=rotateCadEntity(original,'arc1',{angle:90});
  assert.equal(rotated.entities[0].startAngle,110);assert.equal(rotated.entities[0].endAngle,340);
  assert.equal(cadEntityMetrics(rotated.entities[0]).length,cadEntityMetrics(arc).length);
  for(const axis of ['x','y']){
    const mirrored=mirrorCadEntity(original,'arc1',{axis});
    assert.equal(cadArcSweep(mirrored.entities[0]),cadArcSweep(arc));
    assert.deepEqual(mirrorCadEntity(mirrored,'arc1',{axis}),original);
  }
  const moved=transformCadEntity(original,'arc1',{scale:2,dx:12,dy:-3});
  assert.equal(moved.entities[0].radius,20);assert.deepEqual(moved.entities[0].center,{x:12,y:-3});
  const copied=duplicateCadEntity(original,'arc1','copy');assert.equal(copied.entities[1].type,'arc');
  let id=0;const array=arrayCadEntity(original,'arc1',{rows:2,columns:2,stepX:50,stepY:70},()=>`copy${++id}`);
  assert.deepEqual(array.entities.at(-1).center,{x:50,y:70});
  assert.deepEqual(original,snapshot);
});

test('circular offsets are concentric and refuse radius collapse, locks or coordinate overflow',()=>{
  const original=document();
  const outer=offsetCadEntity(original,'arc1','outer',{distance:5,side:'outward'});
  assert.equal(outer.entities[1].radius,15);assert.deepEqual(outer.entities[1].center,{x:0,y:0});
  assert.equal(outer.entities[1].startAngle,0);assert.equal(outer.entities[1].endAngle,90);
  const inner=offsetCadEntity(original,'arc1','inner',{distance:2,side:'inward'});assert.equal(inner.entities[1].radius,8);
  assert.throws(()=>offsetCadEntity(original,'arc1','bad',{distance:10,side:'inward'}),/excede o raio/);
  const locked=structuredClone(original);locked.layers[0].locked=true;
  assert.throws(()=>offsetCadEntity(locked,'arc1','bad',{distance:1,side:'outward'}),/bloqueada/);
  assert.throws(()=>makeCadArc({x:999999,y:0},100,0,90),/fora/);
});

test('arc boundaries reject degenerate, non-finite and unsupported geometry without changing source',()=>{
  for(const [radius,start,end] of [[0,0,90],[-1,0,90],[10,90,90],[10,0,360],[10,NaN,90],[10,0,Infinity]])
    assert.throws(()=>makeCadArc({x:0,y:0},radius,start,end));
  const original=document(),before=structuredClone(original);
  assert.throws(()=>replaceCadEntity(original,{...original.entities[0],radius:Infinity}));
  assert.throws(()=>parseCadDxf(dxf(0,'ARC',10,0,20,0,30,2,40,10,50,0,51,90)),/plano XY/);
  assert.throws(()=>parseCadDxf(dxf(0,'ARC',10,0,20,0,40,10,50,0,51,90,0,'SPLINE',70,0)),/cancelada integralmente/);
  assert.deepEqual(original,before);
});

test('arc save, versioned reload and draft recovery retain exact geometry and accept legacy v1',async t=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'of-arc-'));
  t.after(()=>fs.rm(folder,{recursive:true,force:true}));
  const project=path.join(folder,'project'),profile=path.join(folder,'profile');
  await fs.mkdir(project);await fs.mkdir(profile);
  const original=document(300,60),saved=await saveCadDocument(project,original,null);
  assert.deepEqual((await loadCadDocument(project)).sketch,original);
  const changed=transformCadEntity(original,'arc1',{dx:7});
  await writeCadDraft(profile,project,changed,saved.revision,null);
  assert.deepEqual((await readCadDraft(profile,project)).sketch,changed);
  assert.deepEqual((await loadCadDocument(project)).sketch,original);
  assert.equal(validateCadSketch(initialCadSketch()).schemaVersion,1);
});
