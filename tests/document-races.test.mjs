import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createDocumentSession} from '../src/modules/ide/document-session.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
const gate = () => {let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function fixture() {
  const source=new Map([['a.ts','old a'],['b.ts','old b']]);
  const drafts=new Map(),writes=[],timers=new Map();let clock=0;
  const api={
    async readFile(path) {const content=source.get(path);return {content,revision:hash(content)};},
    async saveFile(path,content,revision) {
      if (hash(source.get(path))!==revision) throw Error('source conflict');
      source.set(path,content);writes.push({path,content});return {revision:hash(content)};
    },
    async readEditorDraft(root,path) {return drafts.get(root+'|'+path)||null;},
    async writeEditorDraft(root,path,content,baseRevision,token) {
      const key=root+'|'+path,previous=drafts.get(key);
      if ((previous?.draftRevision??null)!==token) throw Error('draft conflict');
      const record={content,baseRevision,draftRevision:hash(content+ ++clock)};
      drafts.set(key,record);return {draftRevision:record.draftRevision};
    },
    async discardEditorDraft(root,path,token) {
      const key=root+'|'+path,record=drafts.get(key);if (!record)return false;
      if (record.draftRevision!==token)throw Error('stale discard');
      drafts.delete(key);return true;
    }
  };
  const session=createDocumentSession(api,{
    makeId:()=>String(++clock),setTimer:fn=>{const id=++clock;timers.set(id,fn);return id;},clearTimer:id=>timers.delete(id)
  });
  session.reset('/first');return {session,api,source,drafts,writes};
}

test('save-all never continues into another project even when paths have identical names',async t=>{
  const {session:s,api,writes}=fixture();t.after(()=>s.dispose());
  await s.open('a.ts');await s.open('b.ts');s.edit('a.ts','first a');s.edit('b.ts','first b');
  const started=gate(),finish=gate(),save=api.saveFile;
  api.saveFile=async(...args)=>{started.resolve();await finish.promise;return save(...args);};
  const operation=s.saveAll();const rejected=assert.rejects(operation,/Projeto alterado/);
  await started.promise;s.reset('/second');await s.open('b.ts');s.edit('b.ts','second b');
  finish.resolve();await rejected;
  assert.deepEqual(writes,[{path:'a.ts',content:'first a'}]);
  assert.equal(s.getSnapshot().documents[0].content,'second b');
  assert.equal(s.getSnapshot().dirty,true);
});

test('a clean close rechecks edits that arrive while it drains a prior checkpoint',async t=>{
  const {session:s,api}=fixture();t.after(()=>s.dispose());await s.open('a.ts');
  s.edit('a.ts','temporary');const started=gate(),finish=gate(),write=api.writeEditorDraft;
  api.writeEditorDraft=async(...args)=>{started.resolve();await finish.promise;return write(...args);};
  const flushing=s.flush();await started.promise;s.edit('a.ts','old a');
  const closing=s.close('a.ts');s.edit('a.ts','must survive');finish.resolve();await flushing;
  assert.equal(await closing,false);
  assert.equal(s.getSnapshot().documents[0].content,'must survive');
});

test('late discard cannot erase an edit made while native deletion is in flight',async t=>{
  const {session:s,api,drafts}=fixture();t.after(()=>s.dispose());await s.open('a.ts');s.edit('a.ts','previous');await s.flush();
  const started=gate(),finish=gate(),discard=api.discardEditorDraft;
  api.discardEditorDraft=async(...args)=>{started.resolve();await finish.promise;return discard(...args);};
  const closing=s.close('a.ts','discard');await started.promise;s.edit('a.ts','newest');finish.resolve();
  assert.equal(await closing,false);
  assert.equal(s.getSnapshot().documents[0].content,'newest');
  assert.equal(await s.flush(),true,'fresh draft token must replace the deleted token');
  assert.equal(drafts.get('/first|a.ts').content,'newest');
});

test('save-and-close keeps a fresh edit that arrives during checkpoint cleanup',async t=>{
  const {session:s,api,source}=fixture();t.after(()=>s.dispose());await s.open('a.ts');s.edit('a.ts','saved');await s.flush();
  const started=gate(),finish=gate(),discard=api.discardEditorDraft;
  api.discardEditorDraft=async(...args)=>{started.resolve();await finish.promise;return discard(...args);};
  const closing=s.close('a.ts','save');await started.promise;s.edit('a.ts','newest');finish.resolve();
  assert.equal(await closing,false);assert.equal(source.get('a.ts'),'saved');
  assert.equal(s.getSnapshot().documents[0].content,'newest');
});
