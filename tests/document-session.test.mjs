import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createDocumentSession,DOCUMENT_LIMIT,OPEN_TEXT_BUDGET} from '../src/modules/ide/document-session.mjs';
const hash=text=>createHash('sha256').update(text).digest('hex');
function fixture(){
  const files=new Map([['a.ts','export const price: number = 10;\n'],['b.py','print(2)\n']]);
  const drafts=new Map(),timers=new Map(),writes=[];
  let i=0;
  const api={
    async readFile(path){if(!files.has(path))throw Error('missing');const content=files.get(path);return {content,revision:hash(content)};},
    async saveFile(path,text,revision){if(hash(files.get(path))!==revision)throw Error('external conflict');files.set(path,text);writes.push(path);return {revision:hash(text)};},
    async readEditorDraft(root,path){return drafts.get(root+'|'+path)||null;},
    async writeEditorDraft(root,path,content,baseRevision,token){
      const key=root+'|'+path,old=drafts.get(key);
      if((old?.draftRevision??null)!==token)throw Error('draft conflict');
      if(hash(files.get(path))!==baseRevision)throw Error('source conflict');
      const record={schemaVersion:1,content,baseRevision,draftRevision:hash(content+baseRevision+ ++i)};
      drafts.set(key,record);return {draftRevision:record.draftRevision};
    },
    async discardEditorDraft(root,path,token){const key=root+'|'+path,old=drafts.get(key);if(!old)return false;if(old.draftRevision!==token)throw Error('draft conflict');drafts.delete(key);return true;}
  };
  const session=createDocumentSession(api,{makeId:()=>String(++i),setTimer:cb=>{const key=++i;timers.set(key,cb);return key;},clearTimer:id=>timers.delete(id)});
  session.reset('/project');
  return {api,files,drafts,timers,writes,session};
}
const active=s=>s.getSnapshot().documents.find(d=>d.key===s.getSnapshot().active);
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};

test('tabs retain independent edits, baselines and dirty state without saving on activation',async()=>{
  const {session:s,files,writes}=fixture();const original=new Map(files);
  await s.open('a.ts');s.edit('a.ts','const x=1;');await s.open('b.py');s.edit('b.py','print(3)');
  assert.equal(s.getSnapshot().pending,2);s.activate('a.ts');assert.equal(active(s).content,'const x=1;');
  assert.equal(active(s).baseline,original.get('a.ts'));assert.deepEqual(files,original);assert.deepEqual(writes,[]);
  await s.save('a.ts');assert.equal(s.getSnapshot().pending,1);assert.equal(files.get('b.py'),original.get('b.py'));
  await s.saveAll();assert.equal(s.getSnapshot().pending,0);assert.equal(files.get('b.py'),'print(3)');s.dispose();
});
test('duplicate opens share one pending load and canonical tab; invalid paths never reach IPC',async()=>{
  const {api,session:s}=fixture();let reads=0;const original=api.readFile;api.readFile=async p=>{reads++;return original(p);};
  await Promise.all([s.open('a.ts'),s.open('a.ts')]);assert.equal(reads,1);assert.equal(s.getSnapshot().documents.length,1);
  await s.open('A.TS');assert.equal(reads,1);
  for(const p of ['../a.ts','/a.ts','a\\b.ts','a:stream','src//a.ts','./a.ts'])await assert.rejects(s.open(p),/inválido/);
  assert.equal(reads,1);s.dispose();
});
test('delayed old project read cannot enter a new workspace and all retained models are released',async()=>{
  const {api,session:s}=fixture();await s.open('a.ts');let disposed=0;s.retain('a.ts',{dispose(){disposed++;}});
  const gate=deferred();api.readFile=()=>gate.promise;
  const pending=s.open('b.py');s.reset('/other');gate.resolve({content:'old',revision:hash('old')});await pending;
  assert.equal(s.getSnapshot().documents.length,0);assert.equal(s.getSnapshot().root,'/other');assert.equal(disposed,1);
  s.dispose();assert.equal(disposed,1);
});
test('save racing a newer edit updates disk baseline, retains dirty text and rebases its checkpoint',async()=>{
  const {api,session:s,files,drafts}=fixture();await s.open('a.ts');s.edit('a.ts','first');await s.flush();
  const gate=deferred(),started=deferred(),original=api.saveFile;
  api.saveFile=async(...args)=>{started.resolve();await gate.promise;return original(...args);};
  const saving=s.save('a.ts');await started.promise;s.edit('a.ts','newer');gate.resolve();const result=await saving;
  assert.equal(result.unchanged,false);assert.equal(files.get('a.ts'),'first');assert.equal(active(s).content,'newer');
  assert.equal(active(s).dirty,true);assert.equal(await s.flush(),true);
  assert.equal(drafts.get('/project|a.ts').content,'newer');assert.equal(drafts.get('/project|a.ts').baseRevision,hash('first'));s.dispose();
});
test('external change blocks save and preserves every open document and recovery copy',async()=>{
  const {session:s,files,drafts}=fixture();await s.open('a.ts');s.edit('a.ts','unsaved');await s.flush();files.set('a.ts','outside');
  await assert.rejects(s.save('a.ts'),/external conflict/);assert.equal(files.get('a.ts'),'outside');assert.equal(active(s).content,'unsaved');
  assert.equal(drafts.get('/project|a.ts').content,'unsaved');assert.equal(active(s).dirty,true);s.dispose();
});
test('recovery is explicit and rechecks source; pending draft locks edits, saving and auto-protection',async()=>{
  const {session:s,files,drafts}=fixture();const source=files.get('a.ts');
  drafts.set('/project|a.ts',{content:'draft',baseRevision:hash(source),draftRevision:hash('draft')});
  await s.open('a.ts');assert.equal(active(s).content,source);assert.ok(active(s).draft);
  assert.throws(()=>s.edit('a.ts','bad'),/rascunho/);await assert.rejects(s.save('a.ts'),/rascunho/);
  files.set('a.ts','outside');await assert.rejects(s.restore('a.ts'),/mudou/);assert.ok(active(s).draft);
  files.set('a.ts',source);assert.equal(await s.restore('a.ts'),true);assert.equal(active(s).content,'draft');assert.equal(active(s).version,2);
  assert.equal(files.get('a.ts'),source);assert.equal(active(s).dirty,true);await s.save('a.ts');assert.equal(drafts.size,0);s.dispose();
});
test('close requires a deliberate dirty choice; cancel preserves everything and discard removes only current draft',async()=>{
  const {session:s,files,drafts}=fixture();const source=files.get('a.ts');await s.open('a.ts');await s.open('b.py');s.activate('a.ts');
  s.edit('a.ts','unsaved');await s.flush();assert.equal(await s.close('a.ts'),false);assert.equal(s.getSnapshot().documents.length,2);
  assert.equal(await s.close('a.ts','discard'),true);assert.equal(drafts.size,0);assert.equal(files.get('a.ts'),source);
  assert.equal(active(s).path,'b.py');s.edit('b.py','print(9)');assert.equal(await s.close('b.py','save'),true);
  assert.equal(files.get('b.py'),'print(9)');assert.equal(s.getSnapshot().documents.length,0);s.dispose();
});
test('save-all stops on a conflict and does not report remaining files as saved',async()=>{
  const {session:s,files}=fixture();await s.open('a.ts');await s.open('b.py');s.edit('a.ts','A');s.edit('b.py','B');files.set('a.ts','outside');
  await assert.rejects(s.saveAll(),/0\/2/);assert.equal(files.get('b.py'),'print(2)\n');assert.equal(s.getSnapshot().pending,2);s.dispose();
});
test('all open dirty documents are checkpointed, not only the visible tab',async()=>{
  const {session:s,drafts,files}=fixture();await s.open('a.ts');s.edit('a.ts','draft A');await s.open('b.py');s.edit('b.py','draft B');
  assert.equal(await s.flush(),true);assert.equal(drafts.get('/project|a.ts').content,'draft A');assert.equal(drafts.get('/project|b.py').content,'draft B');
  assert.notEqual(files.get('a.ts'),'draft A');assert.notEqual(files.get('b.py'),'draft B');s.dispose();
});
test('corrupt recovery does not prevent deliberate original save and is never silently deleted',async()=>{
  const {session:s,api,files}=fixture();api.readEditorDraft=async()=>{throw Error('corrupt');};await s.open('a.ts');
  assert.equal(active(s).blocked,true);s.edit('a.ts','safe');assert.equal(await s.flush(),false);await s.save('a.ts');assert.equal(files.get('a.ts'),'safe');s.dispose();
});
test('model cleanup, views, jumps and cycling are document-scoped and snapshots are stable on reads',async()=>{
  const {session:s}=fixture();const snap=s.getSnapshot();assert.equal(s.getSnapshot(),snap);await s.open('a.ts');await s.open('b.py');
  s.setView('a.ts',{position:4});s.activate('a.ts',{line:2,column:3});assert.equal(active(s).view.position,4);assert.equal(s.getSnapshot().jump.line,2);
  let disposed=0;const model={dispose(){disposed++;}};s.retain('a.ts',model);s.retain('a.ts',model);assert.equal(disposed,0);
  s.cycle(1);assert.equal(active(s).path,'b.py');s.cycle(-1);assert.equal(active(s).path,'a.ts');
  await s.close('a.ts');assert.equal(disposed,1);s.dispose();
});
test('tab and aggregate text quotas fail without evicting existing unsaved documents',async()=>{
  const {session:s,files}=fixture();for(let i=0;i<DOCUMENT_LIMIT+1;i++)files.set('f'+i+'.ts','x');
  for(let i=0;i<DOCUMENT_LIMIT;i++)await s.open('f'+i+'.ts');s.edit('f0.ts','keep');
  await assert.rejects(s.open('f16.ts'),/Limite/);assert.equal(s.getSnapshot().documents[0].content,'keep');
  s.reset('/project');files.set('big.ts','x'.repeat(OPEN_TEXT_BUDGET+1));await assert.rejects(s.open('big.ts'),/Limite/);
  assert.equal(s.getSnapshot().documents.length,0);s.dispose();
});
test('failed checkpoint is visible and a stale cleanup response never mutates another session',async()=>{
  const {session:s,api}=fixture();await s.open('a.ts');s.edit('a.ts','keep');api.writeEditorDraft=async()=>{throw Error('quota');};
  assert.equal(await s.flush(),false);assert.equal(active(s).protection,'failed');assert.match(active(s).error,/quota/);
  s.reset('/new');assert.equal(s.getSnapshot().documents.length,0);s.dispose();
});

test('undo to the baseline retires only its own obsolete checkpoint after verifying disk revision',async()=>{
  const {session:s,files,drafts}=fixture();await s.open('a.ts');const original=files.get('a.ts');
  s.edit('a.ts','temp');await s.flush();s.edit('a.ts',original);await s.flush();assert.equal(drafts.size,0);
  s.edit('a.ts','temp again');await s.flush();files.set('a.ts','external');s.edit('a.ts',original);await s.flush();
  assert.equal(drafts.get('/project|a.ts').content,'temp again');assert.equal(files.get('a.ts'),'external');s.dispose();
});
test('simultaneous open completions cannot exceed the aggregate text budget',async()=>{
  const {session:s,files}=fixture();files.set('large1.ts','x'.repeat(OPEN_TEXT_BUDGET/2+1));files.set('large2.ts','y'.repeat(OPEN_TEXT_BUDGET/2+1));
  const result=await Promise.allSettled([s.open('large1.ts'),s.open('large2.ts')]);
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(s.getSnapshot().documents.length,1);s.dispose();
});

test('real backend: two original files, two recovery records, save/read-back and external conflict',async t=>{
  const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');
  const {readProjectFile,saveProjectFile}=await import('../core/modules/workspace/workspace.mjs');
  const {readEditorDraft,writeEditorDraft,discardEditorDraft}=await import('../core/modules/ide/editor-recovery.mjs');
  const lab=await fs.mkdtemp(path.join(os.tmpdir(),'of-doc-session-')),workspace=path.join(lab,'project'),profile=path.join(lab,'profile');
  await Promise.all([fs.mkdir(workspace),fs.mkdir(profile)]);await fs.writeFile(path.join(workspace,'a.ts'),'const a=1;');await fs.writeFile(path.join(workspace,'b.py'),'print(1)');
  const session=createDocumentSession({readFile:p=>readProjectFile(workspace,p),saveFile:(...a)=>saveProjectFile(workspace,...a),
    readEditorDraft:(...a)=>readEditorDraft(profile,...a),writeEditorDraft:(...a)=>writeEditorDraft(profile,...a),discardEditorDraft:(...a)=>discardEditorDraft(profile,...a)});
  t.after(async()=>{session.dispose();await fs.rm(lab,{recursive:true,force:true});});
  session.reset(workspace);await session.open('a.ts');session.edit('a.ts','const a=2;');await session.open('b.py');session.edit('b.py','print(2)');
  assert.equal(await session.flush(),true);assert.equal((await readEditorDraft(profile,workspace,'a.ts')).content,'const a=2;');
  assert.equal(await fs.readFile(path.join(workspace,'a.ts'),'utf8'),'const a=1;');
  await session.saveAll();assert.equal(await fs.readFile(path.join(workspace,'b.py'),'utf8'),'print(2)');
  assert.equal(await readEditorDraft(profile,workspace,'a.ts'),null);
  session.edit('a.ts','const a=3;');await fs.writeFile(path.join(workspace,'a.ts'),'external');await assert.rejects(session.save('a.ts'),/fora/);
  assert.equal(await fs.readFile(path.join(workspace,'a.ts'),'utf8'),'external');
});
