/** Provenance and artifact digests from the files actually built. No server/network. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { execFileSync } from 'node:child_process';
const pkg=JSON.parse(await fs.readFile('package.json','utf8'));
const lockBytes=await fs.readFile('package-lock.json'),lock=JSON.parse(lockBytes);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function hashFile(file){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
const artifacts=[];
for(const kind of ['Setup','Portable']){
  const name=`OmniForge-Studio-${kind}-${pkg.version}-x64.exe`,file=path.join('release',name);
  const info=await fs.lstat(file);
  if(!info.isFile()||info.isSymbolicLink()||info.size<1_000_000)throw Error('Artefato ausente/inválido: '+name);
  const handle=await fs.open(file,'r');const header=Buffer.alloc(2);
  try{await handle.read(header,0,2,0);}finally{await handle.close();}
  if(header.toString()!=='MZ')throw Error('Artefato não é executável Windows: '+name);
  artifacts.push({name,bytes:info.size,sha256:await hashFile(file)});
}
const git=arg=>execFileSync('git',['rev-parse',arg],{encoding:'utf8'}).trim();
const commit=git('HEAD'),tree=git('HEAD^{tree}');
if(!/^[a-f0-9]{40}$/.test(commit)||!/^[a-f0-9]{40}$/.test(tree))throw Error('Proveniência Git inválida.');
const security=JSON.parse(await fs.readFile('release/PACKAGED-SECURITY.json','utf8'));
const manifest={schemaVersion:1,product:pkg.productName,version:pkg.version,channel:'experimental',commit,tree,
  lockSha256:digest(lockBytes),toolchain:{node:process.version,electron:pkg.devDependencies.electron,builder:pkg.devDependencies['electron-builder']},
  authenticode:'not-verified-by-this-script',fuses:security.fuses,artifacts};
await fs.writeFile('release/RELEASE-MANIFEST.json',JSON.stringify(manifest,null,2)+'\n');
const components=Object.entries(lock.packages).filter(([location])=>location).map(([location,item])=>({
  name:location.split('node_modules/').at(-1),version:item.version,license:item.license||'UNSPECIFIED',integrity:item.integrity,
  buildDependency:item.dev===true})).sort((a,b)=>a.name.localeCompare(b.name)||a.version.localeCompare(b.version));
await fs.writeFile('release/DEPENDENCIES.json',JSON.stringify({schemaVersion:1,lockSha256:digest(lockBytes),
  scope:'Resolved build dependencies, not a legal license clearance or runtime-only SBOM.',components},null,2)+'\n');
console.log('PASS release manifest: commit, lock, toolchain, binary hashes and dependency inventory.');
