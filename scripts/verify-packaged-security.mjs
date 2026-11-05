/** Read actual fuse bytes in the packaged executable; source configuration is not evidence. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { getCurrentFuseWire, FuseV1Options, FuseVersion } from '@electron/fuses';
import assert from 'node:assert/strict';
const file=path.resolve(process.argv[2]||'release/win-unpacked/OmniForge Studio.exe');
const stat=await fs.lstat(file);
assert.ok(stat.isFile()&&!stat.isSymbolicLink(),'Executável inválido.');
const wire=await getCurrentFuseWire(file);
assert.equal(wire.version,FuseVersion.V1);
const expected={RunAsNode:true,EnableNodeOptionsEnvironmentVariable:false,EnableNodeCliInspectArguments:false,
  EnableEmbeddedAsarIntegrityValidation:true,OnlyLoadAppFromAsar:true,GrantFileProtocolExtraPrivileges:false};
const checked={};
for(const [name,enabled]of Object.entries(expected)){
  assert.equal(wire[FuseV1Options[name]],enabled?'1'.charCodeAt(0):'0'.charCodeAt(0),'Fuse divergente: '+name);
  checked[name]=enabled;
}
await fs.mkdir('release',{recursive:true});
await fs.writeFile('release/PACKAGED-SECURITY.json',JSON.stringify({schemaVersion:1,binary:path.basename(file),fuses:checked,
  limitation:'RunAsNode is required by current supervised workers. Fuse checks do not replace Authenticode signing.'},null,2)+'\n');
console.log('PASS packaged security: actual binary fuses verified.');
