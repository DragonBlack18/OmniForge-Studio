import test from 'node:test';
import assert from 'node:assert/strict';
import {exampleFlow,createNode} from '../core/modules/automation/catalog.mjs';
import {checkFlowReconnection,reconnectFlowEdge,getFlowNodeConnections} from '../core/modules/automation/connections.mjs';
import {createFlowSession} from '../src/modules/automation/flow-session-store.mjs';

test('reconnect permits the original input but protects every other occupied input',()=>{
  const flow=exampleFlow();
  assert.equal(checkFlowReconnection(flow,'e2',flow.edges[1]).valid,true);
  const candidate={source:'inicio',sourceHandle:'out',target:'gravar',targetHandle:'in'};
  assert.equal(checkFlowReconnection(flow,'e2',candidate).valid,true);
  assert.equal(checkFlowReconnection(flow,'e1',candidate).code,'occupied');
  const before=structuredClone(flow),next=reconnectFlowEdge(flow,'e2',candidate);
  assert.equal(next[1].id,'e2');assert.equal(next[1].source,'inicio');assert.deepEqual(flow,before);
});

test('reconnect rejects cycles, missing edges, self loops and incompatible ports without losing the original wire',()=>{
  const flow=exampleFlow();
  for(const [candidate,code] of [
    [{source:'gravar',sourceHandle:'out',target:'selecionar',targetHandle:'in'},'cycle'],
    [{source:'gravar',sourceHandle:'out',target:'gravar',targetHandle:'in'},'cycle'],
    [{source:'inicio',sourceHandle:'not-a-port',target:'selecionar',targetHandle:'in'},'ports']
  ]){
    assert.equal(checkFlowReconnection(flow,'e1',candidate).code,code);
    assert.throws(()=>reconnectFlowEdge(flow,'e1',candidate));
    assert.equal(flow.edges.length,2);
  }
  assert.equal(checkFlowReconnection(flow,'missing',flow.edges[0]).code,'missing');
});

test('rewiring is one undoable operation, keeps selection, and no-op reconnect adds no history',()=>{
  const flow=exampleFlow(),session=createFlowSession(flow);
  session.setSelectedId('gravar');session.reconnectEdge('e2',flow.edges[1]);assert.equal(session.getSnapshot().historyEntries,0);
  session.reconnectEdge('e2',{source:'inicio',sourceHandle:'out',target:'gravar',targetHandle:'in'});
  assert.equal(session.getSnapshot().historyEntries,1);assert.equal(session.getSnapshot().selectedId,'gravar');
  assert.equal(session.getSnapshot().graph.edges[1].source,'inicio');assert.equal(session.getSnapshot().graph.edges[1].id,'e2');
  session.undo();assert.deepEqual(session.getSnapshot().graph,flow);
  session.redo();assert.equal(session.getSnapshot().graph.edges[1].source,'inicio');
  session.setInteractionLocked(true);
  assert.throws(()=>session.disconnectEdge('e2'),/bloqueada/);assert.throws(()=>session.reconnectEdge('e2',flow.edges[1]),/bloqueada/);
});

test('inspector disconnect is reversible and stale removal does not dirty or change history',()=>{
  const flow=exampleFlow(),session=createFlowSession(flow);
  assert.equal(session.disconnectEdge('missing'),false);assert.equal(session.getSnapshot().flowDirty,false);
  assert.equal(session.disconnectEdge('e1'),true);assert.equal(session.getSnapshot().graph.edges.length,1);
  assert.equal(session.getSnapshot().nodes.length,3);assert.equal(session.getSnapshot().historyEntries,1);
  session.undo();assert.deepEqual(session.getSnapshot().graph,flow);assert.equal(session.getSnapshot().flowDirty,false);
});

test('connection inspector reports all branch targets, required open ports, and upstream endpoints',()=>{
  const flow=exampleFlow();
  flow.nodes.push(createNode('text.trim','other',{x:0,y:0}));
  flow.edges.push({id:'e3',source:'inicio',sourceHandle:'out',target:'other',targetHandle:'in'});
  const start=getFlowNodeConnections(flow,'inicio');assert.equal(start.inputs.length,0);
  assert.deepEqual(start.outputs[0].connections.map(wire=>wire.nodeId),['selecionar','other']);
  const selected=getFlowNodeConnections(flow,'selecionar');
  assert.equal(selected.inputs[0].connections[0].nodeId,'inicio');assert.equal(selected.inputs[0].required,true);
  flow.edges=flow.edges.filter(edge=>edge.id!=='e1');
  assert.equal(getFlowNodeConnections(flow,'selecionar').inputs[0].connections.length,0);
  assert.equal(getFlowNodeConnections(flow,'unknown'),null);
  assert.doesNotMatch(JSON.stringify(selected),/payload|config|venda/);
});
