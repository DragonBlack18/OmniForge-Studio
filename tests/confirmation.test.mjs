import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmAction,getConfirmation,subscribeConfirmation,finishConfirmation} from '../src/shared/confirm-action.mjs';
test('confirmation keeps one explicit decision and rejects stale or duplicate completions',async()=>{
  const changes=[];const unsub=subscribeConfirmation(()=>changes.push(getConfirmation()?.id??null));
  const first=confirmAction({title:'Trocar projeto',message:'Alterações pendentes',confirmLabel:'Trocar'});
  const original=getConfirmation();assert.ok(original);
  assert.equal(await confirmAction({title:'Segunda',message:'Outra ação'}),false);
  assert.equal(getConfirmation(),original);
  assert.equal(finishConfirmation(original.id+1,true),false);
  assert.equal(finishConfirmation(original.id,false),true);assert.equal(await first,false);
  assert.equal(finishConfirmation(original.id,true),false);
  const second=confirmAction({title:'Descartar cópia',message:'Arquivo original preservado'});
  assert.equal(finishConfirmation(original.id,true),false);
  finishConfirmation(getConfirmation().id,true);assert.equal(await second,true);
  assert.equal(getConfirmation(),null);assert.equal(changes.length,4);unsub();
});
