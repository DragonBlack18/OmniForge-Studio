import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {patchMonacoCancellation,monacoCancellationPatch,MONACO_PATCH_TARGET} from '../scripts/lib/monaco-cancellation-patch.mjs';
const fixture = `import { onUnexpectedError } from '../../../../base/common/errors.js';
class Highlighter {
  position(e) { this.runDelayer.trigger(() => { this._onPositionChanged(e); }); }
  focus() { this.runDelayer.trigger(() => { this._run(); }); }
  restore(delay) { this.runDelayer.trigger(() => { this._run(false, delay); }); }
}`;
test('locked upstream backport handles exactly three local call sites and retains other source',()=>{
  const result=patchMonacoCancellation(fixture,'0.55.1');
  assert.equal(result.report.changes,3);assert.equal(result.report.license,'MIT');
  assert.match(result.report.sourceSha256,/^[a-f0-9]{64}$/);
  assert.notEqual(result.report.sourceSha256,result.report.patchedSha256);
  assert.equal(result.code.match(/\.catch\(onUnexpectedError\)/g).length,3);
  assert.equal(result.code.replaceAll('.catch(onUnexpectedError)',''),fixture);
});
test('wrong version, missing import, new upstream fix or partial/duplicate source fail closed',()=>{
  for(const source of [fixture.replace('onUnexpectedError','differentError'),fixture.replace('this._run();','other();'),
    fixture.replace('this._run();','this._run();').replace('  focus()', '  extra(){ this.runDelayer.trigger(() => { this._run(); }); }\n  focus()'),
    patchMonacoCancellation(fixture,'0.55.1').code]) assert.throws(()=>patchMonacoCancellation(source,'0.55.1'),/Backport/);
  assert.throws(()=>patchMonacoCancellation(fixture,'0.57.0'),/versão/);
});
test('cancellation is consumed by upstream handler; other failures still reach that handler',async()=>{
  const handled=[],pending=[];
  const code=patchMonacoCancellation(fixture,'0.55.1').code.replace(/^import[^\n]+\n/,'');
  const context={onUnexpectedError:error=>{if(error.name!=='Canceled')handled.push(error);}};
  const highlighter=vm.runInNewContext(code+'; new Highlighter()',context);
  highlighter.runDelayer={trigger:()=>new Promise((resolve,reject)=>pending.push(reject))};
  highlighter.position({});highlighter.focus();highlighter.restore(1);
  pending[0](Object.assign(new Error('Canceled'),{name:'Canceled'}));
  pending[1](new Error('actual failure'));pending[2](Object.assign(new Error('Canceled'),{name:'Canceled'}));
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(handled.map(error=>error.message),['actual failure']);
});
test('build plugin touches only the locked file and emits the exact transformation provenance',()=>{
  const plugin=monacoCancellationPatch('0.55.1'),assets=[];
  assert.equal(plugin.transform(fixture,'/src/app.js'),null);
  assert.throws(()=>plugin.generateBundle.call({emitFile:asset=>assets.push(asset)}),/não foi exercitado/);
  assert.ok(plugin.transform(fixture,'C:\\node_modules'+MONACO_PATCH_TARGET.replaceAll('/','\\')));
  plugin.generateBundle.call({emitFile:asset=>assets.push(asset)});
  assert.equal(assets[0].fileName,'vendor-patches.json');
  assert.equal(JSON.parse(assets[0].source)[0].changes,3);
  assert.throws(()=>plugin.transform(fixture+'\n', '/node_modules'+MONACO_PATCH_TARGET),/duas fontes/);
});
