import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { exampleFlow } from '../core/modules/automation/catalog.mjs';
import { toUiNodes, toFlowDocument,
  hasPersistentNodeChange, hasPersistentEdgeChange } from '../src/modules/automation/useFlowSession.mjs';

test('flow model is serialized without dependency on React Flow renderer', () => {
  const original = exampleFlow();
  const nodes = toUiNodes(original);
  assert.equal(nodes.length,original.nodes.length);
  assert.ok(nodes.every(node=>node.type === 'block'));
  const saved = toFlowDocument(nodes,original.edges);
  assert.equal(saved.schemaVersion,1);
  assert.deepEqual(saved.nodes,original.nodes);
  assert.deepEqual(saved.edges,original.edges);
  assert.equal(saved.name,'Fluxo principal');
});

test('flow dirty-state reflects only document changes, never selection or visual measurements', () => {
  assert.equal(hasPersistentNodeChange([]),false);
  assert.equal(hasPersistentNodeChange([{type:'select',id:'n1',selected:true}]),false);
  assert.equal(hasPersistentNodeChange([{type:'dimensions',id:'n1',dimensions:{width:50,height:30}}]),false);
  assert.equal(hasPersistentNodeChange([{type:'select',id:'n1'},{type:'position',id:'n1'}]),true);
  assert.equal(hasPersistentNodeChange([{type:'remove',id:'n1'}]),true);
  assert.equal(hasPersistentEdgeChange([{type:'select',id:'e1'}]),false);
  assert.equal(hasPersistentEdgeChange([{type:'add',item:{id:'e1'}}]),true);
  assert.equal(hasPersistentEdgeChange([null]),false);
  assert.equal(hasPersistentNodeChange([null]),false);
});

test('visual runtime and React Flow helpers do not appear in static workbench imports',async()=>{
  const shell=await fs.readFile(path.join('src','workbench','AppShell.jsx'),'utf8');
  const session=await fs.readFile(path.join('src','modules','automation','useFlowSession.mjs'),'utf8');
  const canvas=await fs.readFile(path.join('src','modules','automation','FlowCanvas.jsx'),'utf8');
  assert.doesNotMatch(shell,/from\s*['"]@xyflow\/react['"]|require\(['"]@xyflow\/react['"]\)/);
  assert.doesNotMatch(session,/@xyflow\/react['"]|import\s*\(/);
  assert.match(shell,/React\.lazy\(\(\)\s*=>\s*import\(['"]\.\.\/modules\/automation\/FlowCanvas\.jsx['"]\)\)/);
  assert.match(canvas,/applyNodeChanges/);
  assert.match(canvas,/applyEdgeChanges/);
  assert.match(canvas,/addEdge/);
  assert.match(session,/captureSaveToken/);
  assert.match(session,/markSaved/);
});

test('graph serialization omits rendered-only fields without mutating the original',()=>{
  const original=exampleFlow();
  const nodes=toUiNodes(original);
  const before=structuredClone(nodes);
  nodes[0]={...nodes[0],selected:true,measured:{width:120,height:80}};
  const graph=toFlowDocument(nodes,original.edges);
  assert.ok(!Object.hasOwn(graph.nodes[0],'selected'));
  assert.ok(!Object.hasOwn(graph.nodes[0],'measured'));
  assert.deepEqual(nodes.slice(1),before.slice(1));
  assert.equal(graph.nodes[0].id,original.nodes[0].id);
});
