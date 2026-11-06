import test from 'node:test';
import assert from 'node:assert/strict';
import {bindEditorBuffer} from '../src/modules/ide/editor-buffer.mjs';

function fixture(initial='original') {
  let text=initial, subscriber=null;
  const history=[],future=[];
  const counts={subscriptions:0,disposed:0,edits:0,stops:0};
  const editor={
    getValue:()=>text,getModel:()=>({getFullModelRange:()=>({})}),
    saveViewState:()=>({cursor:2}),restoreViewState:()=>{},
    pushUndoStop:()=>{counts.stops++;},
    onDidChangeModelContent(fn){subscriber=fn;counts.subscriptions++;return {dispose(){subscriber=null;counts.disposed++;}};},
    executeEdits(source,[edit]){history.push(text);text=edit.text;counts.edits++;subscriber?.({source});},
    type(value){history.push(text);text+=value;subscriber?.({source:'keyboard'});},
    undo(){future.push(text);text=history.pop();subscriber?.({isUndoing:true});},
    redo(){history.push(text);text=future.pop();subscriber?.({isRedoing:true});}
  };
  const seen=[];
  const binding=bindEditorBuffer(editor,{version:1,content:initial,onChange:(value,event)=>seen.push({value,event})});
  return {editor,binding,counts,seen};
}
test('stale React echoes never replace more recent Monaco keystrokes',()=>{
  const f=fixture('');
  for(const character of '// revisao local – ação 123') {
    const prior=f.editor.getValue();f.editor.type(character);
    assert.equal(f.binding.replace(1,prior),false);
    assert.equal(f.binding.replace(0,''),false);
  }
  assert.equal(f.editor.getValue(),'// revisao local – ação 123');
  assert.equal(f.seen.at(-1).value,f.editor.getValue());
  assert.equal(f.counts.edits,0);assert.equal(f.counts.subscriptions,1);
});
test('explicit restoration is applied once, undoable, and does not emit an extra user edit',()=>{
  const f=fixture();f.editor.type(' local');
  assert.equal(f.binding.replace(2,'restored'),true);
  assert.equal(f.binding.replace(2,'late stale echo'),false);
  assert.equal(f.editor.getValue(),'restored');assert.equal(f.seen.length,1);
  f.editor.undo();assert.equal(f.editor.getValue(),'original local');
  assert.equal(f.seen.at(-1).event.isUndoing,true);
  f.editor.redo();assert.equal(f.editor.getValue(),'restored');
  assert.equal(f.seen.at(-1).event.isRedoing,true);
});
test('presentation renders and equal text replacements preserve native undo and listener count',()=>{
  const f=fixture();
  for(let i=0;i<100;i++)f.binding.replace(1,'original');
  assert.equal(f.binding.replace(2,'original'),true);
  assert.equal(f.counts.edits,0);assert.equal(f.counts.stops,0);
  assert.equal(f.counts.subscriptions,1);
  f.binding.dispose();f.binding.dispose();assert.equal(f.counts.disposed,1);
  assert.equal(f.binding.replace(3,'should not appear'),false);
  f.editor.type(' ignored');assert.equal(f.seen.length,0);
});
test('failed external edit releases suppression and allows retry without claiming its version',()=>{
  const f=fixture(),apply=f.editor.executeEdits;
  f.editor.executeEdits=()=>{throw new Error('editor failure');};
  assert.throws(()=>f.binding.replace(2,'retry'),/editor failure/);
  f.editor.type(' live');assert.equal(f.seen.at(-1).value,'original live');
  f.editor.executeEdits=apply;
  assert.equal(f.binding.replace(2,'retry'),true);
  assert.equal(f.editor.getValue(),'retry');
});
test('invalid new content/version and unavailable models fail without corrupting live data',()=>{
  const f=fixture();
  assert.throws(()=>f.binding.replace(2,null),/inválida/);
  assert.throws(()=>f.binding.replace(NaN,'bad'),/inválida/);
  f.editor.getModel=()=>null;
  assert.throws(()=>f.binding.replace(2,'bad'),/indisponível/);
  assert.equal(f.editor.getValue(),'original');
  assert.throws(()=>bindEditorBuffer(f.editor,{version:-1,content:'',onChange(){}}),/inválido/);
});
