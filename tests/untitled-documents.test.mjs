import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createDocumentSession,DOCUMENT_LIMIT,OPEN_TEXT_BUDGET} from '../src/modules/ide/document-session.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const active=s=>s.getSnapshot().documents.find(d=>d.key===s.getSnapshot().active);
function fixture(){
  const files=new Map([['existing.ts','export const a=1;']]),drafts=new Map(),writes=[],timers=new Map();let seq=0;
  const api={
    readFile:async path=>{if(!files.has(path))throw Error('missing');return {content:files.get(path),revision:hash(files.get(path))};},
    saveFile:async(path,text,revision)=>{if(revision!==hash(files.get(path)))throw Error('conflict');files.set(path,text);writes.push(['save',path]);return {revision:hash(text)};},
    createAuthoredFile:async(root,path,text,parents)=>{if(files.has(path))throw Error('exists');files.set(path,text);writes.push(['create',root,path,text,parents]);return {path,revision:hash(text)};},
    readEditorDraft:async(root,path)=>drafts.get(root+'|'+path)||null,
    writeEditorDraft:async(root,path,content,baseRevision,token)=>{const key=root+'|'+path,old=drafts.get(key);if((old?.draftRevision??null)!==token)throw Error('CAS');const v={content,baseRevision,draftRevision:hash(content+ ++seq)};drafts.set(key,v);return v;},
    discardEditorDraft:async(root,path,token)=>{const key=root+'|'+path;if(drafts.get(key)?.draftRevision!==token)throw Error('CAS');drafts.delete(key);return true;}
  };
  const s=createDocumentSession(api,{makeId:()=>String(++seq),setTimer:fn=>{timers.set(++seq,fn);return seq;},clearTimer:id=>timers.delete(id)});
  return {s,api,files,drafts,writes,timers};
}
test('a blank document starts without a workspace and remains dirty even when empty',async()=>{
  const {s,writes,drafts,timers}=fixture(),p=s.newDocument();
  assert.equal(active(s).untitled,true);assert.equal(active(s).content,'');assert.equal(active(s).dirty,true);
  assert.equal(s.getSnapshot().root,'');assert.equal(s.getSnapshot().pending,1);
  assert.equal(await s.flush(),false);assert.equal(await s.flush({allowUntitled:true}),true);
  assert.equal(timers.size,0);assert.equal(drafts.size,0);assert.deepEqual(writes,[]);
  assert.equal(await s.close(p),false);assert.equal(await s.close(p,'discard'),true);s.dispose();
});
test('template text and native model survive first project attachment without creating files',()=>{
  const {s,writes}=fixture();const p=s.newDocument({extension:'py',content:'print("ok")\n'}),scope=s.getSnapshot().scope;let disposed=0;
  s.retain(p,{dispose(){disposed++;}});s.setView(p,{line:3});s.attachInitialWorkspace('/project');
  assert.equal(s.getSnapshot().scope,scope);assert.equal(active(s).content,'print("ok")\n');assert.equal(active(s).view.line,3);assert.equal(disposed,0);assert.deepEqual(writes,[]);
  assert.throws(()=>s.attachInitialWorkspace('/other'),/Somente/);s.dispose();assert.equal(disposed,1);
});
test('Save As creates a real path from the exact text and retires only its scratch model',async()=>{
  const {s,files,writes}=fixture(),p=s.newDocument({extension:'ts',content:'const valor=3;'});let disposed=0;
  s.retain(p,{dispose(){disposed++;}});await assert.rejects(s.saveAs(p,'src/a.ts'),/pasta/);
  s.attachInitialWorkspace('/project');const result=await s.saveAs(p,'src/a.ts',{parents:true});
  assert.equal(result.unchanged,true);assert.equal(files.get('src/a.ts'),'const valor=3;');assert.equal(active(s).untitled,false);assert.equal(active(s).path,'src/a.ts');assert.equal(active(s).dirty,false);assert.equal(disposed,1);
  assert.deepEqual(writes,[['create','/project','src/a.ts','const valor=3;',true]]);assert.equal(s.getSnapshot().documents.length,1);
  s.edit('src/a.ts','const valor=4;');await s.save('src/a.ts');assert.equal(files.get('src/a.ts'),'const valor=4;');s.dispose();
});
test('Save As of an existing edited document opens a copy and preserves original dirty state',async()=>{
  const {s,files}=fixture();s.reset('/project');await s.open('existing.ts');s.edit('existing.ts','edited');
  const result=await s.saveAs('existing.ts','copy.ts');assert.equal(result.copy,true);assert.equal(files.get('existing.ts'),'export const a=1;');assert.equal(files.get('copy.ts'),'edited');
  const docs=s.getSnapshot().documents;assert.equal(docs.length,2);assert.equal(docs.find(d=>d.path==='existing.ts').dirty,true);assert.equal(docs.find(d=>d.path==='copy.ts').dirty,false);s.dispose();
});
test('Save As never truncates or replaces a conflicting file or loses untitled text on rejection',async()=>{
  const {s,files}=fixture();s.reset('/project');const p=s.newDocument({content:'keep'});await assert.rejects(s.saveAs(p,'existing.ts'),/exists/);
  assert.equal(active(s).content,'keep');assert.equal(active(s).dirty,true);assert.equal(active(s).saving,false);assert.equal(files.get('existing.ts'),'export const a=1;');s.dispose();
});
test('editing while Save As is in-flight retains new text and rebases its new checkpoint',async()=>{
  const {s,api,files,drafts}=fixture();s.reset('/project');const p=s.newDocument({content:'first'}),started=deferred(),gate=deferred(),original=api.createAuthoredFile;
  api.createAuthoredFile=async(...args)=>{started.resolve();await gate.promise;return original(...args);};
  const pending=s.saveAs(p,'file.txt');await started.promise;s.edit(p,'newer');gate.resolve();const result=await pending;
  assert.equal(result.unchanged,false);assert.equal(files.get('file.txt'),'first');assert.equal(active(s).content,'newer');assert.equal(active(s).dirty,true);
  assert.equal(await s.flush(),true);assert.equal(drafts.get('/project|file.txt').content,'newer');assert.equal(drafts.get('/project|file.txt').baseRevision,hash('first'));s.dispose();
});
test('late Save As result is bound to its original project and never replaces new project tabs',async()=>{
  const {s,api}=fixture();s.reset('/one');const p=s.newDocument({content:'one'}),started=deferred(),gate=deferred(),original=api.createAuthoredFile;
  api.createAuthoredFile=async(...args)=>{started.resolve();await gate.promise;return original(...args);};
  const pending=s.saveAs(p,'new.txt');await started.promise;s.reset('/two');const newPath=s.newDocument({content:'two'});gate.resolve();assert.equal((await pending).stale,true);
  assert.equal(s.getSnapshot().documents.length,1);assert.equal(active(s).path,newPath);assert.equal(active(s).content,'two');s.dispose();
});
test('Save All refuses unnamed documents rather than pretending they were saved',async()=>{
  const {s,files}=fixture();s.reset('/project');const p=s.newDocument({content:'scratch'});await s.open('existing.ts');s.edit('existing.ts','should remain unsaved');
  await assert.rejects(s.saveAll(),/Salvar como/);assert.equal(files.get('existing.ts'),'export const a=1;');assert.equal(s.getSnapshot().documents.find(d=>d.path===p).content,'scratch');s.dispose();
});
test('close-saved and close-other-saved never discard dirty or unnamed tabs',async()=>{
  const {s,files}=fixture();files.set('b.ts','b');s.reset('/project');await s.open('existing.ts');await s.open('b.ts');const p=s.newDocument({content:'new'});s.edit('b.ts','dirty');
  assert.equal(await s.closeSaved(),1);assert.equal(s.getSnapshot().documents.length,2);assert.ok(s.getSnapshot().documents.some(d=>d.path===p));
  await s.save('b.ts');s.activate('b.ts');assert.equal(await s.closeSaved({exceptActive:true}),0);s.dispose();
});
test('last-closed paths can reopen saved documents, are bounded, and are cleared across projects',async()=>{
  const {s,files}=fixture();s.reset('/project');
  for(let i=0;i<12;i++){files.set('f'+i+'.ts',''+i);await s.open('f'+i+'.ts');await s.close('f'+i+'.ts');}
  assert.equal(s.getSnapshot().recentClosed.length,10);await s.reopenClosed();assert.equal(active(s).path,'f11.ts');
  assert.equal(s.getSnapshot().recentClosed.length,9);s.reset('/other');await assert.rejects(s.reopenClosed(),/Não há/);s.dispose();
});
test('limits and input checks cover new documents; overflowing text is never silently truncated',()=>{
  const {s}=fixture();assert.throws(()=>s.newDocument({extension:'../js'}),/inválido/);
  assert.throws(()=>s.newDocument({content:'x'.repeat(OPEN_TEXT_BUDGET+1)}),/Limite/);
  for(let i=0;i<DOCUMENT_LIMIT;i++)s.newDocument();assert.throws(()=>s.newDocument(),/16/);assert.equal(s.getSnapshot().documents.length,DOCUMENT_LIMIT);s.dispose();
});

test('creating destinations are reserved against concurrent opens and other Save As requests',async()=>{
  const {s,api}=fixture();s.reset('/project');const first=s.newDocument({content:'first'}),second=s.newDocument({content:'second'}),gate=deferred(),started=deferred(),original=api.createAuthoredFile;
  api.createAuthoredFile=async(...args)=>{started.resolve();await gate.promise;return original(...args);};
  const pending=s.saveAs(first,'reserved.txt');await started.promise;
  await assert.rejects(s.open('reserved.txt'),/Aguarde/);await assert.rejects(s.saveAs(second,'RESERVED.TXT'),/destino/);
  gate.resolve();await pending;assert.equal(s.getSnapshot().documents.length,2);assert.equal(active(s).content,'first');s.dispose();
});
test('copy reservations count against the tab cap, leaving no unbounded gap while native write is pending',async()=>{
  const {s,api,files}=fixture();s.reset('/project');await s.open('existing.ts');
  for(let i=0;i<14;i++)s.newDocument();const gate=deferred(),started=deferred(),original=api.createAuthoredFile;
  api.createAuthoredFile=async(...args)=>{started.resolve();await gate.promise;return original(...args);};
  const pending=s.saveAs('existing.ts','copy.ts');await started.promise;
  assert.throws(()=>s.newDocument(),/16/);files.set('other.txt','other');await assert.rejects(s.open('other.txt'),/16/);
  gate.resolve();await pending;assert.equal(s.getSnapshot().documents.length,16);s.dispose();
});
test('a failed create releases only its own reservation and preserves the existing session',async()=>{
  const {s,api}=fixture();s.reset('/project');const p=s.newDocument({content:'keep'}),original=api.createAuthoredFile;
  api.createAuthoredFile=async()=>{throw Error('disk full');};await assert.rejects(s.saveAs(p,'retry.txt'),/disk full/);
  api.createAuthoredFile=original;await s.saveAs(p,'retry.txt');assert.equal(active(s).path,'retry.txt');s.dispose();
});
