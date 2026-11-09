import { FLOW_LIMITS } from './flow-limits.mjs';
import { getNodeDefinition } from './catalog.mjs';

export const FLOW_LAYOUT_DIMENSIONS = Object.freeze({width:250,height:122});
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
const portId = (nodeId,side,id) => `${nodeId}:${side}:${id}`;
const dimension = (value,fallback) => Number.isFinite(value) && value >= 40 && value <= 4000 ? value : fallback;

/** Build a bounded, configuration-free ELK graph. No runtime dependency here.
 * Node dimensions come from the live canvas; persisted documents use defaults.
 */
export function buildFlowLayoutGraph(nodes,edges) {
  if (!Array.isArray(nodes) || !Array.isArray(edges) ||
    nodes.length > FLOW_LIMITS.nodes || edges.length > FLOW_LIMITS.edges) {
    throw new Error('A organização aceita até 400 blocos e 800 conexões.');
  }
  const byId = new Map();
  const children = nodes.map(node => {
    if (!validId(node?.id) || byId.has(node.id)) throw new Error('Corrija os identificadores dos blocos antes de organizar.');
    const kind = node.data?.kind || node.type;
    const definition = getNodeDefinition(kind);
    if (!definition) throw new Error(`Bloco não registrado: ${node.id}.`);
    byId.set(node.id,{node,definition});
    const width = dimension(node.measured?.width ?? node.width,FLOW_LAYOUT_DIMENSIONS.width);
    const height = dimension(node.measured?.height ?? node.height,FLOW_LAYOUT_DIMENSIONS.height);
    const ports = [
      ...definition.inputs.map((port,index) => ({id:portId(node.id,'in',port.id),width:1,height:1,
        x:0,y:height*(index+1)/(definition.inputs.length+1),layoutOptions:{'elk.port.side':'WEST'}})),
      ...definition.outputs.map((port,index) => ({id:portId(node.id,'out',port.id),width:1,height:1,
        x:width,y:height*(index+1)/(definition.outputs.length+1),layoutOptions:{'elk.port.side':'EAST'}}))
    ];
    return {id:node.id,width,height,ports,layoutOptions:{'elk.portConstraints':'FIXED_POS'}};
  });
  const edgeIds = new Set(),targets = new Set();
  const next = new Map(nodes.map(node => [node.id,[]])),degree = new Map(nodes.map(node => [node.id,0]));
  const wires = edges.map((edge,index) => {
    if (typeof edge?.id !== 'string' || edgeIds.has(edge.id)) throw new Error('Corrija os identificadores das conexões antes de organizar.');
    edgeIds.add(edge.id);
    const source = byId.get(edge.source),target = byId.get(edge.target);
    if (!source || !target) throw new Error('Corrija as conexões para blocos ausentes antes de organizar.');
    const output = source.definition.outputs.find(port => port.id === edge.sourceHandle);
    const input = target.definition.inputs.find(port => port.id === edge.targetHandle);
    if (!output || !input || output.type !== input.type) throw new Error('Corrija as portas incompatíveis antes de organizar.');
    const destination = portId(edge.target,'in',edge.targetHandle);
    if (targets.has(destination)) throw new Error('Uma entrada está conectada mais de uma vez. Corrija o fluxo antes de organizar.');
    targets.add(destination);
    next.get(edge.source).push(edge.target);degree.set(edge.target,degree.get(edge.target)+1);
    // Edge IDs in existing v1 documents are arbitrary strings. Give ELK a
    // separate namespace so they cannot collide with a node or port ID.
    return {id:`omniforge:edge:${index}`,sources:[portId(edge.source,'out',edge.sourceHandle)],targets:[destination]};
  });
  const queue = nodes.filter(node => degree.get(node.id) === 0).map(node => node.id);
  let visited = 0;
  while (queue.length) {
    const id = queue.shift();visited++;
    for (const target of next.get(id)) {
      degree.set(target,degree.get(target)-1);
      if (!degree.get(target)) queue.push(target);
    }
  }
  if (visited !== nodes.length) throw new Error('Ciclo detectado: remova o retorno antes de organizar.');
  return {
    id:'omniforge:layout',
    layoutOptions:{
      'elk.algorithm':'layered','elk.direction':'RIGHT','elk.edgeRouting':'ORTHOGONAL',
      'elk.spacing.nodeNode':'64','elk.layered.spacing.nodeNodeBetweenLayers':'104',
      'elk.padding':'[top=40,left=40,bottom=40,right=40]',
      'elk.separateConnectedComponents':'true','elk.randomSeed':'1'
    },children,edges:wires
  };
}

/** Treat results as an untrusted boundary: reject partial or non-finite layouts. */
export function readFlowLayoutPositions(layout,expectedIds) {
  if (!Array.isArray(expectedIds) || expectedIds.length > FLOW_LIMITS.nodes ||
    new Set(expectedIds).size !== expectedIds.length || !Array.isArray(layout?.children) ||
    layout.children.length !== expectedIds.length) throw new Error('A organização retornou um conjunto incompleto de blocos.');
  const expected = new Set(expectedIds),seen = new Set();
  return layout.children.map(node => {
    if (!expected.has(node?.id) || seen.has(node.id) || !Number.isFinite(node.x) || !Number.isFinite(node.y) ||
      Math.abs(node.x) > FLOW_LIMITS.coordinate || Math.abs(node.y) > FLOW_LIMITS.coordinate) {
      throw new Error('A organização retornou uma posição inválida.');
    }
    seen.add(node.id);
    return {id:node.id,x:Math.round(node.x*100)/100,y:Math.round(node.y*100)/100};
  });
}
