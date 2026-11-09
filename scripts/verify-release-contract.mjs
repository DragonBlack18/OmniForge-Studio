/** Deterministic source/lock/security contract; no network, no changes. */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
export async function verifyReleaseContract(root = process.cwd()) {
  const read = file => fs.readFile(path.join(root,file),'utf8');
  const pkg = JSON.parse(await read('package.json')), lock = JSON.parse(await read('package-lock.json'));
  assert.equal(lock.lockfileVersion,3,'Lockfile v3 obrigatório.');
  assert.equal(lock.version,pkg.version,'Versão divergente no lockfile.');
  assert.equal(lock.packages[''].version,pkg.version);
  for(const group of ['dependencies','devDependencies']) {
    assert.deepEqual(lock.packages[''][group]||{},pkg[group]||{},'Manifesto e lock divergentes: '+group);
    for(const [name,version] of Object.entries(pkg[group]||{})){
      assert.match(version,/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/,'Dependência direta precisa de versão exata: '+name);
      assert.equal(lock.packages['node_modules/'+name]?.version,version,'Dependência não fixada: '+name);
    }
  }
  let components=0;
  for(const [location,entry] of Object.entries(lock.packages)){
    if(!location)continue;
    assert.match(entry.resolved||'',/^https:\/\/registry\.npmjs\.org\//,'Origem de dependência não aprovada: '+location);
    assert.match(entry.integrity||'',/^sha512-[A-Za-z0-9+/]+=*$/,'Integridade ausente: '+location);
    components++;
  }
  assert.equal(pkg.build.asar,true);
  assert.equal(pkg.engines.node,'>=24.22.1','O runtime de desenvolvimento deve incluir as APIs SQLite verificadas.');
  assert.equal(pkg.build.npmRebuild,false,'Usar os binários Node-API verificados, sem rebuild implícito do PTY.');
  assert.ok(pkg.build.asarUnpack?.includes('node_modules/node-pty/**'),'PTY e componentes ConPTY precisam ficar fora do ASAR.');
  for(const [key,value] of Object.entries({enableNodeOptionsEnvironmentVariable:false,enableNodeCliInspectArguments:false,
    enableEmbeddedAsarIntegrityValidation:true,onlyLoadAppFromAsar:true,grantFileProtocolExtraPrivileges:false}))
    assert.equal(pkg.build.electronFuses?.[key],value,'Proteção binária alterada: '+key);
  // Existing supervised workers require Electron-as-Node. Do not break them by copying a generic fuse list.
  assert.equal(pkg.build.electronFuses.runAsNode,true);
  for(const name of ['ci.yml','windows-build.yml','release-windows.yml']) {
    const yaml=await read('.github/workflows/'+name);
    assert.match(yaml,/npm ci --no-audit --no-fund/,'Workflow sem instalação fechada: '+name);
    assert.doesNotMatch(yaml,/npm install/,'Instalação mutável no workflow: '+name);
    assert.match(yaml,/npm run verify:release/);
    assert.match(yaml,/npm run smoke:native-security/);
    for(const capability of ['development','flow-topology','cad-precision','capabilities','terminal','database','cad-dimensions'])
      assert.ok(yaml.includes('npm run smoke:'+capability),'Gate de ferramenta ausente: '+capability+' em '+name);
    assert.match(yaml,/node-version: '24\.22\.1'/,'Runtime Node verificado ausente: '+name);
    assert.match(yaml,/actions\/setup-python@v5/,'Python real obrigatório nos testes de desenvolvimento.');
  }
  return {version:pkg.version,components,lockfileVersion:lock.lockfileVersion};
}
if(process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  console.log('PASS release contract:',JSON.stringify(await verifyReleaseContract()));
