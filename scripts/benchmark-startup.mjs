/**
 * Measured Electron cold-start sample (no mocked performance data).
 *
 * This benchmark does not enforce a raw timing threshold on GitHub runners:
 * CPUs, Windows Defender, caches and I/O vary. Bundle bytes are gated
 * separately; observed startup and Chromium heap are retained as evidence.
 * No workspace, user secrets or project files are read.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const artifacts=path.join(root,'smoke-artifacts');
const packageVersion=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version;
const samples=[];
const sampleCount=3;
const watchdog=setTimeout(()=>{console.error('[BENCHMARK] timeout');process.exit(1);},180000);
watchdog.unref();

async function sampleOnce(index) {
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'omni-startup-profile-'));
  let app;
  try {
    const start=performance.now();
    app=await electron.launch({
      args:['.'],cwd:root,timeout:45000,
      env:{...process.env,OMNIFORGE_E2E:'1',OMNIFORGE_E2E_USER_DATA:profile,
        ELECTRON_RENDERER_URL:''}
    });
    const page=await app.firstWindow({timeout:45000});
    await page.getByTestId('workspace-overview').waitFor({timeout:30000});
    const readyMs=Math.round((performance.now()-start)*100)/100;
    const originalProfile=await app.evaluate(({app})=>app.getPath('userData'));
    assert.equal(path.normalize(originalProfile).toLowerCase(),path.normalize(profile).toLowerCase());

    const details=await page.evaluate(()=>{
      const navigation=performance.getEntriesByType('navigation')[0];
      const resources=performance.getEntriesByType('resource');
      const scriptResourceNames=resources.map(item=>item.name)
        .filter(name=>/\.js(?:$|\?)/i.test(name));
      return {
        domInteractiveMs: Number.isFinite(navigation?.domInteractive) ? navigation.domInteractive : null,
        domContentLoadedMs: Number.isFinite(navigation?.domContentLoadedEventEnd)
          ? navigation.domContentLoadedEventEnd : null,
        resources:resources.length,
        scriptResourceEntries:scriptResourceNames.length,
        flowCanvasResourceObserved:scriptResourceNames.length
          ? scriptResourceNames.some(name=>/FlowCanvas-[^/]+\.js/i.test(name))
          : null,
        flowDomMounted:Boolean(document.querySelector('.react-flow'))
      };
    });
    assert.equal(details.flowDomMounted,false,
      'A Home fria não pode montar o canvas de automação.');
    let rendererHeapUsedBytes=null;
    try {
      const session=await page.context().newCDPSession(page);
      await session.send('Performance.enable');
      const snapshot=await session.send('Performance.getMetrics');
      const heap=snapshot.metrics.find(item=>item.name==='JSHeapUsedSize')?.value;
      if(Number.isFinite(heap))rendererHeapUsedBytes=Math.round(heap);
      await session.detach();
    } catch { /* CDP metrics can be missing; never invent a number. */ }

    console.log(`[BENCHMARK] sample ${index} cold-start=${readyMs}ms, heap=${rendererHeapUsedBytes ?? 'unavailable'}`);
    return {sample:index, coldStartToWorkbenchMs:readyMs, ...details, rendererHeapUsedBytes};
  } finally {
    if(app) {
      try {
        const child=app.process();
        if(child&&child.exitCode===null)child.kill();
        await Promise.race([app.close().catch(()=>{}),new Promise(r=>setTimeout(r,2200))]);
      } catch {}
    }
    await fs.rm(profile,{recursive:true,force:true}).catch(()=>{});
  }
}

try {
  for(let i=0;i<sampleCount;i++)samples.push(await sampleOnce(i+1));
  const values=samples.map(x=>x.coldStartToWorkbenchMs).sort((a,b)=>a-b);
  const report={
    schemaVersion:1,
    version:packageVersion,
    environment:{os:process.platform,arch:process.arch,node:process.version,
      sampleCount,mode:'packaged-renderer-in-Electron-automation'},
    measures:'wall-clock from Electron launch to React workbench visible; renderer heap from Chromium CDP when available',
    coldStartMs:{minimum:values[0],median:values[1],maximum:values.at(-1)},
    samples,
    caveat:'CI runner/cache vary. omni:// may omit script resource timing (null), so the bundle manifest is authoritative. No RAM/FPS improvement claim without comparison on matched hardware.'
  };
  await fs.mkdir(artifacts,{recursive:true});
  await fs.writeFile(path.join(artifacts,'startup-benchmark-v076.json'),
    JSON.stringify(report,null,2)+'\n');
  console.log('[BENCHMARK] Measured report: '+JSON.stringify(report.coldStartMs));
} catch(error) {
  console.error('[BENCHMARK] FAIL',error);
  process.exitCode=1;
} finally { clearTimeout(watchdog); }
