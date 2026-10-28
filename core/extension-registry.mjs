/**
 * Extension Hub v1 — local declarative package registry and workspace grants.
 * All persistence is in Electron userData, never inside a user's project.
 * No package code, dependencies or commands are executed on installation.
 */
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { atomicWrite, verifyWorkspace } from './workspace.mjs';
import { EXTENSION_FILE_MAX_BYTES, EXTENSION_PERMISSIONS, validateExtensionManifest } from './extension-contract.mjs';

const DIR='extension-hub', FILE='extensions.json';
const MAX_EXTENSIONS=40, MAX_REGISTRY_BYTES=2_000_000;
const HASH=/^[a-f0-9]{64}$/;
const ID=/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*){1,5}$/;
const empty=()=>({schemaVersion:1,installed:[],grants:{}});
const sha=value=>createHash('sha256').update(value).digest('hex');

async function safeDirectory(root,{create=false}={}) {
  if(typeof root!=='string'||!path.isAbsolute(root))throw new Error('Perfil do aplicativo inválido.');
  const dir=path.join(path.resolve(root),DIR);
  for(const item of [path.resolve(root),dir]) {
    try {
      const st=await fs.lstat(item);
      if(st.isSymbolicLink()||!st.isDirectory())throw new Error('Diretório das extensões é inseguro.');
    } catch(e) {
      if(e.code!=='ENOENT')throw e;
      if(!create)return null;
      await fs.mkdir(item,{mode:0o700});
    }
  }
  return dir;
}
function validateState(db) {
  if(!db||db.schemaVersion!==1||!Array.isArray(db.installed)||
     db.installed.length>MAX_EXTENSIONS || !db.grants ||
     typeof db.grants!=='object'||Array.isArray(db.grants))
    throw new Error('Registro de extensões corrompido ou incompatível.');
  const seen=new Set();
  for(const item of db.installed) {
    if(!item || typeof item!=='object' || !HASH.test(item.sha256) ||
      typeof item.enabled!=='boolean' || typeof item.installedAt!=='string')
      throw new Error('Extensão registrada inválida.');
    validateExtensionManifest(item.manifest);
    if(seen.has(item.manifest.id))throw new Error('Registro contém extensões duplicadas.');
    if(sha(JSON.stringify(item.manifest))!==item.sha256)
      throw new Error('Integridade da extensão violada. Reinstale o manifesto.');
    seen.add(item.manifest.id);
  }
  if(Object.keys(db.grants).length>160)
    throw new Error('Limite de workspaces autorizados excedido.');
  for(const [workspaceKey, grants] of Object.entries(db.grants)) {
    if(!HASH.test(workspaceKey) || !grants || typeof grants!=='object' || Array.isArray(grants))
      throw new Error('Escopo de autorização inválido.');
    for(const [id,permissions] of Object.entries(grants)) {
      if(!ID.test(id) || !seen.has(id)||!Array.isArray(permissions)||
         permissions.length>EXTENSION_PERMISSIONS.length ||
         new Set(permissions).size!==permissions.length ||
         permissions.some(p=>!EXTENSION_PERMISSIONS.includes(p)))
        throw new Error('Autorização registrada incompatível.');
      const manifest=db.installed.find(x=>x.manifest.id===id).manifest;
      if(permissions.some(p=>!manifest.permissions.includes(p)))
        throw new Error('Uma extensão recebeu permissão não declarada.');
    }
  }
  return db;
}
async function readState(root) {
  const dir=await safeDirectory(root);
  if(!dir)return empty();
  const file=path.join(dir,FILE);
  try {
    const stat=await fs.lstat(file);
    if(stat.isSymbolicLink()||!stat.isFile()||stat.size>MAX_REGISTRY_BYTES)
      throw new Error('Registro das extensões inválido ou substituído por link.');
    return validateState(JSON.parse(await fs.readFile(file,'utf8')));
  } catch(e) {
    if(e.code==='ENOENT')return empty();
    throw e;
  }
}
async function writeState(root,db) {
  validateState(db);
  const data=JSON.stringify(db,null,2)+'\n';
  if(Buffer.byteLength(data)>MAX_REGISTRY_BYTES)throw new Error('Registro de extensões excede 2 MB.');
  const folder=await safeDirectory(root,{create:true});
  const file=path.join(folder,FILE);
  try {
    const stat=await fs.lstat(file);
    if(stat.isSymbolicLink()||!stat.isFile())throw new Error('Registro das extensões inseguro.');
  } catch(e){if(e.code!=='ENOENT')throw e;}
  await atomicWrite(file,data);
}
async function scope(workspace) {
  if(workspace===null||workspace===undefined)return null;
  const abs=await verifyWorkspace(workspace);
  return sha((process.platform==='win32'?abs.toLowerCase():abs));
}
function toPublic(item, grants=[]) {
  const manifest=item.manifest;
  return {
    id:manifest.id, name:manifest.name, description:manifest.description,
    version:manifest.version, sha256:item.sha256, enabled:item.enabled,
    installedAt:item.installedAt,
    permissions:[...manifest.permissions],granted:[...grants],
    actions:manifest.actions.map(a=>({
      id:a.id,name:a.name,description:a.description,
      outputFile:a.outputFile??null,stepCount:a.steps.length
    }))
  };
}
/** Read-only registry listing; never touches the project directory. */
export async function listInstalledExtensions(userData,workspace=null) {
  const db=await readState(userData);
  const key=await scope(workspace);
  return db.installed.map(item=>toPublic(item,key?db.grants[key]?.[item.manifest.id]||[]:[]));
}
/** Trusted snapshot for validation / process-isolated execution. */
export async function extensionSnapshot(userData,workspace) {
  const db=await readState(userData);
  const key=await scope(workspace);
  return db.installed.map(item=>({
    manifest:item.manifest,enabled:item.enabled,
    grants:[...(db.grants[key]?.[item.manifest.id]||[])]
  }));
}
export async function readExtensionFile(filePath) {
  if(typeof filePath!=='string' || !path.isAbsolute(filePath) ||
     !filePath.toLowerCase().endsWith('.ofx.json') || filePath.length>4096)
    throw new Error('Selecione um arquivo .ofx.json válido.');
  let handle;
  try {
    const info=await fs.lstat(filePath);
    if(info.isSymbolicLink()||!info.isFile()||info.size===0||info.size>EXTENSION_FILE_MAX_BYTES)
      throw new Error('Arquivo de extensão inválido, grande ou link simbólico.');
    handle=await fs.open(filePath,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
    const st=await handle.stat();
    if(!st.isFile()||st.size===0||st.size>EXTENSION_FILE_MAX_BYTES)
      throw new Error('Manifesto excede 128 KB.');
    const raw=await handle.readFile();
    if(raw.length>EXTENSION_FILE_MAX_BYTES)throw new Error('Manifesto excede 128 KB.');
    let value;
    try {value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}
    catch {throw new Error('Manifesto deve ser JSON em UTF-8 válido.');}
    return validateExtensionManifest(value);
  } catch(e) {
    if(e.code)throw new Error('Não foi possível ler o manifesto de extensão selecionado.');
    throw e;
  } finally {await handle?.close().catch(()=>{});}
}
export async function installExtension(userData,manifest,{replace=false}={}) {
  validateExtensionManifest(manifest);
  const db=await readState(userData);
  const digest=sha(JSON.stringify(manifest));
  const idx=db.installed.findIndex(item=>item.manifest.id===manifest.id);
  if(idx>=0 && db.installed[idx].sha256===digest)
    return {...toPublic(db.installed[idx]),alreadyInstalled:true};
  if(idx>=0 && !replace)throw new Error('Extensão instalada com conteúdo diferente. Confirme a atualização.');
  if(idx<0 && db.installed.length>=MAX_EXTENSIONS)throw new Error('Limite de 40 extensões.');
  // All grants are revoked on any package upgrade; approval cannot outlive code changes.
  if(idx>=0)for(const perms of Object.values(db.grants))delete perms[manifest.id];
  const item={
    manifest:JSON.parse(JSON.stringify(manifest)),sha256:digest,
    enabled:false,installedAt:new Date().toISOString()
  };
  if(idx<0)db.installed.push(item);else db.installed[idx]=item;
  await writeState(userData,db);
  return {...toPublic(item),alreadyInstalled:false,wasUpgrade:idx>=0};
}
export async function setExtensionEnabled(userData,id,enabled) {
  if(typeof id!=='string'||!ID.test(id)||typeof enabled!=='boolean')
    throw new Error('Estado de extensão inválido.');
  const db=await readState(userData);
  const item=db.installed.find(x=>x.manifest.id===id);
  if(!item)throw new Error('Extensão não instalada.');
  if(item.enabled===enabled)return toPublic(item);
  item.enabled=enabled;
  await writeState(userData,db);
  return toPublic(item);
}
export async function setExtensionGrant(userData,workspace,id,permission,enabled) {
  if(typeof id!=='string'||!ID.test(id) || typeof enabled!=='boolean' ||
     !EXTENSION_PERMISSIONS.includes(permission))
    throw new Error('Concessão de permissão inválida.');
  const db=await readState(userData);
  const item=db.installed.find(x=>x.manifest.id===id);
  if(!item || !item.enabled)throw new Error('Ative a extensão antes de alterar permissões.');
  if(!item.manifest.permissions.includes(permission))throw new Error('Permissão não declarada pela extensão.');
  const key=await scope(workspace);
  if(!key)throw new Error('Abra um projeto para autorizar uma extensão.');
  const grants=db.grants[key]||{};
  const current=new Set(grants[id]||[]);
  if(enabled)current.add(permission);else current.delete(permission);
  if(current.size)grants[id]=[...current].sort();else delete grants[id];
  if(Object.keys(grants).length)db.grants[key]=grants;else delete db.grants[key];
  await writeState(userData,db);
  return toPublic(item,[...current].sort());
}
export async function removeExtension(userData,id) {
  if(typeof id!=='string'||!ID.test(id))throw new Error('ID de extensão inválido.');
  const db=await readState(userData);
  const count=db.installed.length;
  db.installed=db.installed.filter(item=>item.manifest.id!==id);
  if(db.installed.length===count)throw new Error('Extensão não instalada.');
  for(const [key,grants] of Object.entries(db.grants)) {
    delete grants[id];
    if(!Object.keys(grants).length)delete db.grants[key];
  }
  await writeState(userData,db);
  // Existing workflows are never silently rewritten or removed.
  return {removed:true,id};
}
