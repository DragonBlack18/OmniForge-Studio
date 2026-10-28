/** Project-local CAD documents: explicit revision, atomic saves, recovery, safe export. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { initialCadSketch, validateCadSketch, cadDxf, cadSvg } from './cad2d.mjs';
import { atomicWrite, makeTrustedDirectory, verifyWorkspace } from './workspace.mjs';

const CAD_DIR = ['.omniforge','cad'];
const DOCUMENT = 'sketch.json';
const MAX_DOC = 1_500_000;
const digest = data => createHash('sha256').update(data).digest('hex');

async function readExisting(root) {
  const base = await verifyWorkspace(root);
  let current=base;
  for(const segment of CAD_DIR){
    current=path.join(current,segment);
    try { const st=await fs.lstat(current); if(st.isSymbolicLink()||!st.isDirectory())throw new Error('Diretório CAD inseguro.'); }
    catch(e){if(e.code==='ENOENT')return null;throw e;}
  }
  const file=path.join(current,DOCUMENT);
  try {
    const st=await fs.lstat(file);
    if(st.isSymbolicLink()||!st.isFile()||st.size>MAX_DOC)throw new Error('Desenho CAD inválido ou muito grande.');
    return await fs.readFile(file);
  }catch(e){if(e.code==='ENOENT')return null;throw e;}
}

export async function loadCadDocument(workspace) {
  const bytes=await readExisting(workspace);
  if(!bytes)return { sketch:initialCadSketch(),revision:null };
  let data;
  try{data=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes));}
  catch{throw new Error('O desenho CAD não é JSON UTF-8 válido.');}
  validateCadSketch(data);
  return { sketch:data, revision:digest(bytes) };
}

export async function saveCadDocument(workspace, sketch, expectedRevision) {
  const base=await verifyWorkspace(workspace);
  validateCadSketch(sketch);
  if(expectedRevision!==null && (typeof expectedRevision!=='string'||!/^[a-f0-9]{64}$/.test(expectedRevision)))throw new Error('Revisão CAD inválida.');
  const data=JSON.stringify(sketch,null,2)+'\n';
  if(Buffer.byteLength(data)>MAX_DOC)throw new Error('Desenho CAD excede 1,5 MB.');
  const existing=await readExisting(base),actual=existing?digest(existing):null;
  if(actual!==expectedRevision)throw new Error('O desenho CAD foi alterado fora do editor. Reabra antes de salvar.');
  const folder=await makeTrustedDirectory(base,CAD_DIR.join('/'));
  if(existing){
    const archive=await makeTrustedDirectory(base,'.omniforge/cad-history');
    const previous=path.join(archive,`${actual}.json`);
    try{await fs.lstat(previous);}catch(e){if(e.code==='ENOENT')await atomicWrite(previous,existing.toString('utf8'));else throw e;}
  }
  const dest=path.join(folder,DOCUMENT);
  await atomicWrite(dest,data);
  return { path:path.join(...CAD_DIR,DOCUMENT),revision:digest(Buffer.from(data)) };
}

export async function exportCadSketch(workspace, format, sketch) {
  if(!['svg','dxf'].includes(format))throw new Error('Formato CAD não suportado.');
  const root=await verifyWorkspace(workspace);
  validateCadSketch(sketch);
  const contents=format==='svg'?cadSvg(sketch):cadDxf(sketch);
  const folder=await makeTrustedDirectory(root,'.omniforge/output');
  const file=path.join(folder,`cad-sketch.${format}`);
  try{const st=await fs.lstat(file);if(!st.isFile()||st.isSymbolicLink())throw new Error('Destino CAD inseguro.');}
  catch(e){if(e.code!=='ENOENT')throw e;}
  await atomicWrite(file,contents);
  return { path:file, relativePath:`.omniforge/output/cad-sketch.${format}`,bytes:Buffer.byteLength(contents),format };
}
