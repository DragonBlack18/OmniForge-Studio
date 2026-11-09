import test from 'node:test';
import assert from 'node:assert/strict';
import {navigationRows,problemRows,CODE_ACTIONS} from '../src/modules/ide/language-tools.mjs';
test('outline converts official navigation spans into bounded, navigable symbol rows',()=>{
  const tree={childItems:[{text:'Motor',kind:'class',spans:[{start:10}],childItems:[{text:'run',kind:'method',nameSpan:{start:20}}]},null,{text:'bad',spans:[{start:-1}]}]};
  const rows=navigationRows(tree,n=>({lineNumber:n,column:2}));assert.equal(rows.length,2);assert.equal(rows[1].depth,1);assert.equal(rows[1].line,20);
  assert.equal(navigationRows(tree,n=>({lineNumber:n,column:1}),1).length,1);assert.deepEqual(navigationRows(null,()=>({})),[]);
});
test('diagnostics only reference opened models, sort severity and truncate oversized text',()=>{
  const docs=[{key:'a',path:'a.ts',uri:'file:///a.ts'}];const calls=[];
  const result=problemRows(docs,uri=>{calls.push(uri);return [
    {severity:4,message:'warn',startLineNumber:2,startColumn:3},
    {severity:8,message:'x'.repeat(2000),startLineNumber:4,startColumn:1,code:2322,source:'ts'},
    {severity:8,message:'invalid',startLineNumber:-1}, {severity:99,message:'bad',startLineNumber:1}
  ];});
  assert.deepEqual(calls,['file:///a.ts']);assert.equal(result.errors,1);assert.equal(result.warnings,1);
  assert.equal(result.rows[0].message.length,1200);assert.equal(result.rows[0].code,'2322');assert.equal(result.rows[0].path,'a.ts');
  assert.ok(CODE_ACTIONS.some(a=>a.id==='editor.action.formatDocument'));
});
