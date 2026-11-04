import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initialCadSketch } from '../core/modules/cad/cad2d.mjs';
import { saveCadDocument } from '../core/modules/cad/cad-store.mjs';
import { readCadDraft, writeCadDraft, discardCadDraft } from '../core/modules/cad/cad-recovery.mjs';

async function fixture(callback) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'omni-cad-recovery-'));
  const profile = path.join(base, 'profile');
  const workspace = path.join(base, 'workspace');
  await Promise.all([fs.mkdir(profile), fs.mkdir(workspace)]);
  try { await callback({base,profile,workspace}); }
  finally { await fs.rm(base,{recursive:true,force:true}); }
}

test('CAD checkpoint is isolated, atomic, CAS protected and never creates original CAD file', async () => {
  await fixture(async ({profile,workspace}) => {
    assert.equal(await readCadDraft(profile,workspace),null);
    const sketch = initialCadSketch();
    const first = await writeCadDraft(profile,workspace,sketch,null,null);
    assert.match(first.draftRevision,/^[a-f0-9]{64}$/);
    assert.equal((await readCadDraft(profile,workspace)).sketch.layers.length,2);
    await assert.rejects(fs.stat(path.join(workspace,'.omniforge','cad','sketch.json')),{code:'ENOENT'});
    const newer = {...sketch,name:'Peça A'};
    await assert.rejects(writeCadDraft(profile,workspace,newer,null,null),/outra sessão/);
    const second = await writeCadDraft(profile,workspace,newer,null,first.draftRevision);
    assert.notEqual(first.draftRevision,second.draftRevision);
    await assert.rejects(discardCadDraft(profile,workspace,first.draftRevision),/outra sessão/);
    assert.equal((await readCadDraft(profile,workspace)).sketch.name,'Peça A');
    assert.equal(await discardCadDraft(profile,workspace,second.draftRevision),true);
    assert.equal(await readCadDraft(profile,workspace),null);
    assert.equal(await discardCadDraft(profile,workspace,second.draftRevision),false);
  });
});

test('CAD drafts are separated by workspace and by local user profile', async () => {
  await fixture(async ({base,profile,workspace}) => {
    const other=path.join(base,'other');
    const alternateProfile=path.join(base,'other-profile');
    await Promise.all([fs.mkdir(other),fs.mkdir(alternateProfile)]);
    const a=await writeCadDraft(profile,workspace,initialCadSketch(),null,null);
    assert.equal(await readCadDraft(profile,other),null);
    assert.equal(await readCadDraft(alternateProfile,workspace),null);
    const b=await writeCadDraft(profile,other,{...initialCadSketch(),name:'Outro'},null,null);
    assert.equal((await readCadDraft(profile,other)).sketch.name,'Outro');
    assert.equal((await readCadDraft(profile,workspace)).sketch.name,'Desenho técnico');
    assert.equal(await discardCadDraft(profile,workspace,a.draftRevision),true);
    assert.equal((await readCadDraft(profile,other)).draftRevision,b.draftRevision);
  });
});

test('external CAD save blocks new checkpoint without deleting the older draft', async () => {
  await fixture(async ({profile,workspace}) => {
    const sketch=initialCadSketch();
    const original=await saveCadDocument(workspace,sketch,null);
    const first=await writeCadDraft(profile,workspace,{...sketch,name:'Não salvo'},original.revision,null);
    const outside=await saveCadDocument(workspace,{...sketch,name:'Modificado externamente'},original.revision);
    await assert.rejects(writeCadDraft(profile,workspace,{...sketch,name:'Rascunho novo'},original.revision,first.draftRevision),/fora do editor/);
    const surviving=await readCadDraft(profile,workspace);
    assert.equal(surviving.sketch.name,'Não salvo');
    assert.equal(surviving.baseRevision,original.revision);
    assert.notEqual(surviving.baseRevision,outside.revision);
    assert.equal(await discardCadDraft(profile,workspace,first.draftRevision),true);
  });
});

test('malformed, oversized, symlinked or corrupted checkpoints fail closed', async () => {
  await fixture(async ({profile,workspace,base}) => {
    const first=await writeCadDraft(profile,workspace,initialCadSketch(),null,null);
    const folder=path.join(profile,'cad-recovery');
    const [name]=await fs.readdir(folder);
    const file=path.join(folder,name);
    await fs.writeFile(file,'{broken');
    await assert.rejects(readCadDraft(profile,workspace),/corrompido/);
    await assert.rejects(writeCadDraft(profile,workspace,initialCadSketch(),null,first.draftRevision),/corrompido/);
    assert.equal(await fs.readFile(file,'utf8'),'{broken');
    await fs.writeFile(file,'x'.repeat(1_600_001));
    await assert.rejects(readCadDraft(profile,workspace),/maior que o limite/);
    await fs.rm(file);
    const external=path.join(base,'outside.json');
    await fs.writeFile(external,'SEM ALTERAR');
    try {
      await fs.symlink(external,file);
      await assert.rejects(readCadDraft(profile,workspace),/inseguro/);
      assert.equal(await fs.readFile(external,'utf8'),'SEM ALTERAR');
    } catch(error) {
      if (!['EPERM','EACCES','ENOTSUP'].includes(error?.code)) throw error;
    }
  });
});

test('quota is enforced without evicting or modifying existing checkpoints', async () => {
  await fixture(async ({profile,workspace}) => {
    const folder=path.join(profile,'cad-recovery');
    await fs.mkdir(folder);
    for (let i=0;i<20;i++) {
      await fs.writeFile(path.join(folder,i.toString(16).padStart(64,'0')+'.json'),'reserved');
    }
    await assert.rejects(writeCadDraft(profile,workspace,initialCadSketch(),null,null),/Limite de 20/);
    assert.equal((await fs.readdir(folder)).length,20);
    assert.equal(await readCadDraft(profile,workspace),null);
  });
});

test('concurrent first-writers cannot silently replace the same CAD checkpoint', async () => {
  await fixture(async ({profile,workspace}) => {
    const values=await Promise.allSettled([
      writeCadDraft(profile,workspace,{...initialCadSketch(),name:'Primeiro'},null,null),
      writeCadDraft(profile,workspace,{...initialCadSketch(),name:'Segundo'},null,null)
    ]);
    assert.equal(values.filter(item=>item.status==='fulfilled').length,1);
    assert.equal(values.filter(item=>item.status==='rejected').length,1);
    assert.ok(['Primeiro','Segundo'].includes((await readCadDraft(profile,workspace)).sketch.name));
  });
});
