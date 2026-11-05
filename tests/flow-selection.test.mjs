import test from 'node:test';
import assert from 'node:assert/strict';
import {createFlowSession} from '../src/modules/automation/flow-session-store.mjs';
import {exampleFlow} from '../core/modules/automation/catalog.mjs';
import {WORKFLOW_TEMPLATES} from '../core/modules/automation/templates.mjs';

const selectedIds=s=>s.getSnapshot().nodes.filter(n=>n.selected).map(n=>n.id);
function aligned(s,id){
  assert.equal(s.getSnapshot().selectedId,id);
  assert.deepEqual(selectedIds(s),id?[id]:[]);
}

test('duplicate selects the copy in both canvas and inspector; keyboard delete leaves original intact',()=>{
  const s=createFlowSession(exampleFlow());s.setSelectedId('selecionar');
  const original=structuredClone(s.getSnapshot().graph);
  s.duplicateSelected('copy');aligned(s,'copy');
  // React Flow onBeforeDelete receives the visual selection, not inspector id.
  s.deleteElements({nodes:s.getSnapshot().nodes.filter(n=>n.selected)});
  assert.deepEqual(s.getSnapshot().graph,original);aligned(s,null);
  s.undo();aligned(s,'copy');assert.equal(s.getSnapshot().nodes.length,4);
  s.undo();aligned(s,'selecionar');assert.equal(s.getSnapshot().nodes.length,3);
  s.redo();aligned(s,'copy');s.redo();aligned(s,null);
});

test('load, template and restore synchronize visual selection without persisting UI-only fields',()=>{
  const initial=exampleFlow(),s=createFlowSession(initial);aligned(s,initial.nodes[0].id);
  s.setSelectedId('gravar');
  const template=WORKFLOW_TEMPLATES[0].flow;
  s.applyTemplate(template);aligned(s,template.nodes[0].id);
  s.undo();aligned(s,'gravar');
  s.replaceDocument(template,'revision',false,false);aligned(s,template.nodes[0].id);
  assert.equal(s.getSnapshot().flowDirty,false);assert.equal(s.getSnapshot().recoveryEligible,false);
  s.restoreRecovered(initial);aligned(s,initial.nodes[0].id);
  s.undo();aligned(s,template.nodes[0].id);assert.equal(s.getSnapshot().flowDirty,false);
  for(const node of s.getSnapshot().graph.nodes)assert.equal(Object.hasOwn(node,'selected'),false);
  const before=s.getSnapshot().graph;s.setSelectedId(null);aligned(s,null);
  assert.equal(s.getSnapshot().graph,before);assert.equal(s.getSnapshot().flowDirty,false);
});
