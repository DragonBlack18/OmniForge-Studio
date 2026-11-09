import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import vm from 'node:vm';
import {authoringPath,createAuthoredFile,createAuthoredFolder,authoredFileInfo,duplicateAuthoredFile,relocateAuthoredFile,createProjectScaffold} from '../core/modules/ide/project-authoring.mjs';
import {FILE_TEMPLATES,PROJECT_TEMPLATES,fileTemplate,projectTemplate} from '../core/modules/ide/project-templates.mjs';
const exec=promisify(execFile),hash=content=>createHash('sha256').update(content).digest('hex');
async function fixture(t){const base=await fs.mkdtemp(path.join(os.tmpdir(),'of-authoring-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));return base;}
test('create writes the exact UTF-8 content and correct revision, never overwriting existing paths',async t=>{
  const root=await fixture(t),text='\ufeff// Peça ⚙\r\nconst valor = 12.5;\r\n';
  const r=await createAuthoredFile(root,'src/peca.js',text,true);
  assert.equal(r.revision,hash(text));assert.equal(r.bytes,Buffer.byteLength(text));assert.deepEqual(r.createdDirectories,['src']);
  assert.equal(await fs.readFile(path.join(root,r.path),'utf8'),text);
  await assert.rejects(createAuthoredFile(root,'src/peca.js','must not replace'),/existe/);
  await assert.rejects(createAuthoredFile(root,'src/PECA.js','case collision'),/existe/);
  assert.equal(await fs.readFile(path.join(root,r.path),'utf8'),text);
});
test('folder creation supports nested hierarchy and existing ancestors, never implicitly creates source files',async t=>{
  const root=await fixture(t);
  const result=await createAuthoredFolder(root,'dados/entrada/lotes');assert.deepEqual(result.createdDirectories,['dados','dados/entrada','dados/entrada/lotes']);
  await createAuthoredFile(root,'dados/entrada/lotes/itens.csv','id,valor\n1,2');
  await assert.rejects(createAuthoredFolder(root,'dados/entrada/lotes'),/existe/);
  await assert.rejects(createAuthoredFile(root,'ausente/a.txt','x'),{code:'ENOENT'});
  assert.equal((await fs.readdir(root)).includes('ausente'),false);
});
for(const invalid of ['../outside.js','/tmp/a','C:/out.js','a\\b','a//b','a/./b','x/../y','con.txt','aux','LPT1.txt','com9','end.','end ','.git/config','.omniforge/output/a','node_modules/a.js','.env','.env.local','private.key','x:ads','secrets.json','a'.repeat(101),Array(10).fill('a').join('/')]){
  test('authoring path rejects '+JSON.stringify(invalid),()=>assert.throws(()=>authoringPath(invalid)));
}
test('invalid text and invalid options fail before creating any directory',async t=>{
  const root=await fixture(t);
  for(const content of [null,{},'a\0b','x'.repeat(1000001),'\ud800'])await assert.rejects(createAuthoredFile(root,'deep/a.txt',content,true));
  await assert.rejects(createAuthoredFile(root,'a.txt','ok','true'),/Opção/);
  assert.deepEqual(await fs.readdir(root),[]);
});
test('file properties observe disk without changing contents or modification date',async t=>{
  const root=await fixture(t),text='a\r\nb\nc\rd⚙';await createAuthoredFile(root,'a.txt',text);
  const before=await fs.stat(path.join(root,'a.txt')),p=await authoredFileInfo(root,'a.txt'),after=await fs.stat(path.join(root,'a.txt'));
  assert.equal(p.encoding,'UTF-8');assert.equal(p.lines,4);assert.equal(p.characters,[...text].length);assert.equal(p.eol,'CRLF+LF+CR');assert.equal(p.revision,hash(text));assert.equal(before.mtimeMs,after.mtimeMs);
  assert.deepEqual(Object.keys(p).sort(),['bytes','characters','encoding','eol','lines','modifiedAt','path','revision'].sort());
});
test('copy is create-only and revision-pinned, with independent contents and no source edits',async t=>{
  const root=await fixture(t);const original=await createAuthoredFile(root,'origem.py','print("oficina")\n');
  const copy=await duplicateAuthoredFile(root,'origem.py','copia.py',original.revision);
  assert.equal(copy.revision,original.revision);assert.equal((await fs.stat(path.join(root,'origem.py'))).nlink,1);
  await fs.writeFile(path.join(root,'copia.py'),'edited');assert.equal(await fs.readFile(path.join(root,'origem.py'),'utf8'),'print("oficina")\n');
  await fs.writeFile(path.join(root,'origem.py'),'external');await assert.rejects(duplicateAuthoredFile(root,'origem.py','stale.py',original.revision),/origem mudou/);
  await assert.rejects(fs.stat(path.join(root,'stale.py')),{code:'ENOENT'});
});
test('rename and relocation preserve bytes and use exclusive destination without deleting existing targets',async t=>{
  const root=await fixture(t),source=await createAuthoredFile(root,'original.ts','export const a=1;');
  await createAuthoredFolder(root,'src');await createAuthoredFile(root,'existing.ts','KEEP');
  await assert.rejects(relocateAuthoredFile(root,'original.ts','existing.ts',source.revision),/existe/);
  assert.equal(await fs.readFile(path.join(root,'existing.ts'),'utf8'),'KEEP');
  const moved=await relocateAuthoredFile(root,'original.ts','src/renamed.ts',source.revision);
  assert.equal(moved.revision,source.revision);assert.equal(await fs.readFile(path.join(root,'src/renamed.ts'),'utf8'),'export const a=1;');
  assert.equal((await fs.stat(path.join(root,'src/renamed.ts'))).nlink,1);
  await assert.rejects(fs.stat(path.join(root,'original.ts')),{code:'ENOENT'});
  await assert.rejects(relocateAuthoredFile(root,'src/renamed.ts','src/RENAMED.ts',source.revision),/diferente/);
  await assert.rejects(relocateAuthoredFile(root,'src/renamed.ts','fresh.ts','0'.repeat(64)),/origem mudou/);
});
test('concurrent creators cannot overwrite one another, or double-move the same revision',async t=>{
  const root=await fixture(t);const attempts=await Promise.allSettled(['one','two'].map(c=>createAuthoredFile(root,'shared.txt',c)));
  assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);assert.equal(attempts.filter(r=>r.status==='rejected').length,1);
  const info=await authoredFileInfo(root,'shared.txt');const moves=await Promise.allSettled(['a.txt','b.txt'].map(dest=>relocateAuthoredFile(root,'shared.txt',dest,info.revision)));
  assert.equal(moves.filter(r=>r.status==='fulfilled').length,1);assert.equal((await fs.readdir(root)).length,1);
});
test('symlink and hard-linked sources or destinations never bypass the project boundary',async t=>{
  const base=await fixture(t),root=path.join(base,'root'),out=path.join(base,'outside');await fs.mkdir(root);await fs.mkdir(out);await fs.writeFile(path.join(out,'kept.txt'),'outside');
  await fs.symlink(out,path.join(root,'jump'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(createAuthoredFile(root,'jump/no.txt','bad',true),/insegura/);
  await assert.rejects(createAuthoredFolder(root,'jump/deeper'),/insegura/);
  await fs.link(path.join(out,'kept.txt'),path.join(root,'linked.txt'));
  await assert.rejects(authoredFileInfo(root,'linked.txt'),/vinculado/);
  await assert.rejects(duplicateAuthoredFile(root,'linked.txt','copy.txt',hash('outside')),/vinculado/);
  await assert.rejects(relocateAuthoredFile(root,'linked.txt','moved.txt',hash('outside')),/vinculado/);
  assert.equal(await fs.readFile(path.join(out,'kept.txt'),'utf8'),'outside');assert.deepEqual(await fs.readdir(out),['kept.txt']);
});
test('malformed UTF8 and binary/oversized file content are refused instead of rewritten',async t=>{
  const root=await fixture(t);
  for(const [name,bytes]of [['invalid.txt',Buffer.from([0xc3,0x28])],['binary.txt',Buffer.from([97,0,98])],['huge.txt',Buffer.alloc(1000001,97)]]){
    await fs.writeFile(path.join(root,name),bytes);await assert.rejects(authoredFileInfo(root,name));assert.deepEqual(await fs.readFile(path.join(root,name)),bytes);
  }
});
test('five original starter kits create only their declared files and never install or run commands',async t=>{
  const root=await fixture(t);
  assert.equal(PROJECT_TEMPLATES.length,5);assert.equal(FILE_TEMPLATES.length,12);
  for(const template of PROJECT_TEMPLATES){const result=await createProjectScaffold(root,template.id,template.id);assert.deepEqual(result.files,Object.keys(template.files));
    for(const [relative,content]of Object.entries(template.files))assert.equal(await fs.readFile(path.join(result.workspace,relative),'utf8'),content);
    await assert.rejects(fs.stat(path.join(result.workspace,'node_modules')),{code:'ENOENT'});
    await assert.rejects(createProjectScaffold(root,template.id,template.id),/existe/);
  }
  assert.throws(()=>fileTemplate('unknown'),/desconhecido/);assert.throws(()=>projectTemplate('unknown'),/desconhecido/);
  await assert.rejects(createProjectScaffold(root,'a/b','blank'),/apenas uma pasta/);
});
test('generated JavaScript CLI and node:test suite execute independently of OmniForge',async t=>{
  const root=await fixture(t),p=await createProjectScaffold(root,'node','node-cli');
  const out=await exec(process.execPath,['src/main.js'],{cwd:p.workspace,timeout:20000});assert.equal(JSON.parse(out.stdout).total,60);
  const env={...process.env};delete env.NODE_TEST_CONTEXT;
  const tests=await exec(process.execPath,['--test','--test-reporter=tap'],{cwd:p.workspace,timeout:20000,env});assert.match(tests.stdout,/# tests 2/);assert.match(tests.stdout,/# fail 0/);
});
test('generated Python CLI and data pipeline pass actual unittest without packages',async t=>{
  const root=await fixture(t),python=process.env.PYTHON||'python';
  for(const template of ['python-cli','data-pipeline']){
    const p=await createProjectScaffold(root,template,template);
    const result=await exec(python,['-m','unittest','discover','-v'],{cwd:p.workspace,timeout:20000,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
    assert.match(result.stderr,/OK/);
    if(template==='data-pipeline'){
      const before=await fs.readFile(path.join(p.workspace,'entrada.csv'),'utf8');
      const output=await exec(python,['pipeline.py'],{cwd:p.workspace,timeout:20000,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
      assert.deepEqual(JSON.parse(output.stdout),{A:'140.50',B:'80'});assert.equal(await fs.readFile(path.join(p.workspace,'entrada.csv'),'utf8'),before);
    }else{const output=await exec(python,['main.py'],{cwd:p.workspace,timeout:20000,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});assert.ok(output.stdout.trim());}
  }
});
test('generated static web project has no external resources and its form computes expected data',()=>{
  const kit=projectTemplate('web-static');
  assert.doesNotMatch(Object.values(kit.files).join(''),/https?:\/\//);
  // The pure event handler is exercised with explicit DOM doubles; browser
  // rendering of this external HTML starter is not certified by this unit test.
  const fields={quantidade:{value:'3'},preco:{value:'12.5'},resultado:{textContent:''}};let callback;
  const document={getElementById:selector=>selector==='form'?{addEventListener:(type,fn)=>{assert.equal(type,'submit');callback=fn;}}:fields[selector]};
  vm.runInNewContext(kit.files['app.js'],{document,Number});assert.equal(typeof callback,'function');
  callback({preventDefault(){}});assert.match(fields.resultado.textContent,/37[.,]50/);
});
