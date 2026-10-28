import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cadDxf, initialCadSketch, validateCadSketch } from '../core/cad2d.mjs';
import { parseCadDxf } from '../core/cad-import.mjs';
import { readCadDxfFile } from '../core/cad-import-file.mjs';

const groups=(...items)=>items.join('\n')+'\n';
const header=(code=4)=>groups(0,'SECTION',2,'HEADER',9,'$ACADVER',1,'AC1015',9,'$INSUNITS',70,code,0,'ENDSEC');
const entities=(...items)=>groups(0,'SECTION',2,'ENTITIES',...items,0,'ENDSEC',0,'EOF');
const line=(a=0,b=25)=>[0,'LINE',8,'0',10,a,20,0,30,0,11,b,21,0,31,0];
const circle=[0,'CIRCLE',8,'cotas',10,10,20,20,30,0,40,5];
const polyline=[0,'LWPOLYLINE',8,'Peças Mecânicas',90,3,70,1,10,0,20,0,10,50,20,0,10,50,20,25];
const invalidArc=[0,'ARC',8,'0',10,0,20,0,40,10,50,0,51,90];
function checkReject(source, pattern, options={}) {
  assert.throws(()=>parseCadDxf(source,options),pattern);
}
async function temp(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'omni-dxf-import-'));
  t.after(async()=>fs.rm(root,{recursive:true,force:true}));
  return root;
}

test('DXF exportado pelo OmniForge só abre com consentimento mm e importa linha/círculo',()=>{
  const sketch=initialCadSketch();
  sketch.entities=[
    {id:'line1',type:'line',layerId:'principal',a:{x:0,y:0},b:{x:30,y:40}},
    {id:'circle1',type:'circle',layerId:'construcao',center:{x:20,y:20},radius:5}
  ];
  const source=cadDxf(sketch);
  checkReject(source,/unidade explícita/);
  const result=parseCadDxf(source,{assumeMillimeters:true});
  assert.equal(result.meta.assumedMillimeters,true);
  assert.equal(result.meta.scaleToMm,1);
  assert.equal(result.sketch.entities.length,2);
  assert.equal(result.sketch.layers.length,2);
  assert.deepEqual(result.sketch.entities[0].b,{x:30,y:40});
  assert.equal(result.sketch.entities[1].radius,5);
  validateCadSketch(result.sketch);
  assert.match(cadDxf(result.sketch),/\nLINE\n/);
  assert.match(cadDxf(result.sketch),/\nCIRCLE\n/);
});

test('INSUNITS converte polegadas, centímetros e metros para milímetros',()=>{
  for(const [unit,factor] of [[1,25.4],[5,10],[6,1000]]) {
    const result=parseCadDxf(header(unit)+entities(...line(0,1)));
    assert.equal(result.sketch.entities[0].b.x,factor);
    assert.equal(result.meta.scaleToMm,factor);
    assert.equal(result.meta.assumedMillimeters,false);
  }
});

test('LWPOLYLINE fechada com vértices XY gera segmentos reais e preserva camada',()=>{
  const data=header()+entities(...polyline);
  const result=parseCadDxf(data);
  assert.equal(result.meta.sourceCount,1);
  assert.equal(result.meta.entityCount,3);
  assert.equal(result.sketch.entities.length,3);
  assert.equal(result.sketch.layers[0].name,'Peças Mecânicas');
  assert.deepEqual(result.sketch.entities.at(-1).b,{x:0,y:0});
  assert.equal(result.sketch.entities[0].type,'line');
});

test('layer table preserva cor, visibilidade e bloqueio sem mutar outras camadas',()=>{
  const layers=groups(0,'SECTION',2,'TABLES',0,'TABLE',2,'LAYER',70,1,
    0,'LAYER',2,'cotas',70,4,62,-3,6,'CONTINUOUS',0,'ENDTAB',0,'ENDSEC');
  const data=header()+layers+entities(...circle);
  const result=parseCadDxf(data);
  const layer=result.sketch.layers.find(l=>l.id==='cotas');
  assert.ok(layer);
  assert.equal(layer.color,'#69BC8B');
  assert.equal(layer.visible,false);
  assert.equal(layer.locked,true);
  assert.equal(result.sketch.entities[0].layerId,'cotas');
});

test('entidades não suportadas rejeitam DXF inteiro e nunca importam parcialmente',()=>{
  checkReject(header()+entities(...line(),...invalidArc),/ARC.*cancelada integralmente/);
  checkReject(header()+entities(0,'INSERT',2,'BLOCK1',10,0,20,0),/INSERT/);
  checkReject(header()+entities(0,'DIMENSION',8,'0'),/DIMENSION/);
});

test('DXF recusa geometrias 3D, extrusão e cotas curvas ou espessas',()=>{
  checkReject(header()+entities(0,'LINE',10,0,20,0,30,9,11,1,21,1),/plano XY/);
  checkReject(header()+entities(0,'CIRCLE',10,0,20,0,40,2,210,0,220,1,230,0),/plano XY/);
  checkReject(header()+entities(0,'LWPOLYLINE',90,2,70,0,10,0,20,0,42,1,10,5,20,0),/bulge/);
  checkReject(header()+entities(0,'LWPOLYLINE',90,2,70,0,43,0.2,10,0,20,0,10,5,20,0),/largura/);
});

test('vértices incompletos e declarações de tamanho incorretas não são aceitos',()=>{
  checkReject(header()+entities(0,'LWPOLYLINE',90,3,70,0,10,0,20,0,10,5,20,0),/vértices incompletos/);
  checkReject(header()+entities(0,'LWPOLYLINE',90,2,70,0,20,0,10,5,20,0),/Ordem dos vértices/);
  checkReject(header()+entities(0,'LINE',10,0,20,0,11,0,21,0),/tamanho nulo/);
});

test('unidades desconhecidas e grandes coordenadas são recusadas sem aproximação',()=>{
  checkReject(header(0)+entities(...line()),/unidade explícita/);
  checkReject(header(12)+entities(...line()),/Unidades DXF não suportadas/);
  checkReject(header(4)+entities(...line(0,1000001)),/1.000.000 mm/);
});

test('DXF truncado, vazio, binário ou sem seção ENTITIES é recusado',()=>{
  checkReject('          ',/DXF deve ser texto/);
  checkReject('AutoCAD Binary DXF\0\0',/DXF deve ser texto/);
  checkReject(groups(0,'SECTION',2,'HEADER',0,'ENDSEC',0,'EOF'),/ENTITIES/);
  checkReject(groups(0,'SECTION',2,'ENTITIES',0,'LINE',10,1,20,2,11,3,21,4),/EOF/);
  checkReject('0\nSECTION\n2',/truncado/);
  checkReject(header()+entities(...line())+groups(0,'LINE'),/após EOF/);
});

test('limite de 2000 entidades é aplicado também após expandir LWPOLYLINE',()=>{
  const vertices=[0,'LWPOLYLINE',90,2000,70,1];
  for(let i=0;i<2000;i++)vertices.push(10,i,20,0);
  checkReject(header()+entities(...vertices,...line()),/2000 entidades após conversão/);
});

test('leitor real de arquivo DXF não grava nada no workspace nem altera a fonte',async t=>{
  const folder=await temp(t);
  const source=header()+entities(...line(1,10));
  const file=path.join(folder,'placa.dxf');
  await fs.writeFile(file,source,'utf8');
  const before=await fs.readFile(file);
  const parsed=await readCadDxfFile(file);
  const after=await fs.readFile(file);
  assert.equal(parsed.sourceName,'placa.dxf');
  assert.equal(parsed.sketch.entities[0].b.x,10);
  assert.deepEqual(after,before);
  assert.deepEqual(await fs.readdir(folder),['placa.dxf']);
});

test('leitor rejeita extensão estranha, arquivo grande, binário e symlink',async t=>{
  const folder=await temp(t);
  const bad=path.join(folder,'dados.txt');
  await fs.writeFile(bad,header()+entities(...line()),'utf8');
  await assert.rejects(readCadDxfFile(bad),/arquivo \.dxf/);
  const big=path.join(folder,'large.dxf');
  await fs.writeFile(big,' '.repeat(2_000_001),'utf8');
  await assert.rejects(readCadDxfFile(big),/2 MB/);
  const binary=path.join(folder,'invalid.dxf');
  await fs.writeFile(binary,Buffer.from([0xff,0xfe,0x00,0xff]));
  await assert.rejects(readCadDxfFile(binary),/ASCII ou UTF-8/);
  const alias=path.join(folder,'alias.dxf');
  try {
    await fs.symlink(big,alias,'file');
    await assert.rejects(readCadDxfFile(alias),/link simbólico/);
  } catch(e) {
    if(e.code!=='EPERM'&&e.code!=='EACCES')throw e;
  }
});
