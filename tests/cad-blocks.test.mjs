import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseCadDxf} from '../core/modules/cad/cad-import.mjs';
import {cadBounds,cadDxf,validateCadSketch,cadEntityMetrics} from '../core/modules/cad/cad2d.mjs';
import {transformCadEntity} from '../core/modules/cad/cad-edit.mjs';
import {saveCadDocument,loadCadDocument} from '../core/modules/cad/cad-store.mjs';
const fixture=fileURLToPath(new URL('./fixtures/cad/static-mechanical-blocks.dxf',import.meta.url));
const pairs=(...values)=>values.join('\n')+'\n';
const line=[0,'LINE',8,'0',10,5,20,5,11,15,21,5];
const circle=[0,'CIRCLE',8,'0',10,0,20,0,40,10];
const block=(name,geometry=line,flags=0)=>[0,'BLOCK',2,name,70,flags,10,5,20,5,30,0,...geometry,0,'ENDBLK'];
const insert=(name,extra=[])=>[0,'INSERT',2,name,10,100,20,50,...extra];
const source=(blocks,entities,units=4)=>pairs(0,'SECTION',2,'HEADER',9,'$INSUNITS',70,units,0,'ENDSEC',
  0,'SECTION',2,'BLOCKS',...blocks,0,'ENDSEC',0,'SECTION',2,'ENTITIES',...entities,0,'ENDSEC',0,'EOF');

test('mechanical fixture expands rotated/scaled/mirrored blocks, layers and bounded provenance',async()=>{
  const result=parseCadDxf(await fs.readFile(fixture,'utf8'));
  const {sketch,meta}=result;
  assert.equal(meta.expandedBlockCount,2);assert.equal(meta.sourceCount,2);assert.equal(meta.entityCount,8);
  assert.match(meta.warnings[0],/entidades independentes/);
  const [arc,line,hole]=sketch.entities;
  assert.equal(arc.type,'arc');assert.deepEqual(arc.center,{x:100,y:40});assert.equal(arc.radius,40);
  assert.equal(arc.startAngle,90);assert.equal(arc.endAngle,270);
  assert.deepEqual(line.a,{x:100,y:0});assert.deepEqual(line.b,{x:100,y:80});
  assert.deepEqual(hole.center,{x:90,y:20});assert.equal(hole.radius,4);
  assert.equal(arc.layerId,'machined');assert.equal(hole.layerId,'holes');
  assert.deepEqual(arc.source,{format:'DXF',entityType:'ARC',handle:'A1',blockPath:['FLANGE'],insertPath:['insert_1']});
  assert.deepEqual(sketch.entities[4].source.insertPath,['insert_2']);
  assert.equal(sketch.entities[4].startAngle,0);assert.equal(sketch.entities[4].endAngle,180);
});

test('block base point, nested transforms and millimetre conversion compose in the correct order',()=>{
  const child=block('CHILD');
  const parent=block('PARENT',[0,'INSERT',2,'CHILD',10,15,20,5,41,2,42,2,50,90]);
  const {sketch,meta}=parseCadDxf(source([...child,...parent],insert('PARENT',[41,2,42,2]),5));
  const entity=sketch.entities[0];
  assert.equal(meta.expandedBlockCount,2);
  assert.deepEqual(entity.a,{x:1200,y:500});assert.deepEqual(entity.b,{x:1200,y:900});
  assert.deepEqual(entity.source.blockPath,['PARENT','CHILD']);
});

test('non-uniformly scaled straight geometry is retained while transformed ellipses fail closed',()=>{
  const straight=parseCadDxf(source(block('B'),insert('B',[41,2,42,3]))).sketch.entities[0];
  assert.deepEqual(straight.a,{x:100,y:50});assert.deepEqual(straight.b,{x:120,y:50});
  assert.throws(()=>parseCadDxf(source(block('B',circle),insert('B',[41,2,42,3]))),/elipse.*cancelada integralmente/);
});

test('block import refuses missing, cyclic, excessive depth, dynamic, xref, attributes and INSERT arrays',()=>{
  assert.throws(()=>parseCadDxf(source([],insert('MISSING'))),/inexistente/);
  assert.throws(()=>parseCadDxf(source(block('CYCLE',insert('CYCLE')),insert('CYCLE'))),/circular/);
  for(const flags of [1,2,4,8,16,32,64])assert.throws(()=>parseCadDxf(source(block('B',line,flags),insert('B'))),/anônimo|XREF/);
  assert.throws(()=>parseCadDxf(source(block('*U1'),insert('*U1'))),/anônimo/);
  assert.throws(()=>parseCadDxf(source(block('B'),insert('B',[66,1]))),/atributos/);
  assert.throws(()=>parseCadDxf(source(block('B'),insert('B',[70,2,71,2]))),/matriz/);
  assert.throws(()=>parseCadDxf(source(block('B',[0,'TEXT',10,0,20,0,1,'hidden']),insert('B'))),/não suportadas.*cancelada/);
  const chain=[];for(let i=0;i<9;i++)chain.push(...block('B'+i,i===8?line:insert('B'+(i+1))));
  assert.throws(()=>parseCadDxf(source(chain,insert('B0'))),/profundidade/);
});

test('hostile/ambiguous symbols, paper space and conflicting planar groups fail closed',()=>{
  for(const name of ['__proto__','constructor','prototype'])assert.throws(()=>parseCadDxf(source(block(name),insert(name))),/inválido/);
  assert.throws(()=>parseCadDxf(source([...block('B'),...block('b')],insert('B'))),/duplicado/);
  assert.throws(()=>parseCadDxf(source(block('B'),insert('B',[67,1]))),/paper space/);
  assert.throws(()=>parseCadDxf(source(block('B'),insert('B',[30,0,30,8]))),/plano XY/);
});

test('frozen layers remain invisible while lock and non-frozen layer states are retained',()=>{
  for(const [flags,color,visible,locked] of [[1,7,false,false],[5,7,false,true],[4,7,true,true],[0,-7,false,false],[2,7,true,false]]){
    const table=pairs(0,'SECTION',2,'TABLES',0,'TABLE',2,'LAYER',70,1,
      0,'LAYER',2,'frozen',70,flags,62,color,6,'CONTINUOUS',0,'ENDTAB',0,'ENDSEC');
    const input=source(block('B'),insert('B',[8,'frozen'])).replace('0\nSECTION\n2\nBLOCKS',table+'0\nSECTION\n2\nBLOCKS');
    const sketch=parseCadDxf(input).sketch;
    assert.equal(sketch.layers[0].visible,visible);assert.equal(sketch.layers[0].locked,locked);
    assert.equal(sketch.entities.length,1);
    assert.equal(cadBounds(sketch)===null,!visible);
    assert.notEqual(cadBounds(sketch,{visibleOnly:false}),null);
  }
});

test('XCLIP metadata rejects the complete import before block clipping can be silently lost',async()=>{
  const clipped=await fs.readFile(new URL('./fixtures/cad/static-clipped-block.dxf',import.meta.url),'utf8');
  assert.throws(()=>parseCadDxf(clipped),/XCLIP\/SPATIAL_FILTER.*cancelada integralmente/);
  const plain=source(block('B'),insert('B'));
  // Each marker is sufficient, including an orphaned filter dictionary. The
  // importer must not interpret missing relationships as permission to drop it.
  for(const metadata of [[0,'DICTIONARY',3,'ACAD_FILTER',360,'F1'],[0,'SPATIAL_FILTER'],[0,'FILTER',100,'AcDbSpatialFilter']]){
    const input=plain.replace('0\nEOF\n',pairs(0,'SECTION',2,'OBJECTS',...metadata,0,'ENDSEC',0,'EOF'));
    assert.throws(()=>parseCadDxf(input),/XCLIP\/SPATIAL_FILTER.*cancelada integralmente/);
  }
  assert.equal(parseCadDxf(plain).sketch.entities.length,1);
});

test('block expansion limits are enforced before partial document is exposed',()=>{
  const entities=[];for(let i=0;i<1001;i++)entities.push(...insert('B'));
  assert.throws(()=>parseCadDxf(source(block('B',[...line,...circle]),entities)),/2000 entidades após conversão/);
});

test('expanded provenance is rejected before import if the resulting document cannot be saved',()=>{
  const names=Array.from({length:8},(_,i)=>'B'+i+'x'.repeat(120));
  const geometry=[];for(let i=0;i<1400;i++)geometry.push(...line);
  const chain=[];for(let i=0;i<8;i++)chain.push(...block(names[i],i===7?geometry:insert(names[i+1])));
  assert.throws(()=>parseCadDxf(source(chain,insert(names[0]))),/1,5 MB.*cancelada integralmente/);
});

test('hidden block instances retain invisibility and their geometry is not exported',()=>{
  const {sketch}=parseCadDxf(source(block('B'),insert('B',[60,1])));
  assert.equal(sketch.entities[0].visible,false);
  assert.equal(cadBounds(sketch),null);assert.doesNotMatch(cadDxf(sketch),/\nLINE\n/);
});

test('native persistence retains source inspection; flattened DXF round-trip retains world geometry',async t=>{
  const original=parseCadDxf(await fs.readFile(fixture,'utf8')).sketch;
  const before=structuredClone(original),edited=transformCadEntity(original,original.entities[0].id,{dx:5});
  assert.deepEqual(original,before);assert.deepEqual(edited.entities[0].source,original.entities[0].source);
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'of-cad-blocks-'));t.after(()=>fs.rm(folder,{recursive:true,force:true}));
  await saveCadDocument(folder,edited,null);assert.deepEqual((await loadCadDocument(folder)).sketch,edited);
  const exported=cadDxf(edited);assert.doesNotMatch(exported,/\nINSERT\n/);
  const reimported=parseCadDxf(exported,{assumeMillimeters:true}).sketch;
  assert.equal(reimported.entities.length,edited.entities.length);assert.deepEqual(cadBounds(reimported),cadBounds(edited));
  for(const [index,item]of reimported.entities.entries())assert.deepEqual(cadEntityMetrics(item),cadEntityMetrics(edited.entities[index]));
  assert.equal(validateCadSketch(reimported),reimported);
});

test('untrusted provenance cannot add executable metadata or exceed bounded strings',async()=>{
  const original=parseCadDxf(await fs.readFile(fixture,'utf8')).sketch;
  for(const patch of [{command:'run'},{handle:'not a handle!'},{blockPath:Array(9).fill('B'),insertPath:Array(9).fill('x')},{blockPath:['A\nB']}]){
    const corrupted=structuredClone(original);Object.assign(corrupted.entities[0].source,patch);
    assert.throws(()=>validateCadSketch(corrupted),/Proveniência/);
  }
});
