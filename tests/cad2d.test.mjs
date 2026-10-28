import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initialCadSketch,validateCadSketch,makeCadEntity,addCadEntity,deleteCadEntity,cadEntityMetrics,cadStats,cadSvg,cadDxf,snapCadPoint,replaceCadEntity,addCadLayer,removeCadLayer,cadBounds } from '../core/cad2d.mjs';
import { loadCadDocument,saveCadDocument,exportCadSketch } from '../core/cad-store.mjs';
async function workspace(t){const r=await fs.mkdtemp(path.join(os.tmpdir(),'of-cad-'));t.after(()=>fs.rm(r,{recursive:true,force:true}));return r;}
const model=()=>{
 let s=initialCadSketch();
 s=addCadEntity(s,makeCadEntity('line',{x:0,y:0},{x:30,y:40}));
 s=addCadEntity(s,makeCadEntity('rectangle',{x:0,y:0},{x:80,y:40}));
 s=addCadEntity(s,makeCadEntity('circle',{x:30,y:0},{x:50,y:0}));
 return s;
};
test('CAD de documento novo não escreve nenhum arquivo automaticamente',async t=>{
 const root=await workspace(t),doc=await loadCadDocument(root);
 assert.equal(doc.revision,null);assert.equal(doc.sketch.entities.length,0);
 await assert.rejects(fs.stat(path.join(root,'.omniforge')),{code:'ENOENT'});
});
test('CAD valida 3 entidades geométricas com coordenadas em milímetros',()=>{
 const doc=model();assert.equal(validateCadSketch(doc),doc);
 assert.equal(doc.entities.length,3);assert.equal(cadEntityMetrics(doc.entities[0]).length,50);
 assert.equal(cadEntityMetrics(doc.entities[1]).area,3200);
 assert.equal(cadStats(doc).count,3);
});
test('CAD rejeita formas degeneradas, overflow, duplicados e camada ausente',()=>{
 const doc=model();
 assert.throws(()=>makeCadEntity('line',{x:1,y:1},{x:1,y:1}),/tamanho nulo/);
 assert.throws(()=>makeCadEntity('circle',{x:0,y:0},{x:0,y:0}),/Raio/);
 assert.throws(()=>makeCadEntity('rectangle',{x:0,y:0},{x:0,y:10}),/largura/);
 assert.throws(()=>makeCadEntity('line',{x:Infinity,y:0},{x:1,y:1}),/inválida/);
 assert.throws(()=>addCadEntity(doc,{...doc.entities[0]}),/duplicada/);
 assert.throws(()=>addCadEntity(doc,{...doc.entities[0],id:'abc',layerId:'missing'}),/camada/);
});
test('camadas bloqueadas impedem alterações sem afetar entidades originais',()=>{
 const doc=model();doc.layers[0].locked=true;
 assert.throws(()=>deleteCadEntity(doc,doc.entities[0].id),/bloqueada/);
 assert.throws(()=>addCadEntity(doc,makeCadEntity('line',{x:1,y:2},{x:3,y:4})),/bloqueada/);
 assert.equal(doc.entities.length,3);
});
test('CAD snap prioriza pontos geométricos e depois grade em mm',()=>{
 const doc=model();
 assert.deepEqual(snapCadPoint({x:30.25,y:40.1},doc,4,5),{x:30,y:40,kind:'object'});
 assert.deepEqual(snapCadPoint({x:72,y:77},doc,4,5),{x:70,y:75,kind:'grid'});
});
test('exportação DXF R12 possui LINE, CIRCLE, camadas e fecha documento',()=>{
 const dxf=cadDxf(model());
 assert.match(dxf,/\nAC1009\n/);assert.equal((dxf.match(/\nLINE\n/g)||[]).length,5);
 assert.equal((dxf.match(/\nCIRCLE\n/g)||[]).length,1);
 assert.match(dxf,/\nLAYER\n/);assert.ok(dxf.endsWith('EOF\n'));
});
test('exportação SVG possui primitivas reais e evita texto livre',()=>{
 const svg=cadSvg(model());assert.match(svg,/xmlns="http:\/\/www.w3.org\/2000\/svg"/);
 assert.match(svg,/<line /);assert.match(svg,/<rect /);assert.match(svg,/<circle /);
 const doc=model();doc.name='<script>alert(1)</script>';assert.doesNotMatch(cadSvg(doc),/<script>/);
});
test('CAD save/reload faz versionamento e mantém sketch fora do executável',async t=>{
 const root=await workspace(t),s=model();
 const saved=await saveCadDocument(root,s,null);
 assert.match(saved.revision,/^[a-f0-9]{64}$/);
 const loaded=await loadCadDocument(root);assert.deepEqual(loaded.sketch,s);
 const updated=deleteCadEntity(s,s.entities[0].id);
 const second=await saveCadDocument(root,updated,saved.revision);
 assert.notEqual(second.revision,saved.revision);
 assert.deepEqual((await loadCadDocument(root)).sketch.entities.length,2);
 assert.equal((await fs.readFile(path.join(root,'.omniforge','cad-history',`${saved.revision}.json`),'utf8')).includes('circle'),true);
});
test('CAD não sobrescreve mudança feita fora do editor',async t=>{
 const root=await workspace(t);const s=model();const saved=await saveCadDocument(root,s,null);
 await fs.writeFile(path.join(root,'.omniforge','cad','sketch.json'),JSON.stringify(initialCadSketch()));
 await assert.rejects(saveCadDocument(root,s,saved.revision),/alterado fora/);
 assert.equal((await loadCadDocument(root)).sketch.entities.length,0);
});
test('CAD exporta dois formatos no diretório interno sem modificar projetos externos',async t=>{
 const root=await workspace(t);const doc=model();
 const a=await exportCadSketch(root,'dxf',doc),b=await exportCadSketch(root,'svg',doc);
 assert.ok(a.bytes>200);assert.ok(b.bytes>200);
 assert.match(await fs.readFile(a.path,'utf8'),/SECTION/);assert.match(await fs.readFile(b.path,'utf8'),/<svg/);
 await assert.rejects(exportCadSketch(root,'dwg',doc),/não suportado/);
});
test('CAD bloqueia symlink na pasta de desenho e na saída',async t=>{
 const root=await workspace(t),out=await workspace(t);
 await fs.mkdir(path.join(root,'.omniforge'));
 try{await fs.symlink(out,path.join(root,'.omniforge','cad'),'dir');}
 catch(err){if(err.code==='EPERM')return t.skip('symlink indisponível');throw err;}
 await assert.rejects(loadCadDocument(root),/inseguro/);
 await assert.rejects(saveCadDocument(root,model(),null),/inseguro/);
});
test('limita quantidade de entidades para evitar travamento e payloads hostis',()=>{
 const doc=initialCadSketch();doc.entities=Array.from({length:2001},(_,i)=>makeCadEntity('line',{x:0,y:i},{x:1,y:i}));
 assert.throws(()=>validateCadSketch(doc),/limites/);
});

test('edição numérica altera a geometria real, medidas e DXF sem duplicar entidades',()=>{
 const original=model(),old=original.entities[0];
 const edited=replaceCadEntity(original,{...old,b:{x:120,y:0}});
 assert.equal(edited.entities.length,3);
 assert.equal(edited.entities[0].b.x,120);
 assert.equal(cadEntityMetrics(edited.entities[0]).length,120);
 assert.equal(original.entities[0].b.x,30);
 assert.match(cadDxf(edited),/11\n120\n21\n0/);
});
test('edição numérica recusa geometria inválida ou camada bloqueada',()=>{
 const s=model(),e=s.entities[0];
 assert.throws(()=>replaceCadEntity(s,{...e,b:{x:e.a.x,y:e.a.y}}),/tamanho nulo/);
 assert.throws(()=>replaceCadEntity(s,{...e,b:{x:Infinity,y:3}}),/inválida/);
 assert.throws(()=>replaceCadEntity(s,{...e,type:'circle'}),/não altera tipo/);
 s.layers[0].locked=true;
 assert.throws(()=>replaceCadEntity(s,{...e,b:{x:99,y:40}}),/bloqueada/);
});
test('camadas adicionais persistem e exclusão é permitida somente sem entidades',()=>{
 const doc=initialCadSketch();
 const withLayer=addCadLayer(doc,{id:'cotas',name:'Cotas',color:'#AACCEE'});
 assert.equal(withLayer.layers.length,3);
 const withLine=addCadEntity(withLayer,makeCadEntity('line',{x:0,y:0},{x:5,y:7},'cotas','cota1'));
 assert.throws(()=>removeCadLayer(withLine,'cotas'),/possui entidades/);
 const removed=removeCadLayer(withLayer,'cotas');
 assert.equal(removed.layers.length,2);
 assert.equal(doc.layers.length,2);
 assert.throws(()=>addCadLayer(withLayer,{id:'cotas',name:'Repetida'}),/duplicada/);
});
test('ajuste de vista calcula limites de círculos e respeita visibilidade',()=>{
 let s=initialCadSketch();
 assert.equal(cadBounds(s),null);
 s=addCadEntity(s,makeCadEntity('circle',{x:10,y:20},{x:30,y:20}));
 assert.deepEqual(cadBounds(s),{minX:-10,maxX:30,minY:0,maxY:40});
 s.layers[0].visible=false;
 assert.equal(cadBounds(s),null);
 assert.deepEqual(cadBounds(s,{visibleOnly:false}),{minX:-10,maxX:30,minY:0,maxY:40});
});
