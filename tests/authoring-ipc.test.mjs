import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{installAuthoringIpc}=require('../electron/modules/authoring-ipc.cjs');
function fixture(){let root='/project',confirm=0;const routes=new Map(),calls=[],parent={canceled:false,filePaths:['/chosen']};
  const core=Object.fromEntries(['createAuthoredFile','createAuthoredFolder','authoredFileInfo','duplicateAuthoredFile','relocateAuthoredFile'].map(name=>[name,async(...args)=>{calls.push([name,...args]);return {path:'created'};}]));
  core.authoringPath=async p=>{if(typeof p!=='string'||/[\x00-\x1f]/.test(p))throw Error('Caminho inválido.');};
  core.createProjectScaffold=async(...args)=>{calls.push(['createProjectScaffold',...args]);return {workspace:'/chosen/project',files:['README.md']};};
  core.registerProject=async(...args)=>{calls.push(['register',...args]);return {id:'p',path:'/chosen/project'};};
  const dialog={showOpenDialog:async()=>parent,showMessageBox:async()=>({response:confirm})};
  installAuthoringIpc({register:(name,fn)=>routes.set(name,fn),core,serial:async fn=>fn(),getWorkspace:()=>root,getWindow:()=>({}),dialog,catalogRoot:'/profile',activateProject:async p=>({workspace:p.path,projectId:p.id,files:[]})});
  return {routes,calls,dialog,parent,set root(value){root=value;},set confirm(value){confirm=value;}};
}
test('file creation and metadata are pinned to current native workspace; forged roots never reach filesystem',async()=>{
  const f=fixture();for(const name of ['createAuthoredFile','createAuthoredFolder','duplicateAuthoredFile','relocateAuthoredFile'])await assert.rejects(f.routes.get(name)('/forged','a.txt','x'),/Projeto alterado/);
  assert.throws(()=>f.routes.get('authoredFileInfo')('/forged','a.txt'),/Projeto alterado/);assert.deepEqual(f.calls,[]);
  await f.routes.get('createAuthoredFile')('/project','src/a.txt','exact',true);
  assert.deepEqual(f.calls[0],['createAuthoredFile','/project','src/a.txt','exact',true]);
});
test('file relocation is cancelled by default and rechecks the workspace after native consent',async()=>{
  const f=fixture();assert.equal(await f.routes.get('relocateAuthoredFile')('/project','a','b','0'.repeat(64)),null);assert.deepEqual(f.calls,[]);
  f.dialog.showMessageBox=async()=>{f.root='/other';return {response:1};};
  await assert.rejects(f.routes.get('relocateAuthoredFile')('/project','a','b','0'.repeat(64)),/Projeto alterado/);assert.deepEqual(f.calls,[]);
});
test('approved file relocation uses exact revision and never substitutes arbitrary native paths',async()=>{
  const f=fixture();f.confirm=1;await f.routes.get('relocateAuthoredFile')('/project','src/a.ts','src/b.ts','0'.repeat(64));
  assert.deepEqual(f.calls,[['relocateAuthoredFile','/project','src/a.ts','src/b.ts','0'.repeat(64)]]);
});
test('project creation uses only the native chosen parent, registers after success and exposes real file list',async()=>{
  const f=fixture();const r=await f.routes.get('createProjectFromTemplate')('project','blank','/untrusted-extra');
  assert.deepEqual(f.calls[0],['createProjectScaffold','/chosen','project','blank']);
  assert.deepEqual(f.calls[1],['register','/profile','/chosen/project']);assert.deepEqual(r.createdFiles,['README.md']);assert.equal(r.workspace,'/chosen/project');
});
test('cancelled or ambiguous folder chooser creates and registers nothing',async()=>{
  for(const selection of [{canceled:true,filePaths:[]},{canceled:false,filePaths:[]},{canceled:false,filePaths:['/one','/two']}]){
    const f=fixture();Object.assign(f.parent,selection);assert.equal(await f.routes.get('createProjectFromTemplate')('project','blank'),null);assert.deepEqual(f.calls,[]);
  }
});
