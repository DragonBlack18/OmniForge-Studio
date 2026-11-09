/** Bounded, create-only authoring and revision-pinned file relocation. No execution. */
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {verifyWorkspace} from '../workspace/workspace.mjs';
import {projectTemplate} from './project-templates.mjs';
const PRIVATE=new Set(['.git','.omniforge','node_modules','dist','release','.venv','venv','.next','build','coverage','.cache','__pycache__','@untitled']);
const SECRET=/^(?:\.env(?:\..*)?|\.npmrc|\.pypirc|id_(?:rsa|dsa|ed25519|ecdsa)(?:\.pub)?|secrets?(?:\..*)?|credentials(?:\..*)?)$/i;
const DEVICE=/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const BINARY=/\.(?:exe|dll|zip|7z|rar|png|jpe?g|gif|pdf|db|sqlite3?|wasm|bin|pem|key|pfx|p12|crt)$/i;
const HASH=/^[a-f0-9]{64}$/;
const MAX=1_000_000;
const hash=b=>createHash('sha256').update(b).digest('hex');
const serials=new Map();
async function serialize(root,operation){const prev=serials.get(root)||Promise.resolve();let release;const turn=new Promise(r=>release=r);serials.set(root,turn);await prev;try{return await operation();}finally{release();if(serials.get(root)===turn)serials.delete(root);}}
export function authoringPath(value,{folder=false}={}){
  if(typeof value!=='string'||!value||value.length>260||/^[~/]/.test(value)||/[\\\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069<>"|?*:]/.test(value))throw Error('Use um caminho relativo válido, com /.');
  const parts=value.split('/');
  if(parts.length>9||parts.some(p=>!p||p==='.'||p==='..'||p.length>100||/[. ]$/.test(p)||DEVICE.test(p)||PRIVATE.has(p.toLowerCase())))throw Error('Nome inválido ou pasta protegida.');
  if(parts.some(p=>SECRET.test(p))||(!folder&&BINARY.test(parts.at(-1))))throw Error('Arquivo sensível ou binário não é aceito nesta operação.');
  return parts;
}
async function collision(folder,name){const found=(await fs.readdir(folder)).find(v=>v.toLowerCase()===name.toLowerCase());if(found)throw Error('O destino já existe (inclusive variação de maiúsculas). Nada será sobrescrito.');}
async function safeDirectory(folder,base){const s=await fs.lstat(folder);if(!s.isDirectory()||s.isSymbolicLink())throw Error('Pasta pai insegura.');const real=await fs.realpath(folder);if(real!==base&&!real.startsWith(base+path.sep))throw Error('Pasta fora do projeto.');return real;}
async function target(base,relative,{parents=false,folder=false}={}){
  const parts=authoringPath(relative,{folder});let at=base;const created=[];
  for(const part of parts.slice(0,-1)){
    const next=path.join(at,part);
    try{await safeDirectory(next,base);}catch(error){
      if(error.code!=='ENOENT'||!parents)throw error;
      await collision(at,part);await fs.mkdir(next,{mode:0o700});created.push(path.relative(base,next).split(path.sep).join('/'));await safeDirectory(next,base);
    }at=next;
  }
  return {file:path.join(at,parts.at(-1)),parent:at,name:parts.at(-1),created};
}
async function readSafe(base,relative){
  const t=await target(base,relative);const info=await fs.lstat(t.file);
  if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||info.size>MAX)throw Error('Arquivo indisponível, vinculado ou maior que 1 MB.');
  const handle=await fs.open(t.file,constants.O_RDONLY|(process.platform==='win32'?0:constants.O_NOFOLLOW));
  try{
    const stat=await handle.stat();if(stat.ino!==info.ino||stat.dev!==info.dev||stat.nlink!==1||stat.size>MAX)throw Error('O arquivo mudou durante a leitura.');
    const data=await handle.readFile();if(data.byteLength>MAX||data.includes(0))throw Error('Conteúdo binário ou maior que 1 MB.');
    let content;try{content=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(data);}catch{throw Error('Conteúdo não está em UTF-8 válido.');}
    return {...t,content,revision:hash(data),bytes:data.length,stat};
  }finally{await handle.close();}
}
function validText(text){if(typeof text!=='string'||text.includes('\0')||Buffer.from(text,'utf8').toString('utf8')!==text||Buffer.byteLength(text,'utf8')>MAX)throw Error('Conteúdo inválido ou maior que 1 MB.');}
async function create(base,relative,content,parents){
  validText(content);const t=await target(base,relative,{parents});await collision(t.parent,t.name);
  // O_EXCL is authoritative even when another process wins after readdir.
  const handle=await fs.open(t.file,'wx',0o600);
  try{await handle.writeFile(content,'utf8');await handle.sync();}finally{await handle.close();}
  return {path:relative,revision:hash(content),bytes:Buffer.byteLength(content),createdDirectories:t.created};
}
export async function createAuthoredFile(root,relative,content='',parents=false){
  authoringPath(relative);validText(content);if(typeof parents!=='boolean')throw Error('Opção de pastas inválida.');
  const base=await verifyWorkspace(root);return serialize(base,()=>create(base,relative,content,parents));
}
export async function createAuthoredFolder(root,relative){
  authoringPath(relative,{folder:true});const base=await verifyWorkspace(root);
  return serialize(base,async()=>{const t=await target(base,relative,{parents:true,folder:true});await collision(t.parent,t.name);await fs.mkdir(t.file,{mode:0o700});return {path:relative,createdDirectories:[...t.created,relative]};});
}
export async function authoredFileInfo(root,relative){
  const base=await verifyWorkspace(root),s=await readSafe(base,relative);
  const crlf=(s.content.match(/\r\n/g)||[]).length,lf=(s.content.match(/(?<!\r)\n/g)||[]).length,cr=(s.content.match(/\r(?!\n)/g)||[]).length;
  return {path:relative,bytes:s.bytes,characters:[...s.content].length,lines:s.content? s.content.split(/\r\n|\n|\r/).length:0,
    eol:[crlf&&'CRLF',lf&&'LF',cr&&'CR'].filter(Boolean).join('+')||'nenhuma',encoding:'UTF-8',revision:s.revision,modifiedAt:s.stat.mtime.toISOString()};
}
export async function duplicateAuthoredFile(root,source,destination,revision){
  if(!HASH.test(revision))throw Error('Revisão obrigatória.');const base=await verifyWorkspace(root);
  return serialize(base,async()=>{const item=await readSafe(base,source);if(item.revision!==revision)throw Error('A origem mudou. Atualize antes de duplicar.');return create(base,destination,item.content,false);});
}
export async function relocateAuthoredFile(root,source,destination,revision){
  authoringPath(source);authoringPath(destination);if(source.toLowerCase()===destination.toLowerCase())throw Error('Escolha um nome realmente diferente.');
  if(!HASH.test(revision))throw Error('Revisão obrigatória.');const base=await verifyWorkspace(root);
  return serialize(base,async()=>{
    const item=await readSafe(base,source);if(item.revision!==revision)throw Error('A origem mudou. Reabra antes de mover.');
    const dest=await target(base,destination);await collision(dest.parent,dest.name);
    // link is exclusive (no rename-overwrite); only a regular file on this
    // filesystem is supported. No directory moves or cross-volume fallback.
    await fs.link(item.file,dest.file);let committed=false;
    try{
      const now=await fs.lstat(item.file),there=await fs.lstat(dest.file);
      if(now.ino!==item.stat.ino||now.dev!==item.stat.dev||there.ino!==now.ino||now.isSymbolicLink()||now.nlink!==2)throw Error('Origem alterada durante a movimentação.');
      if(hash(await fs.readFile(item.file))!==revision)throw Error('A origem mudou durante a movimentação.');
      await fs.unlink(item.file);committed=true;
      const result=await readSafe(base,destination);
      return {source,path:destination,revision:result.revision,bytes:result.bytes};
    }catch(error){
      if(!committed){try{const s=await fs.lstat(dest.file);if(s.ino===item.stat.ino&&s.dev===item.stat.dev)await fs.unlink(dest.file);}catch{}}
      throw error;
    }
  });
}
export async function createProjectScaffold(parent,name,templateId){
  if(authoringPath(name,{folder:true}).length!==1)throw Error('O nome do projeto deve conter apenas uma pasta.');
  const template=projectTemplate(templateId),base=await verifyWorkspace(parent);
  return serialize(base,async()=>{
    await collision(base,name);const root=path.join(base,name);await fs.mkdir(root,{mode:0o700});
    const files=[];
    try{for(const [relative,content] of Object.entries(template.files)){await create(root,relative,content,true);files.push(relative);}}
    catch(error){throw Error('Criação interrompida; os arquivos já criados foram preservados. '+error.message);}
    return {workspace:await fs.realpath(root),templateId,files};
  });
}
