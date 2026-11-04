import test from 'node:test';
import assert from 'node:assert/strict';
import { NAV_GROUPS, NAV_DOMAINS, getModuleDomain, findWorkbenchModule } from '../src/workbench/module-registry.mjs';
import { NAV_COMMANDS, buildWorkbenchCommands, searchWorkbenchCommands } from '../src/workbench/command-registry.mjs';
import { editorOptionsForSize, LARGE_EDITOR_THRESHOLD_BYTES,
  STANDARD_EDITOR_OPTIONS, LARGE_EDITOR_OPTIONS } from '../src/modules/ide/editor-performance.mjs';

test('workbench domain hierarchy has stable unique ids and valid real tool routes',()=>{
  const ids = NAV_GROUPS.map(group=>group.id);
  assert.equal(new Set(ids).size,ids.length);
  assert.deepEqual(NAV_DOMAINS.map(domain=>domain.id),['all',...ids]);
  const routes = NAV_GROUPS.flatMap(group=>group.items.map(item=>item.mode));
  assert.equal(new Set(routes).size,routes.length);
  for (const group of NAV_GROUPS) for (const item of group.items) {
    assert.equal(getModuleDomain(item.mode),group.id);
    assert.equal(findWorkbenchModule(item.mode).group,group.title);
    assert.ok(NAV_COMMANDS.some(command=>command.mode===item.mode));
  }
});
test('command palette search is case/accent-insensitive, bounded and domain-aware',()=>{
  const commands=buildWorkbenchCommands([{kind:'file',path:'src/modulo.ts'}],'/workspace');
  assert.deepEqual(searchWorkbenchCommands(commands,'codigo').map(x=>x.mode).filter(Boolean),['code']);
  assert.equal(searchWorkbenchCommands(commands,'CAD 2D')[0].mode,'cad');
  assert.equal(searchWorkbenchCommands(commands,'modulo',{scope:'files',hasWorkspace:true})[0].path,'src/modulo.ts');
  assert.ok(searchWorkbenchCommands(commands,'',{scope:'all',mode:'cad',hasWorkspace:true,limit:3}).length<=3);
  assert.equal(searchWorkbenchCommands(commands,'historico',{scope:'all',hasWorkspace:false}).some(x=>x.mode==='history'),false);
  assert.equal(searchWorkbenchCommands(commands,'inspector',{mode:'code',hasWorkspace:true}).length,0);
  assert.equal(searchWorkbenchCommands(commands,'inspector',{mode:'canvas',hasWorkspace:true})[0].action,'toggle-inspector');
});
test('quick-open only indexes existing validated files and never submits free-form paths',()=>{
  const files=[
    {kind:'file',path:'src/main.jsx'}, {kind:'file',path:'src/main.jsx'},
    {kind:'directory',path:'src'}, {kind:'file',path:'../escape.js'},
    {kind:'file',path:'src/../escape.js'}, {kind:'file',path:'C:\\unsafe.js'},
    {kind:'file',path:'.env.local'}, {kind:'file',path:'secrets.json'},
    {kind:'file',path:'keys/private.pem'}, {kind:'file',path:'.omniforge/private.json'},
    {kind:'file',path:'node_modules/foo.js'}
  ];
  const indexed=buildWorkbenchCommands(files,'/workspace').filter(command=>command.kind==='file');
  assert.deepEqual(indexed.map(command=>command.path),['src/main.jsx']);
  assert.deepEqual(buildWorkbenchCommands(files,'').filter(command=>command.kind==='file'),[]);
  assert.equal(searchWorkbenchCommands(indexed,'arbitrary-file-not-listed',{scope:'files',hasWorkspace:true}).length,0);
});
test('large-file Monaco mode uses stable references without modifying content',()=>{
  assert.equal(editorOptionsForSize(0),STANDARD_EDITOR_OPTIONS);
  assert.equal(editorOptionsForSize(LARGE_EDITOR_THRESHOLD_BYTES-1),STANDARD_EDITOR_OPTIONS);
  assert.equal(editorOptionsForSize(LARGE_EDITOR_THRESHOLD_BYTES),LARGE_EDITOR_OPTIONS);
  assert.equal(editorOptionsForSize(1_000_000),LARGE_EDITOR_OPTIONS);
  assert.equal(editorOptionsForSize(99_000),editorOptionsForSize(99_000));
  assert.equal(STANDARD_EDITOR_OPTIONS.minimap.enabled,true);
  assert.equal(LARGE_EDITOR_OPTIONS.minimap.enabled,false);
  assert.equal(LARGE_EDITOR_OPTIONS.wordWrap,'off');
  assert.throws(()=>searchWorkbenchCommands(null,'foo'),/Catálogo/);
});
