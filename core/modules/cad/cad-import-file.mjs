/**
 * Read DXF only from an explicitly selected native file dialog path.
 * No writes. File size, extension, symlink and UTF-8 boundaries enforced.
 */
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { MAX_DXF_BYTES, parseCadDxf } from './cad-import.mjs';

export async function readCadDxfFile(filePath, options={}) {
  if(typeof filePath!=='string' || !filePath || filePath.length>4096 ||
     !path.isAbsolute(filePath) || path.extname(filePath).toLowerCase()!=='.dxf')
    throw new Error('Selecione um arquivo .dxf válido.');
  let handle;
  try {
    const info=await fs.lstat(filePath);
    if(!info.isFile() || info.isSymbolicLink() ||
       info.size===0 || info.size>MAX_DXF_BYTES)
      throw new Error('DXF inválido, link simbólico ou maior que 2 MB.');
    handle=await fs.open(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW||0));
    const stat=await handle.stat();
    if(!stat.isFile() || stat.size===0 || stat.size>MAX_DXF_BYTES)
      throw new Error('DXF alterado durante a seleção ou excede 2 MB.');
    const bytes=await handle.readFile();
    if(bytes.length>MAX_DXF_BYTES)throw new Error('DXF excede 2 MB.');
    let contents;
    try {contents=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
    catch {throw new Error('DXF precisa estar em texto ASCII ou UTF-8 válido.');}
    const result=parseCadDxf(contents,options);
    return {...result,sourceName:path.basename(filePath)};
  } catch(error) {
    // Never propagate native OS errors with private absolute paths.
    if(typeof error?.code==='string')throw new Error('Não foi possível abrir o DXF selecionado.');
    throw error;
  } finally {
    await handle?.close().catch(()=>{});
  }
}
