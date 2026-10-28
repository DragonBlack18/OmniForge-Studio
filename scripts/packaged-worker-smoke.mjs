/**
 * Verify the actual installed Electron executable can fork its ASAR-contained
 * workflow worker. Only runs on disposable Windows CI runners.
 * Invoke: node scripts/packaged-worker-smoke.mjs "C:\\...\\OmniForge Studio.exe"
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const exe = process.argv[2];
if (process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true' ||
    !process.env.RUNNER_TEMP || !exe || !path.isAbsolute(exe) || !existsSync(exe)) {
  throw new Error('Teste reservado ao executável instalado no Windows runner descartável.');
}
const archive = path.join(path.dirname(exe), 'resources', 'app.asar');
if (!existsSync(archive)) throw new Error('Arquivo app.asar ausente no executável instalado.');
const moduleFile = path.join(archive, 'core', 'supervisor.mjs');
const payload = `
(async () => {
  const fs = require('node:fs/promises');
  const os = require('node:os');
  const path = require('node:path');
  const { pathToFileURL } = require('node:url');
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'omni-packaged-worker-'));
  try {
    const { runSupervisedFlow } = await import(pathToFileURL(process.argv[1]).href);
    const flow = {
      schemaVersion:1,name:'CI packaged runtime',
      nodes:[{id:'start',type:'trigger.manual',position:{x:0,y:0},config:{payload:'{"value":42}'}},
        {id:'save',type:'io.writeJson',position:{x:200,y:0},config:{fileName:'smoke.json'}}],
      edges:[{id:'e1',source:'start',sourceHandle:'out',target:'save',targetHandle:'in'}]
    };
    const progress = [];
    const result = await runSupervisedFlow(flow,
      {workspace:root,dryRun:false,networkApproved:false,projects:[]},
      {timeoutMs:12000,onProgress:step=>progress.push(step.status)});
    if (!result.ok || progress.length !== 2 || progress.some(v=>v!=='PASS')) {
      throw new Error('O worker empacotado não executou o fluxo: '+JSON.stringify(result));
    }
    const saved = JSON.parse(await fs.readFile(path.join(root,'.omniforge','output','smoke.json'),'utf8'));
    if (saved.value !== 42) throw new Error('JSON não foi gravado pelo worker empacotado.');
    console.log('PACKAGED_SUPERVISOR_PASS: 2 steps, real file persisted in isolated temp workspace.');
    // Prove that the shipped ASAR contains the full declarative runtime as
    // well as the core runner. The grants here are a trusted test snapshot;
    // UI/registry authorization is separately exercised in the Electron E2E.
    const { EXAMPLE_EXTENSION }=await import(pathToFileURL(
      path.join(path.dirname(process.argv[1]),'extension-example.mjs')
    ).href);
    const extFlow={
      schemaVersion:1,name:'CI packaged extension runtime',
      nodes:[
        {id:'begin',type:'trigger.manual',position:{x:0,y:0},
          config:{payload:'{"massaKg":2.25}'}},
        {id:'extension',type:'extension.call',position:{x:200,y:0},
          config:{extensionId:EXAMPLE_EXTENSION.id,actionId:'kg-para-gramas'}}
      ],
      edges:[{id:'ed',source:'begin',sourceHandle:'out',target:'extension',targetHandle:'in'}]
    };
    const extRun=await runSupervisedFlow(extFlow,{
      workspace:root,dryRun:false,networkApproved:false,projects:[],
      extensions:[{manifest:EXAMPLE_EXTENSION,enabled:true,
        grants:['workflow.transform','workspace.output.write']}]
    },{timeoutMs:12000});
    if(!extRun.ok || extRun.steps.length!==2 || extRun.artifacts.length!==1)
      throw new Error('Extensão não funcionou no worker empacotado: '+JSON.stringify(extRun));
    const converted=JSON.parse(await fs.readFile(
      path.join(root,'.omniforge','output','massa-convertida.json'),'utf8'));
    if(converted.massaGramas!==2250)
      throw new Error('Operação declarativa empacotada não calculou o valor real.');
    console.log('PACKAGED_EXTENSION_PASS: authorized declarative action and real JSON output.');
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
})().catch(error => { console.error(String(error?.stack || error)); process.exitCode=1; });
`;
const child = spawn(exe, ['-e', payload, moduleFile], {
  env:{...process.env,ELECTRON_RUN_AS_NODE:'1'}, windowsHide:true,
  stdio:['ignore','pipe','pipe']
});
let stdout='', stderr='', timedOut=false;
const timer=setTimeout(()=>{
  timedOut=true; child.kill();
},30_000);
child.stdout.on('data',chunk=>stdout+=String(chunk).slice(0,30_000));
child.stderr.on('data',chunk=>stderr+=String(chunk).slice(0,30_000));
const result=await new Promise((resolve,reject)=>{
  child.once('error',reject);
  // 'close' guarantees stdout/stderr are fully drained before checking PASS.
  child.once('close',(code,signal)=>resolve({code,signal}));
});
clearTimeout(timer);
console.log(stdout.trim());
if (timedOut || result.code !== 0 ||
    !stdout.includes('PACKAGED_SUPERVISOR_PASS') ||
    !stdout.includes('PACKAGED_EXTENSION_PASS')) {
  throw new Error('Falha no supervisor do app instalado: '+
    JSON.stringify({timedOut,...result,stderr:stderr.slice(-1500),stdout:stdout.slice(-1500)}));
}
