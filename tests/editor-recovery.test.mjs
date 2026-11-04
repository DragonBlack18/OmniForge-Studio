import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { readProjectFile, saveProjectFile } from '../core/modules/workspace/workspace.mjs';
import {
  readEditorDraft, writeEditorDraft, discardEditorDraft
} from '../core/modules/ide/editor-recovery.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'of-editor-draft-'));
  const workspace = path.join(root,'workspace');
  const other = path.join(root,'other');
  const profile = path.join(root,'profile');
  await Promise.all([fs.mkdir(workspace),fs.mkdir(other),fs.mkdir(profile)]);
  await fs.writeFile(path.join(workspace,'file.js'),'const original = 1;\n');
  await fs.writeFile(path.join(other,'file.js'),'const original = 1;\n');
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  return { root, workspace, profile, other };
}
async function base(root, relative='file.js') {
  return (await readProjectFile(root,relative)).revision;
}
test('first recovery read is side-effect free, and draft does not modify original file', async t => {
  const { workspace, profile }=await fixture(t);
  const revision=await base(workspace);
  assert.equal(await readEditorDraft(profile,workspace,'file.js'),null);
  assert.deepEqual(await fs.readdir(profile),[]);
  const saved=await writeEditorDraft(profile,workspace,'file.js','const original = 2;\n',revision,null);
  assert.match(saved.draftRevision,/^[a-f0-9]{64}$/);
  assert.equal(await fs.readFile(path.join(workspace,'file.js'),'utf8'),'const original = 1;\n');
  const draft=await readEditorDraft(profile,workspace,'file.js');
  assert.equal(draft.content,'const original = 2;\n');
  assert.equal(draft.baseRevision,revision);
  assert.equal(draft.draftRevision,saved.draftRevision);
  const filenames=await fs.readdir(path.join(profile,'editor-recovery'));
  assert.equal(filenames.length,1);
  assert.match(filenames[0],/^[0-9a-f]{64}\.json$/);
  assert.ok(!filenames[0].includes('file.js'));
  assert.deepEqual(await fs.readdir(workspace),['file.js']);
});
test('restoring to editor is independent of normal protected disk save; discard requires current token',async t=>{
  const {workspace,profile}=await fixture(t);
  const revision=await base(workspace);
  const one=await writeEditorDraft(profile,workspace,'file.js','draft 1',revision,null);
  const two=await writeEditorDraft(profile,workspace,'file.js','draft 2',revision,one.draftRevision);
  await assert.rejects(discardEditorDraft(profile,workspace,'file.js',one.draftRevision),/exclusão bloqueada/);
  const snapshot=await readEditorDraft(profile,workspace,'file.js');
  assert.equal(snapshot.content,'draft 2');
  await saveProjectFile(workspace,'file.js',snapshot.content,revision);
  assert.equal(await discardEditorDraft(profile,workspace,'file.js',two.draftRevision),true);
  assert.equal(await readEditorDraft(profile,workspace,'file.js'),null);
  assert.equal(await fs.readFile(path.join(workspace,'file.js'),'utf8'),'draft 2');
});
test('external changes do not get overwritten or silently accepted',async t=>{
  const {workspace,profile}=await fixture(t);
  const revision=await base(workspace);
  const first=await writeEditorDraft(profile,workspace,'file.js','important unsaved',revision,null);
  await fs.writeFile(path.join(workspace,'file.js'),'externally modified');
  await assert.rejects(writeEditorDraft(profile,workspace,'file.js','other',revision,first.draftRevision),
    /mudou fora do editor/);
  const recovered=await readEditorDraft(profile,workspace,'file.js');
  assert.equal(recovered.content,'important unsaved');
  assert.equal(await fs.readFile(path.join(workspace,'file.js'),'utf8'),'externally modified');
});
test('two workspaces with same filenames have disjoint recovery content',async t=>{
  const {workspace,other,profile}=await fixture(t);
  await writeEditorDraft(profile,workspace,'file.js','LOCAL_A',await base(workspace),null);
  await writeEditorDraft(profile,other,'file.js','LOCAL_B',await base(other),null);
  assert.equal((await readEditorDraft(profile,workspace,'file.js')).content,'LOCAL_A');
  assert.equal((await readEditorDraft(profile,other,'file.js')).content,'LOCAL_B');
  assert.equal((await fs.readdir(path.join(profile,'editor-recovery'))).length,2);
});
test('concurrent writers with same optimistic draft token have at most one success',async t=>{
  const {workspace,profile}=await fixture(t);
  const revision=await base(workspace);
  const attempts=await Promise.allSettled([
    writeEditorDraft(profile,workspace,'file.js','first',revision,null),
    writeEditorDraft(profile,workspace,'file.js','second',revision,null)
  ]);
  assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(attempts.filter(x=>x.status==='rejected').length,1);
  const item=await readEditorDraft(profile,workspace,'file.js');
  assert.ok(['first','second'].includes(item.content));
});
test('corrupted recovery JSON blocks writes and is never reset automatically',async t=>{
  const {workspace,profile}=await fixture(t);
  const revision=await base(workspace);
  const saved=await writeEditorDraft(profile,workspace,'file.js','good',revision,null);
  const folder=path.join(profile,'editor-recovery');
  const filename=(await fs.readdir(folder))[0];
  await fs.writeFile(path.join(folder,filename),'{"schemaVersion":1,"bad":"keep"}');
  await assert.rejects(readEditorDraft(profile,workspace,'file.js'),/Contrato/);
  await assert.rejects(writeEditorDraft(profile,workspace,'file.js','bad',revision,saved.draftRevision),/Contrato/);
  assert.equal(await fs.readFile(path.join(folder,filename),'utf8'),'{"schemaVersion":1,"bad":"keep"}');
});
test('path traversal, binary symlinks and secret filenames never create drafts',async t=>{
  const {workspace,profile,root}=await fixture(t);
  for(const privateName of ['.env','.env.production','.npmrc','credentials.json','private.pem','secret.key']) {
    await fs.writeFile(path.join(workspace,privateName),'secret');
    const revision=await base(workspace,privateName);
    await assert.rejects(writeEditorDraft(profile,workspace,privateName,'secret',revision,null),/credenciais/);
  }
  await assert.rejects(readEditorDraft(profile,workspace,'../outside.js'));
  await assert.rejects(writeEditorDraft(profile,workspace,'../../x','value','a'.repeat(64),null));
  const external=path.join(root,'external.txt');
  await fs.writeFile(external,'source');
  try { await fs.symlink(external,path.join(workspace,'link.txt')); }
  catch(e) { if(['EPERM','ENOSYS','EACCES'].includes(e.code))return t.skip('symlink unavailable');throw e; }
  await assert.rejects(readEditorDraft(profile,workspace,'link.txt'),/links simbólicos/);
});
test('content and capacity quota fail closed without deleting existing drafts',async t=>{
  const {workspace,profile}=await fixture(t);
  const revision=await base(workspace);
  await assert.rejects(writeEditorDraft(profile,workspace,'file.js','x'.repeat(240001),revision,null),/240 KB/);
  assert.equal(await readEditorDraft(profile,workspace,'file.js'),null);
  for(let i=0;i<40;i++){
    const relative='draft-'+i+'.txt';
    await fs.writeFile(path.join(workspace,relative),'baseline');
    await writeEditorDraft(profile,workspace,relative,'unsaved',await base(workspace,relative),null);
  }
  await assert.rejects(writeEditorDraft(profile,workspace,'file.js','new',revision,null),/Limite de 40/);
  assert.equal((await fs.readdir(path.join(profile,'editor-recovery'))).length,40);
});
test('symlinked recovery folder is never followed',async t=>{
  const {workspace,profile,other}=await fixture(t);
  try {await fs.symlink(other,path.join(profile,'editor-recovery'),'dir');}
  catch(e) {if(['EPERM','ENOSYS','EACCES'].includes(e.code))return t.skip('symlink unavailable');throw e;}
  await assert.rejects(writeEditorDraft(profile,workspace,'file.js','value',await base(workspace),null),/insegura/);
  assert.deepEqual(await fs.readdir(other),['file.js']);
});
