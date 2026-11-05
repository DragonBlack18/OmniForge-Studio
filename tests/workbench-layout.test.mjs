import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createLayoutStore,defaultLayout,editLayout,presetLayout,resolveLayout,normalizeLayout,layoutScope,LAYOUT_KEY,PROFILE_LIMIT,STORAGE_LIMIT} from '../src/workbench/layout/layout-model.mjs';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
function memory(initial={}){const data=new Map(Object.entries(initial));let writes=0;return{getItem:key=>data.get(key)??null,setItem:(key,value)=>{data.set(key,value);writes++;},get writes(){return writes;},data};}
test('layout is a bounded whitelist; unknown fields, paths and capabilities cannot persist',()=>{
  const p=normalizeLayout({navigationWidth:999,navigationCollapsed:'false',canvas:{contextWidth:-100,inspectorWidth:Infinity,contextOpen:false,execute:true},workspace:'/private',token:'secret',cad:{inspectorWidth:420}});
  assert.equal(p.navigationWidth,280);assert.equal(p.navigationCollapsed,false);assert.equal(p.canvas.contextWidth,180);assert.equal(p.canvas.inspectorWidth,278);assert.equal(p.canvas.contextOpen,false);
  assert.doesNotMatch(JSON.stringify(p),/private|token|secret|execute/);
  assert.deepEqual(normalizeLayout(null),defaultLayout());
  assert.throws(()=>editLayout(p,'canvas','__proto__',true),/desconhecida/);
  assert.throws(()=>editLayout(p,'git','contextWidth',10));
  assert.equal(layoutScope('C:\\Users\\private'),'global');assert.equal(layoutScope(A.toUpperCase()),A);
});
test('preferences never write on read, preserve stable snapshots and notify only on real changes',()=>{
  const storage=memory(),store=createLayoutStore(storage);let calls=0;const off=store.subscribe(()=>calls++);
  const first=store.getSnapshot(A);assert.strictEqual(first,store.getSnapshot(A));assert.equal(storage.writes,0);
  assert.equal(store.edit(A,'canvas','contextWidth',224),false);assert.equal(calls,0);
  store.edit(A,'canvas','contextWidth',280);assert.equal(calls,1);assert.equal(storage.writes,1);
  assert.notStrictEqual(first,store.getSnapshot(A));assert.equal(first.layout.canvas.contextWidth,224);
  assert.throws(()=>{store.getSnapshot(A).layout.canvas.contextWidth=12;},TypeError);
  off();store.edit(A,'code','contextWidth',250);assert.equal(calls,1);
});
test('two workspaces and editor modes remain independent after simulated process recreation',()=>{
  const storage=memory(),store=createLayoutStore(storage);
  store.edit(A,'canvas','contextWidth',300);store.edit(A,'cad','inspectorWidth',360);store.edit(B,'code','contextOpen',false);
  const next=createLayoutStore(storage);
  assert.equal(next.getSnapshot(A).layout.canvas.contextWidth,300);assert.equal(next.getSnapshot(A).layout.code.contextWidth,224);
  assert.equal(next.getSnapshot(A).layout.cad.inspectorWidth,360);assert.equal(next.getSnapshot(B).layout.canvas.contextWidth,224);
  assert.equal(next.getSnapshot(B).layout.code.contextOpen,false);assert.deepEqual(next.getSnapshot(null).layout,defaultLayout());
});
test('reset changes only the selected profile, not documents or another profile',()=>{
  const storage=memory(),store=createLayoutStore(storage);store.preset(A,'canvas','inspect');store.preset(B,'canvas','wide');
  const before=structuredClone(store.getSnapshot(B));store.reset(A);assert.deepEqual(store.getSnapshot(A).layout,defaultLayout());
  assert.deepEqual(store.getSnapshot(B).layout,before.layout);assert.deepEqual([...storage.data.keys()],[LAYOUT_KEY]);
});
test('malformed, unknown-version, duplicated and oversized preferences stay intact until explicit reset',()=>{
  for(const raw of ['{',JSON.stringify({version:2,profiles:[]}),JSON.stringify({version:1,profiles:[{scope:A,layout:{}},{scope:A,layout:{}}]}),
    JSON.stringify({version:1,profiles:[{scope:'C:/private',layout:{}}]}),'x'.repeat(STORAGE_LIMIT+1)]){
    const storage=memory({[LAYOUT_KEY]:raw}),store=createLayoutStore(storage);assert.equal(store.getSnapshot(A).status,'invalid');
    store.edit(A,'canvas','contextWidth',300);assert.equal(storage.getItem(LAYOUT_KEY),raw);assert.equal(storage.writes,0);
    assert.equal(store.getSnapshot(A).layout.canvas.contextWidth,300);store.reset(A);assert.equal(store.getSnapshot(A).status,'saved');
    assert.deepEqual(JSON.parse(storage.getItem(LAYOUT_KEY)).profiles[0].layout,defaultLayout());
  }
});
test('blocked storage is reported without blocking work or losing the in-session value',()=>{
  const storage={getItem:()=>null,setItem:()=>{throw Error('quota');}};const store=createLayoutStore(storage);
  store.edit(A,'canvas','inspectorWidth',390);assert.equal(store.getSnapshot(A).status,'unavailable');assert.equal(store.getSnapshot(A).layout.canvas.inspectorWidth,390);
  const noStorage=createLayoutStore();assert.equal(noStorage.getSnapshot(A).status,'unavailable');noStorage.edit(A,'code','contextOpen',false);
  assert.equal(noStorage.getSnapshot(A).layout.code.contextOpen,false);
});
test('legacy preferences are read once without writing or deleting previous-version keys',()=>{
  const storage=memory({'of.navCollapsed':'1','of.utilityOpen':'0','of.inspectorOpen':'0','of.cad.inspectorWidth.v1':'370'});
  const store=createLayoutStore(storage);assert.equal(storage.writes,0);assert.equal(store.getSnapshot(A).layout.navigationCollapsed,true);
  assert.equal(store.getSnapshot(A).layout.canvas.contextOpen,false);assert.equal(store.getSnapshot(A).layout.cad.inspectorWidth,370);
  store.edit(A,'code','contextOpen',true);assert.equal(storage.getItem('of.utilityOpen'),'0');assert.equal(store.getSnapshot(B).layout.code.contextOpen,false);
});
test('profile capacity evicts only oldest modified presentation preferences',()=>{
  const storage=memory(),store=createLayoutStore(storage);
  for(let i=0;i<PROFILE_LIMIT+4;i++)store.edit(`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,'canvas','contextWidth',300);
  const data=JSON.parse(storage.getItem(LAYOUT_KEY));assert.equal(data.profiles.length,PROFILE_LIMIT);assert.ok(storage.getItem(LAYOUT_KEY).length<STORAGE_LIMIT);
  assert.equal(data.profiles[0].scope,'00000000-0000-4000-8000-000000000004');
});
test('presets adjust only current tool and navigation, keeping other module dimensions',()=>{
  const p=editLayout(defaultLayout(),'cad','inspectorWidth',405),original=structuredClone(p);
  const wide=presetLayout(p,'canvas','wide');assert.equal(wide.navigationCollapsed,true);assert.equal(wide.canvas.contextOpen,false);assert.equal(wide.cad.inspectorWidth,405);
  assert.equal(presetLayout(p,'canvas','inspect').canvas.inspectorWidth,360);assert.deepEqual(p,original);assert.throws(()=>presetLayout(p,'cad','made-up'));
});
test('adaptive layout preserves center space and preferred sizes across desktop widths',()=>{
  for(const mode of ['canvas','code','cad','home'])for(const size of [960,1040,1280,1440,1920]){
    const p=defaultLayout();p.navigationWidth=280;p.canvas.contextWidth=360;p.code.contextWidth=360;p.canvas.inspectorWidth=440;p.cad.inspectorWidth=420;
    const original=structuredClone(p),r=resolveLayout(p,mode,size);assert.ok(r.centerWidth>=(mode==='cad'?524:mode==='code'?480:400),`${mode} ${size}`);
    assert.deepEqual(p,original);assert.equal(resolveLayout(p,mode,1920).navigationWidth,280);
  }
});
test('focus is presentation-only and restores exact previous preferences without writes',()=>{
  const p=presetLayout(defaultLayout(),'canvas','inspect'),before=resolveLayout(p,'canvas',1440);
  const focused=resolveLayout(p,'canvas',1440,true);assert.equal(focused.navigationWidth,0);assert.equal(focused.contextVisible,false);assert.equal(focused.inspectorVisible,false);assert.equal(focused.centerWidth,1440);
  assert.deepEqual(resolveLayout(p,'canvas',1440),before);assert.equal('focus' in p,false);
});
test('layout fixtures never introduce native APIs or third-party UI runtime',async()=>{
  for(const file of ['layout-model.mjs','useWorkbenchLayout.mjs','LayoutControls.jsx']) {
    const source=await fs.readFile('src/workbench/layout/'+file,'utf8');assert.doesNotMatch(source,/window\.omni|ipcRenderer|from ['"]node:|fetch\(/);
  }
  const source=await fs.readFile('src/shared/PanelResizer.jsx','utf8');assert.match(source,/role="separator"/);assert.match(source,/onPointerCancel/);assert.match(source,/cancelAnimationFrame/);assert.match(source,/event.key==='Escape'/);
});
