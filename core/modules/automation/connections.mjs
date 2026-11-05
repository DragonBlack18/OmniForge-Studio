import { getNodeDefinition } from './catalog.mjs';

/** Browser/core shared contract. A wire is not allowed to replace an occupied input. */
export function checkFlowConnection(flow, candidate) {
  const reject = (code, message) => ({valid:false,code,message});
  if (!Array.isArray(flow?.nodes) || !Array.isArray(flow?.edges) || !candidate)
    return reject('invalid','Conexão inválida.');
  if(flow.nodes.length>400 || flow.edges.length>=800)
    return reject('limit','Limite de 400 blocos ou 800 conexões atingido.');
  const source=flow.nodes.find(n=>n?.id===candidate.source);
  const target=flow.nodes.find(n=>n?.id===candidate.target);
  if(!source || !target)return reject('missing','A conexão aponta para um bloco ausente.');
  if(source.id===target.id)return reject('cycle','Um bloco não pode conectar a si mesmo.');
  const output=getNodeDefinition(source.type)?.outputs.find(p=>p.id===candidate.sourceHandle);
  const input=getNodeDefinition(target.type)?.inputs.find(p=>p.id===candidate.targetHandle);
  if(!output || !input || output.type!==input.type)return reject('ports','Portas incompatíveis.');
  if(flow.edges.some(e=>e?.target===target.id && e.targetHandle===candidate.targetHandle))
    return reject('occupied','Esta entrada já possui conexão; remova a conexão anterior primeiro.');
  const adjacency=new Map();
  for(const edge of flow.edges){
    if(!edge)continue;
    if(!adjacency.has(edge.source))adjacency.set(edge.source,[]);
    adjacency.get(edge.source).push(edge.target);
  }
  const pending=[target.id],seen=new Set();
  while(pending.length){
    const id=pending.pop();
    if(id===source.id)return reject('cycle','A conexão criaria um ciclo. Use ramificações sem retorno.');
    if(seen.has(id))continue;
    seen.add(id);pending.push(...(adjacency.get(id)||[]));
  }
  return {valid:true,code:'ok',message:''};
}

/** Stable left-to-right layout. Does not change configuration, edges or execution order. */
export function arrangeFlowNodes(nodes, edges) {
  if(nodes.length>400 || edges.length>800)throw Error('Fluxo excede o limite de tamanho.');
  const degree=new Map(nodes.map(n=>[n.id,0])), next=new Map(nodes.map(n=>[n.id,[]]));
  const rank=new Map(nodes.map(n=>[n.id,0]));
  for(const e of edges){
    if(!degree.has(e.source)||!degree.has(e.target))throw Error('Corrija as conexões para blocos ausentes antes de organizar.');
    degree.set(e.target,degree.get(e.target)+1);next.get(e.source).push(e.target);
  }
  const queue=nodes.filter(n=>degree.get(n.id)===0).map(n=>n.id);
  let visited=0;
  while(queue.length){
    const id=queue.shift();visited++;
    for(const target of next.get(id)){
      rank.set(target,Math.max(rank.get(target),rank.get(id)+1));
      degree.set(target,degree.get(target)-1);if(degree.get(target)===0)queue.push(target);
    }
  }
  if(visited!==nodes.length)throw Error('Ciclo detectado: remova o retorno antes de organizar.');
  const rows=new Map();
  return nodes.map(node=>{
    const column=rank.get(node.id),row=rows.get(column)||0;rows.set(column,row+1);
    return {...node,position:{x:70+column*340,y:70+row*200}};
  });
}
