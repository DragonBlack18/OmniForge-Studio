import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { verifyReleaseContract } from '../scripts/verify-release-contract.mjs';
async function fixture(change, expected) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'omni-release-contract-'));
  try{
    await fs.mkdir(path.join(dir,'.github/workflows'),{recursive:true});
    for(const file of ['package.json','package-lock.json','.github/workflows/ci.yml','.github/workflows/windows-build.yml','.github/workflows/release-windows.yml'])
      await fs.copyFile(file,path.join(dir,file));
    await change(dir);await assert.rejects(verifyReleaseContract(dir),expected);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
}
test('release contract validates exact versions, registry integrity and explicit security choices',async()=>{
  const report=await verifyReleaseContract();const pkg=JSON.parse(await fs.readFile('package.json','utf8'));
  assert.equal(report.version,pkg.version);assert.ok(report.components>300);
});
test('release fails closed when a direct dependency differs from its committed lock',async()=>{
  await fixture(async dir=>{const file=path.join(dir,'package.json'),p=JSON.parse(await fs.readFile(file));
    p.devDependencies.react='^19.2.0';await fs.writeFile(file,JSON.stringify(p));},/divergentes/);
});
test('release rejects missing integrity and weakened packaged hardening',async()=>{
  await fixture(async dir=>{const file=path.join(dir,'package-lock.json'),p=JSON.parse(await fs.readFile(file));
    delete p.packages['node_modules/react'].integrity;await fs.writeFile(file,JSON.stringify(p));},/Integridade/);
  await fixture(async dir=>{const file=path.join(dir,'package.json'),p=JSON.parse(await fs.readFile(file));
    p.build.electronFuses.onlyLoadAppFromAsar=false;await fs.writeFile(file,JSON.stringify(p));},/Proteção binária/);
});
test('release rejects unpinned CI installs without changing source or lock',async()=>{
  await fixture(async dir=>{const file=path.join(dir,'.github/workflows/ci.yml');
    await fs.writeFile(file,(await fs.readFile(file,'utf8')).replaceAll('npm ci --no-audit --no-fund','npm install --no-audit --no-fund'));},/instalação fechada/);
});

test('application and dependency lock versions must agree before any release',async()=>{
  await fixture(async dir=>{const file=path.join(dir,'package.json'),p=JSON.parse(await fs.readFile(file));
    p.version='99.0.0';await fs.writeFile(file,JSON.stringify(p));},/Versão divergente/);
});
