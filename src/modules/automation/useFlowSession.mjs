/**
 * v0.7.6 — lightweight, durable-in-session workflow document model.
 *
 * No @xyflow/react or browser APIs here. The actual graph engine stays in
 * FlowCanvas.jsx and is imported only when the automation surface is mounted.
 * The owner hook remains mounted while users visit IDE, CAD, Git, or Home so
 * uncommitted edits, selections, revisions and dirty flags survive navigation.
 */
import { useCallback, useMemo, useState } from 'react';

export function toUiNodes(flow) {
  return flow.nodes.map(node => ({
    id: node.id,
    type: 'block',
    position: node.position,
    data: { kind: node.type, config: node.config }
  }));
}

export function toFlowDocument(nodes, edges) {
  return {
    schemaVersion: 1,
    name: 'Fluxo principal',
    nodes: nodes.map(node => ({
      id: node.id, type: node.data.kind,
      position: node.position, config: node.data.config
    })),
    edges: edges.map(edge => ({
      id: edge.id, source: edge.source, target: edge.target,
      sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle
    }))
  };
}

/** Selection and measured dimensions are renderer presentation, not document mutations. */
export function hasPersistentNodeChange(changes) {
  return Array.isArray(changes) && changes.some(change =>
    change && change.type !== 'select' && change.type !== 'dimensions');
}
export function hasPersistentEdgeChange(changes) {
  return Array.isArray(changes) && changes.some(change =>
    change && change.type !== 'select');
}

/**
 * The controlled @xyflow/react utility is injected by the lazily loaded
 * FlowCanvas, preserving its current semantics for drag, select, remove,
 * replace, and edge updates without importing the engine in the shell.
 */
export function useFlowSession(initialFlow) {
  const [nodes, setNodes] = useState(() => toUiNodes(initialFlow));
  const [edges, setEdges] = useState(() => initialFlow.edges);
  const [selectedId, setSelectedId] = useState('inicio');
  const [flowRevision, setFlowRevision] = useState(null);
  const [flowDirty, setFlowDirty] = useState(false);

  const graph = useMemo(() => toFlowDocument(nodes, edges), [nodes, edges]);

  const handleNodesChange = useCallback((changes, applyChanges) => {
    if (typeof applyChanges !== 'function') throw new TypeError('Atualizador de nós inválido.');
    if (hasPersistentNodeChange(changes)) setFlowDirty(true);
    setNodes(previous => applyChanges(changes, previous));
  }, []);

  const handleEdgesChange = useCallback((changes, applyChanges) => {
    if (typeof applyChanges !== 'function') throw new TypeError('Atualizador de conexões inválido.');
    if (hasPersistentEdgeChange(changes)) setFlowDirty(true);
    setEdges(previous => applyChanges(changes, previous));
  }, []);

  const replaceDocument = useCallback((flow, revision, dirty = false) => {
    setNodes(toUiNodes(flow));
    setEdges(flow.edges);
    setSelectedId(flow.nodes[0]?.id || null);
    setFlowRevision(revision);
    setFlowDirty(dirty);
  }, []);

  return {
    nodes, setNodes, edges, setEdges, graph,
    selectedId, setSelectedId,
    flowRevision, setFlowRevision,
    flowDirty, setFlowDirty,
    handleNodesChange, handleEdgesChange,
    replaceDocument
  };
}
