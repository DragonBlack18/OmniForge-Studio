/** Document owner: authoring history, recovery eligibility and native-save tokens.
 * No React Flow runtime, IPC, timers or filesystem in this state machine.
 */
import { FLOW_LIMITS, assertFlowName } from '../../../core/modules/automation/flow-limits.mjs';
import { reconnectFlowEdge } from '../../../core/modules/automation/connections.mjs';
import { readFlowLayoutPositions } from '../../../core/modules/automation/layout.mjs';
const clone = value => structuredClone(value);
const size = text => new TextEncoder().encode(text).length;
export function toUiNodes(flow) {
  return flow.nodes.map(n => ({id:n.id,type:'block',position:{...n.position},data:{kind:n.type,config:clone(n.config)}}));
}
export function toFlowDocument(nodes,edges,name='Fluxo principal') {
  return {schemaVersion:1,name,nodes:nodes.map(n=>({id:n.id,type:n.data.kind,position:{...n.position},config:clone(n.data.config)})),
    edges:edges.map(e=>({id:e.id,source:e.source,target:e.target,sourceHandle:e.sourceHandle,targetHandle:e.targetHandle}))};
}
export const hasPersistentNodeChange = changes => Array.isArray(changes)&&changes.some(c=>c&&c.type!=='select'&&c.type!=='dimensions');
export const hasPersistentEdgeChange = changes => Array.isArray(changes)&&changes.some(c=>c&&c.type!=='select');

export function createFlowSession(initialFlow,{clock=Date.now,maxEntries=60,maxBytes=12_000_000}={}) {
  if(!Number.isInteger(maxEntries)||maxEntries<0||maxEntries>1000||!Number.isFinite(maxBytes)||maxBytes<0)
    throw new Error('Limites de histórico inválidos.');
  let nodes=toUiNodes(initialFlow),edges=clone(initialFlow.edges),name=initialFlow.name||'Fluxo principal';
  let selectedId=nodes[0]?.id||null,flowRevision=null,flowDirty=false,documentEpoch=0,editEpoch=0;
  let recoveryEligible=false,writeLocked=false,saveSequence=0,lastSavedSequence=0;
  let cachedGraph=null,cachedEpoch=-1,cachedDocument=-1;
  let past=[],future=[],savedKey=JSON.stringify(toFlowDocument(nodes,edges,name)),group=null,snapshot;
  const listeners=new Set();
  const doc=()=>toFlowDocument(nodes,edges,name);
  // The inspector id and React Flow's selected flags must agree after commands
  // that replace nodes. Otherwise Delete can target the original after a copy.
  function selectNode(id){
    selectedId=nodes.some(n=>n.id===id)?id:null;
    nodes=nodes.map(n=>{const selected=n.id===selectedId;return n.selected===selected?n:{...n,selected};});
  }
  const assertWritable=()=>{if(writeLocked)throw new Error('Edição bloqueada durante operação ou recuperação pendente.');};
  const emit=()=>{
    if(cachedEpoch!==editEpoch||cachedDocument!==documentEpoch){cachedGraph=doc();cachedEpoch=editEpoch;cachedDocument=documentEpoch;}
    snapshot={nodes,edges,graph:cachedGraph,selectedId,flowRevision,flowDirty,recoveryEligible,
      canUndo:past.length>0,canRedo:future.length>0,editEpoch,documentEpoch,
      historyEntries:past.length+future.length,historyBytes:[...past,...future].reduce((s,x)=>s+x.bytes,0)};
    for(const listener of listeners)listener();
  };
  function trim(){
    // One budget for BOTH stacks; undo must not silently double memory use.
    while(past.length+future.length>maxEntries||[...past,...future].reduce((s,x)=>s+x.bytes,0)>maxBytes){
      if(past.length)past.shift();else if(future.length)future.shift();else break;
    }
  }
  const historyEntry=()=>{const data=JSON.stringify(doc());return {flow:JSON.parse(data),selectedId,bytes:size(data)};};
  function commit(nextNodes,nextEdges,{presentation=false,groupKey=null,newName=name}={},restoring=false){
    if(!presentation&&!restoring)assertWritable();
    const ids=new Set(nextNodes.map(n=>n.id));
    nextEdges=nextEdges.filter(e=>ids.has(e.source)&&ids.has(e.target));
    if(presentation){nodes=nextNodes;edges=nextEdges;emit();return;}
    assertFlowName(newName);
    const previous=doc(),updated=toFlowDocument(nextNodes,nextEdges,newName),encoded=JSON.stringify(updated);
    if(updated.nodes.length>FLOW_LIMITS.nodes||updated.edges.length>FLOW_LIMITS.edges||size(encoded)>FLOW_LIMITS.bytes)
      throw new Error('O fluxo excede os limites de edição (400 blocos, 800 conexões, 2 MB).');
    if(encoded===JSON.stringify(previous)){nodes=nextNodes;edges=nextEdges;emit();return;}
    const now=clock();
    if(!groupKey||group?.key!==groupKey||now-group.at>650)past.push(historyEntry());
    group=groupKey?{key:groupKey,at:now}:null;future=[];trim();
    nodes=nextNodes;edges=nextEdges;name=newName;
    if(!ids.has(selectedId))selectNode(null);
    editEpoch++;recoveryEligible=true;flowDirty=encoded!==savedKey;emit();
  }
  function travel(from,to){
    assertWritable();const entry=from.pop();if(!entry)return false;
    to.push(historyEntry());nodes=toUiNodes(entry.flow);edges=clone(entry.flow.edges);name=entry.flow.name;
    selectNode(entry.selectedId);editEpoch++;recoveryEligible=true;group=null;
    flowDirty=JSON.stringify(doc())!==savedKey;trim();emit();return true;
  }
  selectNode(selectedId);emit();
  return {
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},getSnapshot:()=>snapshot,
    setInteractionLocked(value){writeLocked=Boolean(value);},
    setSelectedId(id){selectNode(id);emit();},
    setNodes(value,options){if(!options?.presentation)assertWritable();commit(typeof value==='function'?value(nodes):value,edges,options);},
    setEdges(value,options){if(!options?.presentation)assertWritable();commit(nodes,typeof value==='function'?value(edges):value,options);},
    handleNodesChange(changes,apply){
      if(typeof apply!=='function')throw TypeError('Atualizador de nós inválido.');
      const persistent=hasPersistentNodeChange(changes);if(persistent)assertWritable();
      const positions=changes.filter(c=>c?.type==='position'),dragging=positions.some(c=>c.dragging===true);
      const key=positions.length?'drag:'+positions.map(c=>c.id).sort().join(','):null;
      commit(apply(changes,nodes),edges,{presentation:!persistent,groupKey:key});
      if(positions.length&&!dragging)group=null;
    },
    handleEdgesChange(changes,apply){
      if(typeof apply!=='function')throw TypeError('Atualizador de conexões inválido.');
      const persistent=hasPersistentEdgeChange(changes);if(persistent)assertWritable();
      commit(nodes,apply(changes,edges),{presentation:!persistent});
    },
    undo:()=>travel(past,future),redo:()=>travel(future,past),
    deleteSelected(){assertWritable();if(selectedId)commit(nodes.filter(n=>n.id!==selectedId),edges);},
    deleteElements({nodes:removedNodes=[],edges:removedEdges=[]}={}){
      assertWritable();const nodeIds=new Set(removedNodes.map(n=>n.id)),edgeIds=new Set(removedEdges.map(e=>e.id));
      commit(nodes.filter(n=>!nodeIds.has(n.id)),edges.filter(e=>!edgeIds.has(e.id)));
    },
    disconnectEdge(id){
      assertWritable();
      if(!edges.some(edge=>edge.id===id))return false;
      commit(nodes,edges.filter(edge=>edge.id!==id));return true;
    },
    reconnectEdge(id,connection){
      assertWritable();commit(nodes,reconnectFlowEdge(doc(),id,connection));
    },
    captureLayoutToken(){return {document:documentEpoch,edit:editEpoch};},
    applyLayout(positions,token){
      // Work in a worker can finish after edits, undo, recovery or project load.
      // Never overwrite the newer document or its live selection in that case.
      if(!token||token.document!==documentEpoch||token.edit!==editEpoch)return false;
      assertWritable();
      const checked=readFlowLayoutPositions({children:positions},nodes.map(node=>node.id));
      const byId=new Map(checked.map(position=>[position.id,position]));
      commit(nodes.map(node=>{const p=byId.get(node.id);return {...node,position:{x:p.x,y:p.y}};}),edges);
      return true;
    },
    duplicateSelected(id){
      assertWritable();const found=nodes.find(n=>n.id===selectedId);if(!found)return;
      if(typeof id!=='string'||!id||nodes.some(n=>n.id===id))throw Error('Identificador inválido ou já utilizado.');
      const copy=clone(found);copy.id=id;copy.position={x:found.position.x+60,y:found.position.y+160};copy.selected=false;
      commit([...nodes,copy],edges);selectNode(id);emit();
    },
    rename(value){assertWritable();const clean=String(value).trim();assertFlowName(clean);commit(nodes,edges,{newName:clean,groupKey:'name'});},
    applyTemplate(flow){assertWritable();commit(toUiNodes(flow),clone(flow.edges),{newName:flow.name||name});selectNode(nodes[0]?.id||null);emit();},
    replaceDocument(flow,revision,dirty=false,protect=dirty){
      // Native project load, not a user edit: no history leaks across workspaces.
      const nextName=flow.name||'Fluxo principal';assertFlowName(nextName);
      nodes=toUiNodes(flow);edges=clone(flow.edges);name=nextName;selectNode(nodes[0]?.id||null);
      flowRevision=revision;flowDirty=dirty;recoveryEligible=Boolean(protect);documentEpoch++;editEpoch=dirty?1:0;
      past=[];future=[];group=null;lastSavedSequence=0;savedKey=dirty?null:JSON.stringify(doc());emit();
    },
    restoreRecovered(flow){
      // Only invoked after coordinator rechecks both disk and checkpoint CAS.
      // Preserve the loaded source as the undo baseline and retain its revision.
      commit(toUiNodes(flow),clone(flow.edges),{newName:flow.name||name},true);
      selectNode(nodes[0]?.id||null);recoveryEligible=true;emit();
    },
    captureSaveToken(){group=null;return {document:documentEpoch,edit:editEpoch,sequence:++saveSequence,key:JSON.stringify(doc())};},
    isCurrentDocument(token){return Boolean(token&&token.document===documentEpoch);},
    markSaved(token,revision){
      if(!token||!Number.isInteger(token.document)||!Number.isInteger(token.edit)||typeof token.key!=='string'||
        !Number.isInteger(token.sequence)||token.sequence<=lastSavedSequence||token.document!==documentEpoch)return false;
      lastSavedSequence=token.sequence;flowRevision=revision;savedKey=token.key;
      flowDirty=JSON.stringify(doc())!==savedKey;emit();return !flowDirty;
    }
  };
}
