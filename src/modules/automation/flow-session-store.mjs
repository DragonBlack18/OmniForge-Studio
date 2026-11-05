/** Pure session model; no React Flow runtime or privileged API. */
export function toUiNodes(flow){
  return flow.nodes.map(n=>({id:n.id,type:'block',position:{...n.position},data:{kind:n.type,config:structuredClone(n.config)}}));
}
export function toFlowDocument(nodes,edges,name='Fluxo principal'){
  return {schemaVersion:1,name,nodes:nodes.map(n=>({id:n.id,type:n.data.kind,position:{...n.position},config:n.data.config})),
    edges:edges.map(e=>({id:e.id,source:e.source,target:e.target,sourceHandle:e.sourceHandle,targetHandle:e.targetHandle}))};
}
export const hasPersistentNodeChange=changes=>Array.isArray(changes)&&changes.some(c=>c&&c.type!=='select'&&c.type!=='dimensions');
export const hasPersistentEdgeChange=changes=>Array.isArray(changes)&&changes.some(c=>c&&c.type!=='select');

export function createFlowSession(initialFlow,{clock=Date.now,maxEntries=60,maxBytes=12_000_000}={}){
  let nodes=toUiNodes(initialFlow),edges=structuredClone(initialFlow.edges),name=initialFlow.name||'Fluxo principal';
  let selectedId=nodes[0]?.id||null,flowRevision=null,flowDirty=false,documentEpoch=0,editEpoch=0;
  let cachedGraph=null,cachedEpoch=-1,cachedDocument=-1;
  let past=[],future=[],savedKey=JSON.stringify(toFlowDocument(nodes,edges,name)),group=null,snapshot;
  const listeners=new Set();
  const doc=()=>toFlowDocument(nodes,edges,name);
  const emit=()=>{
    if(cachedEpoch!==editEpoch||cachedDocument!==documentEpoch){cachedGraph=doc();cachedEpoch=editEpoch;cachedDocument=documentEpoch;}
    snapshot={nodes,edges,graph:cachedGraph,selectedId,flowRevision,flowDirty,canUndo:past.length>0,canRedo:future.length>0,editEpoch};
    for(const listener of listeners)listener();
  };
  function trim(){
    while(past.length>maxEntries || past.reduce((sum,x)=>sum+x.bytes,0)>maxBytes)past.shift();
  }
  function commit(nextNodes,nextEdges,{presentation=false,groupKey=null,newName=name}={}){
    // Removing a node and its incident wires is one reversible operation.
    const ids=new Set(nextNodes.map(n=>n.id));
    nextEdges=nextEdges.filter(e=>ids.has(e.source)&&ids.has(e.target));
    if(presentation){nodes=nextNodes;edges=nextEdges;emit();return;}
    const previous=doc(),updated=toFlowDocument(nextNodes,nextEdges,newName);
    const encoded=JSON.stringify(updated);
    if(updated.nodes.length>400 || updated.edges.length>800 || new TextEncoder().encode(encoded).length>2_000_000)
      throw Error('O fluxo excede os limites de edição (400 blocos, 800 conexões, 2 MB).');
    if(encoded===JSON.stringify(previous)){nodes=nextNodes;edges=nextEdges;emit();return;}
    const now=clock();
    if(!groupKey || group?.key!==groupKey || now-group.at>650){
      const data=JSON.stringify(previous);
      past.push({flow:JSON.parse(data),selectedId,bytes:new TextEncoder().encode(data).length});trim();
    }
    group=groupKey?{key:groupKey,at:now}:null;future=[];
    nodes=nextNodes;edges=nextEdges;name=newName;
    if(!ids.has(selectedId))selectedId=null;
    editEpoch++;flowDirty=encoded!==savedKey;emit();
  }
  function travel(from,to){
    const entry=from.pop();if(!entry)return false;
    const data=JSON.stringify(doc());to.push({flow:JSON.parse(data),selectedId,bytes:new TextEncoder().encode(data).length});
    nodes=toUiNodes(entry.flow);edges=structuredClone(entry.flow.edges);name=entry.flow.name;
    selectedId=entry.selectedId;editEpoch++;group=null;flowDirty=JSON.stringify(doc())!==savedKey;trim();emit();return true;
  }
  emit();
  return {
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    getSnapshot:()=>snapshot,
    setSelectedId(id){selectedId=nodes.some(n=>n.id===id)?id:null;nodes=nodes.map(n=>({...n,selected:n.id===selectedId}));emit();},
    setNodes(value,options){commit(typeof value==='function'?value(nodes):value,edges,options);},
    setEdges(value,options){commit(nodes,typeof value==='function'?value(edges):value,options);},
    handleNodesChange(changes,apply){
      if(typeof apply!=='function')throw TypeError('Atualizador de nós inválido.');
      const positions=changes.filter(c=>c.type==='position');
      const dragging=positions.some(c=>c.dragging===true);
      const key=positions.length?'drag:'+positions.map(c=>c.id).sort().join(','):null;
      commit(apply(changes,nodes),edges,{presentation:!hasPersistentNodeChange(changes),groupKey:key});
      if(positions.length&&!dragging)group=null;
    },
    handleEdgesChange(changes,apply){
      if(typeof apply!=='function')throw TypeError('Atualizador de conexões inválido.');
      commit(nodes,apply(changes,edges),{presentation:!hasPersistentEdgeChange(changes)});
    },
    undo:()=>travel(past,future),redo:()=>travel(future,past),
    deleteSelected(){if(selectedId)commit(nodes.filter(n=>n.id!==selectedId),edges);},
    deleteElements({nodes:removedNodes=[],edges:removedEdges=[]}={}){
      const nodeIds=new Set(removedNodes.map(n=>n.id)),edgeIds=new Set(removedEdges.map(e=>e.id));
      commit(nodes.filter(n=>!nodeIds.has(n.id)),edges.filter(e=>!edgeIds.has(e.id)));
    },
    duplicateSelected(id){
      const found=nodes.find(n=>n.id===selectedId);if(!found)return;
      if(nodes.some(n=>n.id===id))throw Error('Identificador já utilizado.');
      const copy=structuredClone(found);copy.id=id;copy.position={x:found.position.x+60,y:found.position.y+160};copy.selected=false;
      commit([...nodes,copy],edges);selectedId=id;emit();
    },
    rename(value){const clean=String(value).trim();if(!clean||clean.length>120)throw Error('Use um nome de 1 a 120 caracteres.');commit(nodes,edges,{newName:clean,groupKey:'name'});},
    applyTemplate(flow){commit(toUiNodes(flow),structuredClone(flow.edges),{newName:flow.name||name});selectedId=nodes[0]?.id||null;emit();},
    replaceDocument(flow,revision,dirty=false){
      nodes=toUiNodes(flow);edges=structuredClone(flow.edges);name=flow.name||'Fluxo principal';selectedId=nodes[0]?.id||null;
      flowRevision=revision;flowDirty=dirty;documentEpoch++;editEpoch=dirty?1:0;past=[];future=[];group=null;
      savedKey=dirty?null:JSON.stringify(doc());emit();
    },
    captureSaveToken(){group=null;return {document:documentEpoch,edit:editEpoch,key:JSON.stringify(doc())};},
    markSaved(token,revision){
      if(!token||!Number.isInteger(token.document)||!Number.isInteger(token.edit)||typeof token.key!=='string'||token.document!==documentEpoch)return false;
      flowRevision=revision;savedKey=token.key;flowDirty=JSON.stringify(doc())!==savedKey;emit();return !flowDirty;
    }
  };
}
