import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createNode,NODE_CATALOG} from '../core/catalog.mjs';
import {validateFlow} from '../core/graph.mjs';
import {runFlow} from '../core/runner.mjs';
import {DATA_SUITE_CATALOG} from '../core/modules/automation/data-suite-catalog.mjs';
import {DATA_SUITE_EXECUTORS,executeDataSuite,assertSuiteJSON} from '../core/modules/automation/data-suite.mjs';
import {validateDataSuiteNode} from '../core/modules/automation/data-suite-contract.mjs';
const config=(type,extra={})=>({...createNode(type,'n',{x:0,y:0}).config,...extra});
const run=(type,input,extra={})=>executeDataSuite(type,input,config(type,extra));
export const suiteCases={
  'codec.csvRead':['id,nome\r\n1,"Parafuso, M8"\r\n2,"Linha\nsegunda"',[{id:'1',nome:'Parafuso, M8'},{id:'2',nome:'Linha\nsegunda'}]],
  'codec.csvWrite':[[{id:1,nome:'Parafuso, M8'},{id:2,nome:'Arruela'}],'id,nome\r\n1,"Parafuso, M8"\r\n2,Arruela'],
  'codec.ndjsonRead':['{"a":1}\n\n{"a":2}\n',[{a:1},{a:2}]],
  'codec.ndjsonWrite':[[{a:1},{a:2}],'{"a":1}\n{"a":2}\n'],
  'records.distinctBy':[[{id:1,v:'first'},{id:1,v:'second'},{id:'1',v:'text'}],[{id:1,v:'first'},{id:'1',v:'text'}]],
  'records.countBy':[[{categoria:'A'},{categoria:'B'},{categoria:'A'}],[{key:'A',count:2},{key:'B',count:1}]],
  'records.aggregateBy':[[{categoria:'A',valor:10},{categoria:'A',valor:30},{categoria:'B',valor:5}],
    [{key:'A',count:2,sum:40,min:10,max:30,average:20},{key:'B',count:1,sum:5,min:5,max:5,average:5}]],
  'records.joinBy':[{left:[{id:1,a:'x'},{id:2,a:'y'}],right:[{id:1,b:'z'}]},[{left:{id:1,a:'x'},right:{id:1,b:'z'}},{left:{id:2,a:'y'},right:null}]],
  'records.columnsToRows':[{id:[1,2],valor:[10,20]},[{id:1,valor:10},{id:2,valor:20}]],
  'records.rowsToColumns':[[{id:1,valor:10},{id:2,valor:20}],{id:[1,2],valor:[10,20]}],
  'object.flattenPaths':[{a:{b:1,c:[]},d:{}},{'a.b':1,'a.c':[],d:{}}],
  'object.expandPaths':[{ 'a.b':1,'a.c':[],d:{}},{a:{b:1,c:[]},d:{}}],
  'object.entries':[{a:1,b:'x'},[['a',1],['b','x']]],
  'object.fromEntries':[[['a',1],['b','x']],{a:1,b:'x'}],
  'records.partition':[[{ativo:true,id:1},{ativo:false,id:2}],{matching:[{ativo:true,id:1}],other:[{ativo:false,id:2}]}],
  'math.statistics':[[1,2,3],{count:3,sum:6,mean:2,median:2,min:1,max:3,variance:2/3,standardDeviation:Math.sqrt(2/3)}],
  'math.mapRange':[25,.25],
  'engineering.convertUnit':[1000,1,{from:'mm',to:'m'}],
  'text.normalizeSpace':[' \t Peça\n  A  ','Peça A'],
  'text.slug':['  Peça da Máquina nº 2  ','peca-da-maquina-n-2'],
  'encoding.urlEncode':['peça A/?','pe%C3%A7a%20A%2F%3F'],
  'encoding.urlDecode':['pe%C3%A7a%20A%2F%3F','peça A/?'],
  'date.epochConvert':[0,'1970-01-01T00:00:00.000Z'],
  'date.difference':[{start:'2026-01-01T00:00:00Z',end:'2026-01-02T00:00:00Z'},24,{unit:'hours'}],
  'records.coerceFields':[[{valor:'12.50',ativo:'true'}],[{valor:12.5,ativo:true}],{schema:'{"valor":"number","ativo":"boolean"}'}],
  'encoding.stableJson':[{z:3,a:{c:2,b:1}},'{"a":{"b":1,"c":2},"z":3}']
};
for(const [type,[input,expected,extra]] of Object.entries(suiteCases)){
  test('data suite real result: '+type,async()=>{
    const original=structuredClone(input);assert.deepEqual(await run(type,input,extra),expected);
    assert.deepEqual(input,original,'A transformação não pode mutar a entrada.');
    validateDataSuiteNode({type,config:config(type,extra)});
  });
  test('data suite rejects malformed configuration: '+type,async()=>{
    await assert.rejects(executeDataSuite(type,input,null),/Configuração/);
    await assert.rejects(executeDataSuite(type,input,[]),/Configuração/);
    await assert.rejects(executeDataSuite(type,input,{invalid:'x'.repeat(33000)}),/Configuração/);
  });
}
for(const [type,[input,expected,extra]] of Object.entries(suiteCases)){
  test('worker pipeline and real JSON artifact: '+type,async t=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'of-suite-node-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const start=createNode('trigger.manual','start',{x:0,y:0});start.config.payload=JSON.stringify(input);
    const transform=createNode(type,'transform',{x:250,y:0});Object.assign(transform.config,extra||{});
    const write=createNode('io.writeJson','write',{x:500,y:0});write.config.fileName='resultado.json';
    const flow={schemaVersion:1,name:type,nodes:[start,transform,write],edges:[
      {id:'e1',source:'start',target:'transform',sourceHandle:'out',targetHandle:'in'},
      {id:'e2',source:'transform',target:'write',sourceHandle:'out',targetHandle:'in'}]};
    const result=await runFlow(flow,{workspace:root,dryRun:false});assert.equal(result.ok,true,result.error);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(root,'.omniforge/output/resultado.json'),'utf8')),expected);
  });
}
test('all 26 new manifests map to real executors, and vendor is not imported by browser manifests',async()=>{
  assert.equal(Object.keys(DATA_SUITE_CATALOG).length,26);
  assert.deepEqual(Object.keys(DATA_SUITE_CATALOG).sort(),Object.keys(DATA_SUITE_EXECUTORS).sort());
  for(const type of Object.keys(DATA_SUITE_CATALOG))assert.ok(Object.hasOwn(NODE_CATALOG,type)&&suiteCases[type]);
  const [catalog,contract]=await Promise.all(['catalog','contract'].map(s=>fs.readFile('core/modules/automation/data-suite-'+s+'.mjs','utf8')));
  assert.doesNotMatch(catalog+contract,/from\s*['"].*(?:node:|papaparse|data-suite\.mjs)/);
});
for(const [name,input] of [ ['cycle',(()=>{const x={};x.self=x;return x;})()],['undefined',undefined],['NaN',NaN],['Infinity',Infinity],['Date',new Date()],['reserved',JSON.parse('{"__proto__":{"polluted":true}}')],['constructor',{constructor:1}],['function',()=>1],['oversized','x'.repeat(2000001)] ]){
  test('bounded JSON refuses '+name,()=>assert.throws(()=>assertSuiteJSON(input)));
}
test('CSV quoting, BOM, unicode and semicolon are parsed by the actual pinned PapaParse',async()=>{
  assert.deepEqual(await run('codec.csvRead','\ufeffid;nome\r\n1;"máquina ""A"""',{delimiter:';'}),[{id:'1',nome:'máquina "A"'}]);
  for(const delimiter of [',',';','tab','|']){
    const input=[{id:'1',name:'a\nb "c"'}];const csv=await run('codec.csvWrite',input,{delimiter});
    assert.deepEqual(await run('codec.csvRead',csv,{delimiter}),input);
  }
});
for(const [name,value] of [ ['duplicates','a,a\n1,2'],['reserved','__proto__,id\na,1'],['mismatch','a,b\n1'],['quotes','a\n"broken'],['columns',Array.from({length:65},(_,i)=>'c'+i).join(',')],['rows','id\n'+Array(10001).fill('1').join('\n')] ]){
  test('CSV fails closed on '+name,async()=>assert.rejects(run('codec.csvRead',value)));
}
test('CSV output protects formula strings, requires deliberate opt-out, refuses object cells',async()=>{
  const v=[{name:'=1+1'}];const safe=await run('codec.csvWrite',v),unsafe=await run('codec.csvWrite',v,{formulaProtection:'no'});
  assert.match(safe,/'=1\+1/);assert.doesNotMatch(unsafe,/'=1/);
  await assert.rejects(run('codec.csvWrite',[{v:{a:1}}]),/simples/);
  await assert.rejects(run('codec.csvWrite',[{a:1},{b:2}]),/mesmas colunas/);
});
test('invalid NDJSON fails the entire transformation and reports its nonempty record',async()=>{
  await assert.rejects(run('codec.ndjsonRead','{"a":1}\nnot json'),/linha não vazia 2/);
  await assert.rejects(run('codec.ndjsonRead','{"__proto__":1}'),/reservada/);
  assert.equal(await run('codec.ndjsonWrite',[]),'');assert.deepEqual(await run('codec.ndjsonRead',''),[]);
});
test('join is type-sensitive, rejects duplicate right keys and supports inner mode',async()=>{
  const value={left:[{id:1},{id:'1'},{id:3}],right:[{id:1,v:'a'},{id:'1',v:'b'}]};
  const out=await run('records.joinBy',value,{mode:'inner'});assert.equal(out.length,2);assert.equal(out[1].right.v,'b');
  await assert.rejects(run('records.joinBy',{left:[],right:[{id:1},{id:1}]}),/duplicada/);
  await assert.rejects(run('records.distinctBy',[{id:{a:1}}]),/simples/);
  await assert.rejects(run('records.aggregateBy',[{categoria:'A',valor:'10'}]),/finito/);
});
test('table conversion preserves originals and rejects unequal column shapes',async()=>{
  await assert.rejects(run('records.columnsToRows',{a:[1],b:[]}),/tamanhos/);
  await assert.rejects(run('records.rowsToColumns',[{a:1},{a:2,b:3}]),/mesmas/);
  assert.deepEqual(await run('records.rowsToColumns',[]),{});
  assert.deepEqual(await run('records.columnsToRows',{}),[]);
});
test('expanding paths rejects every conflicting prefix before mutating object-valued leaves',async()=>{
  for(const value of [{a:{x:1},'a.b':2},{a:{x:1},'a!':2,'a.b':3},{'a.b':2,a:{x:1}}]){
    const before=structuredClone(value);await assert.rejects(run('object.expandPaths',value),/conflitantes/);assert.deepEqual(value,before);
  }
  await assert.rejects(run('object.flattenPaths',{'a.b':1}),/ambígua/);
  await assert.rejects(run('object.fromEntries',[['a',1],['a',2]]),/duplicada/);
  await assert.rejects(run('object.fromEntries',[['__proto__',{}]]),/reservada/);
  assert.equal({}.polluted,undefined);
});
test('statistical, unit and range operations refuse coercion, incompatible units and nonfinite output',async()=>{
  await assert.rejects(run('math.statistics',[]),/vazia/);
  await assert.rejects(run('math.statistics',[1,'2']),/finito/);
  await assert.rejects(run('math.statistics',[1e308,1e308]),/finito/);
  assert.equal((await run('math.statistics',[1,2,3,4])).median,2.5);
  assert.equal(await run('math.mapRange',25,{inputMin:'100',inputMax:'0'}),.75);
  await assert.rejects(run('math.mapRange',2,{inputMin:'0',inputMax:'0'}),/degenerado/);
  assert.ok(Math.abs(await run('engineering.convertUnit',32,{from:'F',to:'C'}))<1e-10);
  assert.ok(Math.abs(await run('engineering.convertUnit',1,{from:'in',to:'mm'})-25.4)<1e-10);
  await assert.rejects(run('engineering.convertUnit',1,{from:'m',to:'kg'}),/incompatíveis/);
  await assert.rejects(run('engineering.convertUnit',-1,{from:'K',to:'C'}),/zero absoluto/);
});
test('date operations require valid unambiguous UTC calendar input and integral milliseconds',async()=>{
  assert.equal(await run('date.epochConvert','1970-01-01T00:00:00Z',{direction:'toEpoch'}),0);
  assert.equal(await run('date.difference',{start:'2024-02-28T00:00:00Z',end:'2024-03-01T00:00:00Z'},{unit:'days'}),2);
  for(const bad of ['2026-02-30T00:00:00Z','2026-01-01','2026-01-01T00:00:00-03:00','2026-13-01T00:00:00Z'])await assert.rejects(run('date.epochConvert',bad,{direction:'toEpoch'}));
  await assert.rejects(run('date.epochConvert',.5),/Timestamp/);
});
test('explicit field conversion never treats empty/false/trailing garbage as a number',async()=>{
  for(const valor of ['','10x',' 10 ','0x10',null,false])await assert.rejects(run('records.coerceFields',[{valor}]));
  await assert.rejects(run('records.coerceFields',[{valor:'10'}],{schema:'{"__proto__":"number"}'}),/reservada/);
  await assert.rejects(run('records.coerceFields',[{ativo:'yes'}],{schema:'{"ativo":"boolean"}'}),/true ou false/);
  await assert.rejects(run('encoding.urlDecode','%XX'),/inválido/);
  assert.equal(await run('encoding.stableJson',{b:[{z:1,a:2}],a:0}),'{"a":0,"b":[{"a":2,"z":1}]}');
});
test('real pipeline reads CSV, coerces, aggregates and writes actual output; malformed input writes nothing',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'of-suite-flow-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const types=['trigger.manual','codec.csvRead','records.coerceFields','records.aggregateBy','io.writeJson'];
  const nodes=types.map((type,i)=>createNode(type,'n'+i,{x:i*250,y:0}));nodes[0].config.payload=JSON.stringify('categoria,valor\nA,120\nB,80\nA,20.5');
  nodes[4].config.fileName='aggregate-suite.json';
  const flow={schemaVersion:1,name:'csv-suite',nodes,edges:nodes.slice(1).map((n,i)=>({id:'e'+i,source:nodes[i].id,target:n.id,sourceHandle:'out',targetHandle:'in'}))};
  assert.equal(validateFlow(flow).valid,true);
  const dry=await runFlow(flow,{workspace:root,dryRun:true});assert.equal(dry.ok,true,dry.error);assert.deepEqual(await fs.readdir(root),[]);
  const actual=await runFlow(flow,{workspace:root,dryRun:false});assert.equal(actual.ok,true,actual.error);
  const out=JSON.parse(await fs.readFile(path.join(root,'.omniforge/output/aggregate-suite.json'),'utf8'));
  assert.equal(out[0].sum,140.5);assert.equal(out[0].count,2);assert.equal(out[1].sum,80);
  const bad=structuredClone(flow);bad.nodes[0].config.payload=JSON.stringify('categoria,valor\nA,nope');bad.nodes[4].config.fileName='must-not-exist.json';
  const result=await runFlow(bad,{workspace:root,dryRun:false});assert.equal(result.ok,false);
  await assert.rejects(fs.stat(path.join(root,'.omniforge/output/must-not-exist.json')),{code:'ENOENT'});
});
test('actual vendored PapaParse bytes and license remain pinned and distributed',async()=>{
  const bytes=await fs.readFile('core/vendor/papaparse.cjs');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),'3553fb8bdf5b8004ce5531e6827e81c8b34e7b3992677967754544064e97b016');
  assert.match(await fs.readFile('third-party-notices/PapaParse-LICENSE.txt','utf8'),/MIT License/);
  const pkg=JSON.parse(await fs.readFile('package.json','utf8'));assert.ok(pkg.build.files.includes('core/**/*'));assert.ok(pkg.build.files.includes('third-party-notices/**/*'));
});
