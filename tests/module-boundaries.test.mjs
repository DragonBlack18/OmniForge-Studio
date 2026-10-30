/** Prevent accidental cross-domain UI imports and re-growth of the flat core. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('.');
const sourcePath = (...p) => path.join(root, ...p);
const allowed = {
  automation:new Set(['automation','cad','workspace','integrations','extensions']),
  cad:new Set(['cad','workspace']),
  ide:new Set(['ide','workspace']),
  integrations:new Set(['integrations']),
  extensions:new Set(['extensions','workspace']),
  scheduling:new Set(['scheduling','workspace','extensions','automation']),
  workspace:new Set(['workspace','automation','integrations'])
};
async function walk(dir) {
  const entries=await fs.readdir(dir,{withFileTypes:true});
  const items=[];
  for(const entry of entries){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())items.push(...await walk(full));
    else if(/\.(?:jsx?|mjs|cjs)$/.test(entry.name))items.push(full);
  }
  return items;
}
function specifiers(text) {
  const found=[];
  const regex=/(?:from\s*|import\s*|import\s*\(\s*)(['"])([^'"]+)\1/g;
  let hit;
  while((hit=regex.exec(text)))found.push(hit[2]);
  return found;
}
test('backend domain implementation is canonical and old imports are compatibility facades',async()=>{
  const dirs=await fs.readdir(sourcePath('core','modules'),{withFileTypes:true});
  assert.deepEqual(dirs.filter(d=>d.isDirectory()).map(d=>d.name).sort(),
    Object.keys(allowed).sort());
  for(const [domain,deps] of Object.entries(allowed)){
    const files=await walk(sourcePath('core','modules',domain));
    assert.ok(files.length>0,'missing '+domain);
    for(const file of files){
      const text=await fs.readFile(file,'utf8');
      for(const spec of specifiers(text)){
        if(!spec.startsWith('.'))continue;
        const resolved=path.resolve(path.dirname(file),spec);
        await fs.stat(resolved);
        assert.ok(resolved.startsWith(sourcePath('core')+path.sep),
          'escape from core: '+file+' -> '+spec);
        const route=path.relative(sourcePath('core','modules'),resolved).split(path.sep);
        if(route.length>1 && allowed[route[0]]){
          assert.ok(deps.has(route[0]),
            'not permitted domain dependency '+domain+' -> '+route[0]);
        }
      }
    }
  }
  const originalDir=await fs.readdir(sourcePath('core'));
  for(const name of originalDir.filter(name=>name.endsWith('.mjs')&&
    !['index.mjs','host.mjs','supervisor.mjs'].includes(name))){
    const text=await fs.readFile(sourcePath('core',name),'utf8');
    assert.match(text,/^\/\*\*.*\*\/\s*export \* from '\.\/modules\/[^']+';\s*$/s,
      'Flat core implementation must be a compatibility facade: '+name);
  }
});
test('renderer modules never import each other or privileged Electron APIs',async()=>{
  const groups=await fs.readdir(sourcePath('src','modules'),{withFileTypes:true});
  const dirs=groups.filter(x=>x.isDirectory()).map(x=>x.name);
  assert.ok(dirs.includes('automation')&&dirs.includes('cad')&&dirs.includes('ide'));
  for(const dir of dirs){
    for(const file of await walk(sourcePath('src','modules',dir))){
      const text=await fs.readFile(file,'utf8');
      assert.doesNotMatch(text,/\b(?:require\s*\(|from\s+['"]node:|ipcRenderer|child_process)/,
        'Privileged API in renderer: '+file);
      for(const spec of specifiers(text)){
        if(!spec.startsWith('.'))continue;
        const resolved=path.resolve(path.dirname(file),spec);
        await fs.stat(resolved);
        const relative=path.relative(sourcePath('src','modules'),resolved).split(path.sep);
        if(relative.length>1&&dirs.includes(relative[0])) {
          assert.equal(relative[0],dir,'Unexpected cross-module renderer import: '+file+' -> '+spec);
        }
      }
    }
  }
});
test('workbench entry remains minimal and domain modules are routed centrally',async()=>{
  const entry=await fs.readFile(sourcePath('src','App.jsx'),'utf8');
  assert.ok(entry.length<500,'src/App.jsx should only be a compatibility entry');
  const shell=await fs.readFile(sourcePath('src','workbench','AppShell.jsx'),'utf8');
  assert.ok(shell.length<65_000,'Workbench shell is growing into a new monolith');
  assert.doesNotMatch(shell,/from ['"]monaco-editor['"]|from ['"]@monaco-editor\/react['"]/);
  assert.doesNotMatch(shell,/<ReactFlow\b/);
  const electron=await fs.readFile(sourcePath('electron','main.cjs'),'utf8');
  assert.match(electron,/import\('\.\.\/core\/host\.mjs'\)/);
  assert.doesNotMatch(electron,/import\('\.\.\/core\/index\.mjs'\)/);
});
