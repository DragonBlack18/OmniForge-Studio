import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runPackagedProjectChecks} from '../scripts/lib/packaged-project-checks.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('installed-runtime acceptance helper runs actual source workers, four data flows, vendor hashes and safe authoring',async()=>{
  const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'omni-package-check-'));
  try {
    const result=await runPackagedProjectChecks(path.join(root,'core'),workspace);
    assert.deepEqual(result,{dataNodes:26,templates:4,vendorHashes:true,invalidInputBlocked:true,authoring:true});
  } finally {await fs.rm(workspace,{recursive:true,force:true});}
});
test('installed acceptance payload remains self-contained and is required by the EXE gate',async()=>{
  const body=runPackagedProjectChecks.toString();
  // Compile the exact serialization used by the disposable-runner harness.
  assert.doesNotThrow(()=>new Function('return ('+body+');'));
  assert.doesNotMatch(body,/process\.cwd\(|node_modules|\.\.\/core/);
  const script=await fs.readFile(path.join(root,'scripts/packaged-worker-smoke.mjs'),'utf8');
  assert.match(script,/runPackagedProjectChecks\.toString\(\)/);
  assert.match(script,/!stdout\.includes\('PACKAGED_PROJECT_DATA_PASS'\)/);
});
