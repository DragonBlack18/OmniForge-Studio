import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { exampleFlow } from '../core/modules/automation/catalog.mjs';
import { readFlowDocument, saveFlow } from '../core/modules/workspace/workspace.mjs';
import { assertRecoverableFlow, readFlowDraft, writeFlowDraft, discardFlowDraft } from '../core/modules/automation/flow-recovery.mjs';
import ipc from '../electron/modules/flow-recovery-ipc.cjs';

// Real authenticated crypto for core filesystem tests; Windows E2E uses native
// safeStorage, not this adapter. Random test keys are never shipped as app keys.
function testCodec() {
  const key = randomBytes(32);
  return { available:async()=>true,
    encrypt:async text => {
      const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
      const bytes=Buffer.concat([cipher.update(text,'utf8'),cipher.final()]);
      return Buffer.concat([iv,cipher.getAuthTag(),bytes]);
    },
    decrypt:async bytes => {
      const decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));
      decipher.setAuthTag(bytes.subarray(12,28));
      return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8');
    }
  };
}
async function fixture(fn) {
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'of-flow-recovery-'));
  const profile=path.join(base,'profile'),root=path.join(base,'project');
  await Promise.all([fs.mkdir(profile),fs.mkdir(root)]);
  const codec=testCodec();
  try { await fn({base,profile,root,codec}); } finally { await fs.rm(base,{recursive:true,force:true}); }
}
const fileFor=async profile=>path.join(profile,'flow-recovery',(await fs.readdir(path.join(profile,'flow-recovery'))).find(n=>n.endsWith('.oflow')));

test('encrypted flow checkpoints preserve config and geometry without creating original or plaintext',async()=>fixture(async({profile,root,codec})=>{
  assert.equal(await readFlowDraft(profile,root,codec),null);
  assert.deepEqual(await fs.readdir(profile),[]);
  const flow=exampleFlow();flow.nodes[0].config.input='PRIVATE_TEST_VALUE';
  const saved=await writeFlowDraft(profile,root,flow,null,null,codec);
  const read=await readFlowDraft(profile,root,codec);
  assert.deepEqual(read.flow,flow);assert.equal(read.draftRevision,saved.draftRevision);
  assert.equal(read.sourceRevision,null);assert.equal(read.sourceUnavailable,false);
  const bytes=await fs.readFile(await fileFor(profile));
  assert.equal(bytes.includes(Buffer.from('PRIVATE_TEST_VALUE')),false);
  assert.equal(bytes.includes(Buffer.from(root)),false);
  assert.deepEqual(await fs.readdir(root),[]);
  assert.equal(await discardFlowDraft(profile,root,saved.draftRevision,codec),true);
  assert.equal(await readFlowDraft(profile,root,codec),null);
}));

test('recovery accepts disconnected authoring graphs, rejects malformed IDs, edges, bounds and excess bytes',()=>{
  const flow=exampleFlow();flow.edges=[];assertRecoverableFlow(flow);
  assertRecoverableFlow({schemaVersion:1,name:'Empty',nodes:[],edges:[]});
  for (const mutate of [
    f=>f.nodes.push(f.nodes[0]), f=>f.nodes[0].position.x=Infinity,
    f=>f.nodes[0].type='nonexistent',f=>f.edges[0].source='missing',
    f=>f.nodes[0].config=null,f=>f.nodes[0].config.text='x'.repeat(2_000_001),
    f=>f.nodes[0].position.x=1_000_001,f=>f.edges.push(f.edges[0])
  ]) { const f=exampleFlow();mutate(f);assert.throws(()=>assertRecoverableFlow(f)); }
});

test('optimistic draft revisions, deduplication and concurrent first writers are serialized',async()=>fixture(async({profile,root,codec})=>{
  const a=exampleFlow(),b={...exampleFlow(),name:'B'};
  const pair=await Promise.allSettled([writeFlowDraft(profile,root,a,null,null,codec),writeFlowDraft(profile,root,b,null,null,codec)]);
  assert.equal(pair.filter(v=>v.status==='fulfilled').length,1);
  const first=await readFlowDraft(profile,root,codec);
  const unchanged=await writeFlowDraft(profile,root,first.flow,null,first.draftRevision,codec);
  assert.equal(unchanged.draftRevision,first.draftRevision);
  const next=await writeFlowDraft(profile,root,{...a,name:'Changed'},null,first.draftRevision,codec);
  await assert.rejects(discardFlowDraft(profile,root,first.draftRevision,codec),/outra sessão/);
  assert.equal((await readFlowDraft(profile,root,codec)).draftRevision,next.draftRevision);
  await assert.rejects(writeFlowDraft(profile,root,a,null,undefined,codec),/Revisão/);
}));

test('external source change never overwrites source or rebases a draft silently',async()=>fixture(async({profile,root,codec})=>{
  const flow=exampleFlow();const original=await saveFlow(root,flow,null);
  const changed=await saveFlow(root,{...flow,name:'EXTERNAL'},original.revision);
  const pending={...flow,name:'Unsaved'};
  await writeFlowDraft(profile,root,pending,original.revision,null,codec);
  const recovered=await readFlowDraft(profile,root,codec);
  assert.equal(recovered.baseRevision,original.revision);assert.equal(recovered.sourceRevision,changed.revision);
  assert.equal((await readFlowDocument(root)).flow.name,'EXTERNAL');
  await fs.writeFile(path.join(root,'.omniforge','flows','principal.json'),'{broken');
  const next=await readFlowDraft(profile,root,codec);
  assert.equal(next.sourceUnavailable,true);assert.deepEqual(next.flow,pending);
}));

test('profile and workspace binding prevent cross-project or cross-user restoration',async()=>fixture(async({base,profile,root,codec})=>{
  const other=path.join(base,'second'),profile2=path.join(base,'profile2');
  await Promise.all([fs.mkdir(other),fs.mkdir(profile2)]);
  await writeFlowDraft(profile,root,exampleFlow(),null,null,codec);
  assert.equal(await readFlowDraft(profile,other,codec),null);
  assert.equal(await readFlowDraft(profile2,root,codec),null);
  const key=createHash('sha256').update(process.platform==='win32'?(await fs.realpath(other)).toLowerCase():await fs.realpath(other)).digest('hex');
  await fs.copyFile(await fileFor(profile),path.join(profile,'flow-recovery',key+'.oflow'));
  await assert.rejects(readFlowDraft(profile,other,codec),/incompatível/);
}));

test('quota retains all existing checkpoints and never evicts an old project',async()=>fixture(async({profile,root,codec})=>{
  const folder=path.join(profile,'flow-recovery');await fs.mkdir(folder);
  for(let i=0;i<20;i++)await fs.writeFile(path.join(folder,i.toString(16).padStart(64,'0')+'.oflow'),'reserved');
  await assert.rejects(writeFlowDraft(profile,root,exampleFlow(),null,null,codec),/Limite de 20/);
  assert.equal((await fs.readdir(folder)).length,20);
  assert.deepEqual(await fs.readdir(root),[]);
}));

test('crypto failure preserves previous bytes and unavailable crypto creates no draft folder',async()=>fixture(async({profile,root,codec})=>{
  const blocked={...codec,available:async()=>{throw new Error('unavailable');}};
  await assert.rejects(writeFlowDraft(profile,root,exampleFlow(),null,null,blocked),/unavailable/);
  assert.deepEqual(await fs.readdir(profile),[]);
  const token=await writeFlowDraft(profile,root,exampleFlow(),null,null,codec);
  const file=await fileFor(profile),bytes=await fs.readFile(file);
  const fail={...codec,encrypt:async()=>{throw new Error('encryption failed');}};
  await assert.rejects(writeFlowDraft(profile,root,{...exampleFlow(),name:'New'},null,token.draftRevision,fail));
  assert.deepEqual(await fs.readFile(file),bytes);
  const wrong=testCodec();await assert.rejects(readFlowDraft(profile,root,wrong),/decifrar/);
  assert.deepEqual(await fs.readFile(file),bytes);
}));

test('corrupt and oversized checkpoints block replacement and stay intact',async()=>fixture(async({profile,root,codec})=>{
  const first=await writeFlowDraft(profile,root,exampleFlow(),null,null,codec);
  const file=await fileFor(profile);await fs.writeFile(file,'broken');
  await assert.rejects(readFlowDraft(profile,root,codec),/corrompido/);
  await assert.rejects(writeFlowDraft(profile,root,exampleFlow(),null,first.draftRevision,codec),/corrompido/);
  assert.equal(await fs.readFile(file,'utf8'),'broken');
  await fs.writeFile(file,Buffer.alloc(2_100_001));
  await assert.rejects(readFlowDraft(profile,root,codec),/limite/);
}));

test('recovery refuses symbolic and hard links without altering target bytes',async t=>fixture(async({base,profile,root,codec})=>{
  const first=await writeFlowDraft(profile,root,exampleFlow(),null,null,codec),file=await fileFor(profile);
  const external=path.join(base,'external');await fs.writeFile(external,'untouched');await fs.unlink(file);
  try { await fs.symlink(external,file); }
  catch(e){if(!['EPERM','EACCES','ENOTSUP'].includes(e.code))throw e;t.diagnostic('Symlink not permitted on this runner.');}
  if(await fs.lstat(file).catch(()=>null)){
    await assert.rejects(readFlowDraft(profile,root,codec),/inseguro/);
    await assert.rejects(discardFlowDraft(profile,root,first.draftRevision,codec),/inseguro/);
    await fs.unlink(file);
  }
  await fs.link(external,file);await assert.rejects(readFlowDraft(profile,root,codec),/inseguro/);
  assert.equal(await fs.readFile(external,'utf8'),'untouched');
}));

test('Windows native codec uses asynchronous OS API and refuses plaintext fallback elsewhere',async()=>{
  let encrypted=false;
  const native={isAsyncEncryptionAvailable:async()=>true,encryptStringAsync:async s=>{encrypted=true;return Buffer.from(s);},decryptStringAsync:async b=>({result:b.toString(),shouldReEncrypt:false})};
  const windows=ipc.createFlowDraftCodec(native,'win32');
  assert.equal(await windows.decrypt(await windows.encrypt('contract')),'contract');assert.equal(encrypted,true);
  for(const platform of ['linux','darwin'])await assert.rejects(ipc.createFlowDraftCodec(native,platform).available(),/indisponível/);
  await assert.rejects(ipc.createFlowDraftCodec({...native,isAsyncEncryptionAvailable:async()=>false},'win32').available(),/indisponível/);
});

test('flow draft IPC only accepts the active workspace and exposes no arbitrary path or execution',async()=>{
  const handlers=new Map(),calls=[];
  ipc.installFlowRecoveryIpc({register:(n,f)=>handlers.set(n,f),getProfile:()=>'/profile',safeStorage:{},
    pinnedWorkspace:root=>{if(root!=='/active')throw new Error('Workspace alterado');return root;},
    core:{readFlowDraft:(...args)=>calls.push(args),writeFlowDraft(){},discardFlowDraft(){}}});
  assert.deepEqual([...handlers.keys()],['readFlowDraft','writeFlowDraft','discardFlowDraft']);
  assert.throws(()=>handlers.get('readFlowDraft')('/foreign'),/Workspace/);
  handlers.get('readFlowDraft')('/active');assert.equal(calls[0][0],'/profile');assert.equal(calls[0][1],'/active');
});
