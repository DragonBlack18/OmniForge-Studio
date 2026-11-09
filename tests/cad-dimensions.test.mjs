import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {initialCadSketch,addCadEntity,makeCadEntity,makeCadArc,validateCadSketch,replaceCadEntity,deleteCadEntity,cadBounds,cadStats,cadSvg,cadDxf} from '../core/modules/cad/cad2d.mjs';
import {setCadDimension,removeCadDimension,cadGeometryOnlySketch} from '../core/modules/cad/cad-dimension-commands.mjs';
import {cadDimensionMeasurement,cadDimensionLabel,cadDimensionLayout,cadDimensionTolerance} from '../core/modules/cad/cad-dimensions.mjs';
import {transformCadEntity,duplicateCadEntity,setCadDimensions,editCadIdentity} from '../core/modules/cad/cad-edit.mjs';
import {rotateCadEntity,mirrorCadEntity,offsetCadEntity,arrayCadEntity} from '../core/modules/cad/cad-toolkit.mjs';
import {parseCadDxf} from '../core/modules/cad/cad-import.mjs';
import {saveCadDocument,loadCadDocument,exportCadSketch} from '../core/modules/cad/cad-store.mjs';
import {writeCadDraft,readCadDraft} from '../core/modules/cad/cad-recovery.mjs';
import {createNode} from '../core/modules/automation/catalog.mjs';
import {runFlow} from '../core/modules/automation/runner.mjs';

const clone=value=>structuredClone(value);
const reference=(kind,offset=10)=>({kind,mode:'reference',offset});
const fixed=(kind,value,offset=10)=>({kind,mode:'fixed',value,offset});
function drawing(){
  let sketch=initialCadSketch();
  for(const entity of [
    makeCadEntity('line',{x:0,y:0},{x:30,y:40},'principal','line1'),
    makeCadEntity('rectangle',{x:40,y:30},{x:10,y:10},'principal','rect1'),
    makeCadEntity('circle',{x:80,y:30},{x:90,y:30},'principal','circle1'),
    makeCadArc({x:100,y:0},10,300,60,'principal','arc1')])sketch=addCadEntity(sketch,entity);
  sketch.entities[0].source={format:'DXF',entityType:'LINE',handle:'A1',blockPath:['PART'],insertPath:['insert_1']};
  return sketch;
}
const object=(sketch,id)=>sketch.entities.find(entity=>entity.id===id);
async function lab(t){const folder=await fs.mkdtemp(path.join(os.tmpdir(),'of-dimensions-'));t.after(()=>fs.rm(folder,{recursive:true,force:true}));return folder;}

test('first persistent dimension promotes v1 to v2 without changing geometry, identity or source',()=>{
  const original=drawing(),before=clone(original);
  const next=setCadDimension(original,'line1',reference('length'));
  assert.equal(original.schemaVersion,1);assert.equal(next.schemaVersion,2);
  assert.deepEqual(object(next,'line1'),{...object(original,'line1'),dimensions:[reference('length')]});
  assert.deepEqual(original,before);assert.deepEqual(cadStats(next),cadStats(original));
  assert.equal(validateCadSketch(original),original);
  const falseV1={...next,schemaVersion:1};assert.throws(()=>validateCadSketch(falseV1),/versão 2/);
  assert.equal(removeCadDimension(next,'line1','length').schemaVersion,2);
});

test('reference dimensions derive values from edited geometry and retain their annotation settings',()=>{
  const dim=setCadDimension(drawing(),'line1',reference('length',-12));
  const changed=setCadDimensions(dim,'line1',{length:80,angle:0});
  assert.equal(cadDimensionLabel(object(changed,'line1'),object(changed,'line1').dimensions[0]),'80 mm');
  assert.deepEqual(object(changed,'line1').dimensions,[reference('length',-12)]);
  assert.equal(cadDimensionLabel(object(dim,'line1'),object(dim,'line1').dimensions[0]),'50 mm');
});

test('editing a fixed line dimension changes its endpoint while preserving start, direction and source',()=>{
  const original=drawing(),next=setCadDimension(original,'line1',fixed('length',100));
  assert.deepEqual(object(next,'line1').a,{x:0,y:0});assert.deepEqual(object(next,'line1').b,{x:60,y:80});
  assert.deepEqual(object(next,'line1').source,object(original,'line1').source);
  const resized=setCadDimension(next,'line1',fixed('length',75));
  assert.deepEqual(object(resized,'line1').b,{x:45,y:60});
  assert.equal(object(resized,'line1').dimensions[0].value,75);
});

test('fixed rectangle width/height preserve corner orientation; radial dimensions preserve centres and arc angles',()=>{
  let rectangle=setCadDimension(drawing(),'rect1',fixed('width',50));
  rectangle=setCadDimension(rectangle,'rect1',fixed('height',25));
  assert.deepEqual(object(rectangle,'rect1').a,{x:40,y:30});assert.deepEqual(object(rectangle,'rect1').b,{x:-10,y:5});
  const diameter=setCadDimension(drawing(),'circle1',fixed('diameter',32));
  assert.equal(object(diameter,'circle1').radius,16);assert.deepEqual(object(diameter,'circle1').center,{x:80,y:30});
  assert.equal(cadDimensionLabel(object(diameter,'circle1'),object(diameter,'circle1').dimensions[0]),'Ø 32 mm');
  const arc=setCadDimension(drawing(),'arc1',fixed('radius',12.5));
  assert.equal(object(arc,'arc1').radius,12.5);assert.equal(object(arc,'arc1').startAngle,300);assert.equal(object(arc,'arc1').endAngle,60);
});

test('fixed dimensions reject incompatible edits, scale, offsets and rectangle rotations atomically',()=>{
  const line=setCadDimension(drawing(),'line1',fixed('length',50)),before=clone(line);
  for(const action of [
    ()=>replaceCadEntity(line,{...object(line,'line1'),b:{x:60,y:80}}),
    ()=>setCadDimensions(line,'line1',{length:100,angle:0}),
    ()=>transformCadEntity(line,'line1',{scale:2})])assert.throws(action,/Dimensão fixa/);
  assert.deepEqual(line,before);
  const circle=setCadDimension(drawing(),'circle1',fixed('radius',10)),circleBefore=clone(circle);
  assert.throws(()=>offsetCadEntity(circle,'circle1','offset1',{distance:5,side:'outward'}),/Dimensão fixa/);
  assert.deepEqual(circle,circleBefore);
  const rectangle=setCadDimension(drawing(),'rect1',fixed('width',30));
  assert.throws(()=>rotateCadEntity(rectangle,'rect1',{angle:90}),/Dimensão fixa/);
});

test('generic geometry replacement cannot bypass a fixed dimension by dropping or changing metadata',()=>{
  const original=setCadDimension(drawing(),'line1',fixed('length',50));
  const removed={...object(original,'line1'),b:{x:60,y:80}};delete removed.dimensions;
  assert.throws(()=>replaceCadEntity(original,removed),/editor de cotas/);
  assert.throws(()=>replaceCadEntity(original,{...removed,dimensions:[fixed('length',100)]}),/editor de cotas/);
  const released=setCadDimension(original,'line1',reference('length'));
  assert.equal(object(transformCadEntity(released,'line1',{scale:2}),'line1').b.x,45);
});

test('rigid transforms retain line length within quantization bounds and keep fixed intent unchanged',()=>{
  const original=setCadDimension(drawing(),'line1',fixed('length',50));
  for(const angle of [15,30,45,90,135,180,270,359]){
    const rotated=rotateCadEntity(original,'line1',{angle,pivot:'origin'});
    assert.ok(Math.abs(cadDimensionMeasurement(object(rotated,'line1'),'length')-50)<=cadDimensionTolerance('length',50));
    assert.deepEqual(object(rotated,'line1').dimensions,[fixed('length',50)]);
    for(const axis of ['x','y'])validateCadSketch(mirrorCadEntity(rotated,'line1',{axis,pivot:'origin'}));
  }
  const translated=transformCadEntity(original,'line1',{dx:120.125,dy:-21.5});
  assert.deepEqual(object(translated,'line1').dimensions,object(original,'line1').dimensions);
});

test('copies, arrays, parallel lines and deletion carry only the owning object dimensions',()=>{
  const original=setCadDimension(drawing(),'line1',fixed('length',50));
  const copied=duplicateCadEntity(original,'line1','copy1');
  assert.deepEqual(object(copied,'copy1').dimensions,object(original,'line1').dimensions);
  assert.deepEqual(object(copied,'copy1').source,object(original,'line1').source);
  let sequence=0;const array=arrayCadEntity(original,'line1',{rows:2,columns:2},()=>`array${++sequence}`);
  for(const entity of array.entities.filter(item=>item.id.startsWith('array')))assert.deepEqual(entity.dimensions,[fixed('length',50)]);
  const offset=offsetCadEntity(original,'line1','parallel',{distance:5});
  assert.deepEqual(object(offset,'parallel').dimensions,[fixed('length',50)]);
  const deleted=deleteCadEntity(copied,'line1');assert.equal(object(deleted,'line1'),undefined);assert.equal(object(deleted,'copy1').dimensions.length,1);
});

test('object and layer locks protect dimension creation, edits and removal',()=>{
  const dimensioned=setCadDimension(drawing(),'line1',reference('length'));
  for(const target of ['object','layer']){
    const locked=clone(dimensioned);if(target==='object')object(locked,'line1').locked=true;else locked.layers[0].locked=true;
    for(const action of [()=>setCadDimension(locked,'line1',fixed('length',20)),()=>removeCadDimension(locked,'line1','length')])assert.throws(action,/bloqueada/);
  }
});

test('invalid, contradictory and unrepresentable dimension records fail before mutation',()=>{
  const original=drawing(),before=clone(original);
  for(const record of [fixed('length',0),fixed('length',NaN),fixed('length',Infinity),fixed('length',-1),fixed('length',1.00001),
    {...reference('length'),value:20},{...reference('length'),command:'execute'},reference('radius'),reference('length',0),reference('length',Infinity)])
    assert.throws(()=>setCadDimension(original,'line1',record));
  const circle=setCadDimension(original,'circle1',reference('radius'));
  assert.throws(()=>setCadDimension(circle,'circle1',reference('diameter')),/já possui/);
  assert.throws(()=>setCadDimension(original,'circle1',fixed('diameter',.0001)),/Dimensão fixa/);
  const oversized=clone(original);oversized.entities[0].source.blockPath=Array(8).fill('B'.repeat(128));oversized.entities[0].source.insertPath=Array(8).fill('I'.repeat(64));
  oversized.entities=Array.from({length:2000},(_,index)=>({...clone(oversized.entities[0]),id:'long'+index}));
  assert.throws(()=>setCadDimension(oversized,'long0',reference('length')),/1,5 MB/);
  assert.deepEqual(original,before);
});

test('SVG annotations use measured values, upright text and bounds while geometry metrics remain unchanged',()=>{
  const original=drawing();let dimensioned=setCadDimension(original,'line1',reference('length',-30));
  dimensioned=setCadDimension(dimensioned,'circle1',fixed('diameter',20));
  const svg=cadSvg(dimensioned);
  assert.match(svg,/data-cad-dimension="length"/);assert.match(svg,/>50 mm<\/text>/);assert.match(svg,/>Ø 20 mm<\/text>/);
  assert.match(svg,/<text[^>]*transform="scale\(1,-1\)"/);
  assert.deepEqual(cadBounds(dimensioned),cadBounds(original));assert.deepEqual(cadStats(dimensioned),cadStats(original));
  const annotated=cadBounds(dimensioned,{includeDimensions:true});
  for(const entity of dimensioned.entities)for(const dimension of entity.dimensions||[]){
    const box=cadDimensionLayout(entity,dimension).bounds;
    assert.ok(box.minX>=annotated.minX&&box.maxX<=annotated.maxX&&box.minY>=annotated.minY&&box.maxY<=annotated.maxY);
  }
  const hidden=editCadIdentity(dimensioned,'line1',{visible:false});assert.doesNotMatch(cadSvg(hidden),/data-cad-dimension="length"/);
});

test('dimension strokes remain outside text boxes for vertical, diagonal and radial annotations on either side',()=>{
  function intersects(segment,box){
    let first=0,last=1;
    for(const axis of ['x','y']){
      const start=segment.a[axis],delta=segment.b[axis]-start,min=box[axis][0],max=box[axis][1];
      if(Math.abs(delta)<1e-12){if(start<min||start>max)return false;continue;}
      const ends=[(min-start)/delta,(max-start)/delta].sort((a,b)=>a-b);
      first=Math.max(first,ends[0]);last=Math.min(last,ends[1]);if(first>last)return false;
    }
    return true;
  }
  const entities=[...drawing().entities,makeCadEntity('line',{x:0,y:0},{x:0,y:100},'principal','vertical')];
  for(const entity of entities)for(const kind of entity.type==='rectangle'?['width','height']:entity.type==='line'?['length']:['radius'])for(const offset of [-30,-10,10,30]){
    const annotation=cadDimensionLayout(entity,reference(kind,offset)),text=annotation.text;
    const box={x:[text.x-text.width/2,text.x+text.width/2],y:[text.y-text.height/2,text.y+text.height/2]};
    for(const segment of annotation.lines)assert.equal(intersects(segment,box),false,`${entity.id}/${kind}/${offset} crosses its label`);
  }
});

test('DXF requires explicit geometry-only intent and preserves analytic round-trip without touching original',()=>{
  let dimensioned=setCadDimension(drawing(),'line1',fixed('length',50));dimensioned=setCadDimension(dimensioned,'arc1',reference('radius'));
  const before=clone(dimensioned);
  assert.throws(()=>cadDxf(dimensioned),/Confirme a exportação somente da geometria/);
  const geometry=cadGeometryOnlySketch(dimensioned);
  assert.equal(geometry.schemaVersion,1);assert.ok(geometry.entities.every(entity=>entity.dimensions===undefined));
  const exported=cadDxf(geometry);assert.doesNotMatch(exported,/\nTEXT\n|\nDIMENSION\n/);
  assert.deepEqual(cadBounds(parseCadDxf(exported,{assumeMillimeters:true}).sketch),cadBounds(dimensioned));
  assert.deepEqual(dimensioned,before);
});

test('v2 saves, version history and recoverable drafts retain all dimensions and source with existing CAS',async t=>{
  const folder=await lab(t),project=path.join(folder,'project'),profile=path.join(folder,'profile');await fs.mkdir(project);await fs.mkdir(profile);
  const original=drawing(),saved=await saveCadDocument(project,original,null);
  const dimensioned=setCadDimension(original,'line1',fixed('length',80));
  const draft=await writeCadDraft(profile,project,dimensioned,saved.revision,null);
  assert.deepEqual((await readCadDraft(profile,project)).sketch,dimensioned);assert.deepEqual((await loadCadDocument(project)).sketch,original);
  const committed=await saveCadDocument(project,dimensioned,saved.revision);
  assert.deepEqual((await loadCadDocument(project)).sketch,dimensioned);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(project,'.omniforge/cad-history',saved.revision+'.json'),'utf8')),original);
  await assert.rejects(saveCadDocument(project,original,saved.revision),/fora do editor/);
  await assert.rejects(writeCadDraft(profile,project,original,saved.revision,draft.draftRevision),/fora do editor/);
  const invalid=clone(dimensioned);object(invalid,'line1').b.x+=5;
  await assert.rejects(saveCadDocument(project,invalid,committed.revision),/Dimensão fixa/);
  await assert.rejects(writeCadDraft(profile,project,invalid,committed.revision,draft.draftRevision),/Dimensão fixa/);
});

test('native export and automation refuse silent dimension loss and can export a dimensioned SVG',async t=>{
  const project=await lab(t),drawingWithDimensions=setCadDimension(drawing(),'line1',fixed('length',50));
  await saveCadDocument(project,drawingWithDimensions,null);
  await assert.rejects(exportCadSketch(project,'dxf',drawingWithDimensions),/não preserva cotas/);
  await assert.rejects(fs.stat(path.join(project,'.omniforge/output/cad-sketch.dxf')),{code:'ENOENT'});
  const start=createNode('trigger.manual','start',{x:0,y:0}),exporter=createNode('cad.exportDrawing','exporter',{x:200,y:0});
  const flow={schemaVersion:1,name:'Exportar desenho cotado',nodes:[start,exporter],edges:[{id:'edge',source:'start',sourceHandle:'out',target:'exporter',targetHandle:'in'}]};
  const refused=await runFlow(flow,{workspace:project,dryRun:false});assert.equal(refused.ok,false);assert.match(refused.error,/não preserva cotas/);
  exporter.config.format='svg';const result=await runFlow(flow,{workspace:project,dryRun:false});assert.equal(result.ok,true,result.error);
  assert.match(await fs.readFile(path.join(project,'.omniforge/output/cad-sketch.svg'),'utf8'),/>50 mm<\/text>/);
  assert.deepEqual((await loadCadDocument(project)).sketch,drawingWithDimensions);
});
