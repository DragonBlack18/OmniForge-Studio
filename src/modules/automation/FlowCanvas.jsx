import React from 'react';
import { ReactFlow, Background, Controls, MiniMap, Handle, Position, applyNodeChanges, applyEdgeChanges, addEdge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { NODE_CATALOG } from '../../../core/modules/automation/catalog.mjs';
import {checkFlowConnection,checkFlowReconnection} from '../../../core/modules/automation/connections.mjs';
import { NavGlyph } from '../../shared/NavGlyph.jsx';

const LABELS = { 'trigger.manual': 'GATILHO', 'logic.pick': 'LÓGICA', 'io.writeJson': 'ARQUIVOS', 'http.localJson': 'API LOCAL', 'project.callLocalApi': 'PROJETO' };
const CATEGORY_NAV_ICONS = { Gatilhos:'workflow', Lógica:'workflow', Dados:'code', Texto:'code', Matemática:'code', Codificação:'code', Datas:'history', Arquivos:'folder', Integrações:'plug', Projetos:'folder', Engenharia:'cad' };
const BlockNode = React.memo(function BlockNode({ data, selected }) {
  const meta = NODE_CATALOG[data.kind] || {category:'Desconhecido',label:'Bloco indisponível',description:'Tipo não registrado',inputs:[],outputs:[]};
  const icon = CATEGORY_NAV_ICONS[meta.category] || 'workflow';
  const category = LABELS[data.kind] || meta.category.toUpperCase();
  const positionFor = (index, length) => `${Math.round((index+1)*100/(length+1))}%`;
  return (
    <div className={`graph-node ${selected ? 'graph-node--selected' : ''} ${data.issue?'graph-node--issue':''}`}>
      {meta.inputs.map((port, index) => (
        <React.Fragment key={port.id}>
          <Handle type="target" position={Position.Left} id={port.id} className="node-handle" style={{top:positionFor(index,meta.inputs.length)}} />
          {meta.inputs.length>1 && <span className="node-port node-port--left" style={{top:positionFor(index,meta.inputs.length)}}>{port.id}</span>}
        </React.Fragment>
      ))}
      <div className="graph-node__overline"><span><NavGlyph name={icon} size={15}/></span>{category}</div>
      {(data.issue||data.execution)&&<span title={data.issue||data.execution} className={'graph-node__state graph-node__state--'+(data.issue?'issue':data.execution)}>{data.issue?'!':data.execution}</span>}
      <div className="graph-node__title">{meta.label}</div>
      <div className="graph-node__details">{data.kind === 'trigger.manual' ? 'Entrada JSON' : meta.description}</div>
      {meta.outputs.map((port,index)=>(
        <React.Fragment key={port.id}>
          <Handle type="source" position={Position.Right} id={port.id} className="node-handle" style={{top:positionFor(index,meta.outputs.length)}} />
          {meta.outputs.length>1 && <span className="node-port node-port--right" style={{top:positionFor(index,meta.outputs.length)}}>{port.id==='yes'?'SIM':port.id==='no'?'NÃO':port.id}</span>}
        </React.Fragment>
      ))}
    </div>
  );
});

const NODE_TYPES = { block: BlockNode };
const MIN_ZOOM = 0.1;
const FIT_VIEW_OPTIONS = Object.freeze({ padding: 0.24, minZoom: MIN_ZOOM });
const PRO_OPTIONS = Object.freeze({ hideAttribution: false });

const EMPTY=[];
export default function FlowCanvas({ nodes, edges, onNodesChange, onEdgesChange, onConnect, onNodeClick, onPaneClick,
  graph,locked=false,diagnostics=EMPTY,runSteps=EMPTY,focusRequest,onDeleteElements,onReconnect }) {
  const [instance,setInstance]=React.useState(null);
  const reconnectingEdge=React.useRef(null);
  React.useEffect(()=>{
    if(!instance||!focusRequest)return;
    instance.fitView({nodes:focusRequest.id?[{id:focusRequest.id}]:undefined,padding:.25,minZoom:MIN_ZOOM,maxZoom:1.1,duration:180});
  },[instance,focusRequest]);
  const displayNodes=React.useMemo(()=>{
    const issues=new Map(diagnostics.filter(d=>d.nodeId).map(d=>[d.nodeId,d.message]));
    const execution=new Map(runSteps.map(s=>[s.nodeId || s.id,s.status]));
    return nodes.map(n=>({...n,data:{...n.data,issue:issues.get(n.id),execution:execution.get(n.id)}}));
  },[nodes,diagnostics,runSteps]);
  const valid=React.useCallback(connection=>(reconnectingEdge.current
    ?checkFlowReconnection(graph,reconnectingEdge.current,connection)
    :checkFlowConnection(graph,connection)).valid,[graph]);
  // The apply/add helpers and React Flow remain inside this dynamic module.
  // The parent owns the document; leaving canvas never drops unsaved edits.
  const handleNodes = React.useCallback(changes =>
    {const allowed=locked?changes.filter(c=>c.type==='select'||c.type==='dimensions'):changes;if(allowed.length)onNodesChange(allowed,applyNodeChanges);}, [onNodesChange,locked]);
  const handleEdges = React.useCallback(changes =>
    {const allowed=locked?changes.filter(c=>c.type==='select'):changes;if(allowed.length)onEdgesChange(allowed,applyEdgeChanges);}, [onEdgesChange,locked]);
  const handleConnect = React.useCallback(connection =>
    {if(!locked)onConnect(connection, addEdge);}, [onConnect,locked]);
  const handleReconnect=React.useCallback((edge,connection)=>{
    if(!locked&&checkFlowReconnection(graph,edge.id,connection).valid)onReconnect?.(edge,connection);
  },[locked,graph,onReconnect]);
  const beforeDelete=React.useCallback(async selection=>{
    if(!locked)onDeleteElements(selection);
    return false; // Session already committed nodes and wires as one operation.
  },[locked,onDeleteElements]);
  return <div className="canvas-wrap">
    <ReactFlow nodes={displayNodes} edges={edges} nodeTypes={NODE_TYPES} onInit={setInstance}
      onBeforeDelete={beforeDelete} isValidConnection={valid} nodesDraggable={!locked} deleteKeyCode={locked?null:['Backspace','Delete']}
      onNodesChange={handleNodes} onEdgesChange={handleEdges}
      onConnect={handleConnect} onNodeClick={onNodeClick} onPaneClick={onPaneClick}
      onReconnectStart={(_event,edge)=>{reconnectingEdge.current=edge.id;}}
      onReconnect={handleReconnect} onReconnectEnd={()=>{reconnectingEdge.current=null;}}
      edgesReconnectable={!locked&&typeof onReconnect==='function'} reconnectRadius={14}
      fitView minZoom={MIN_ZOOM} fitViewOptions={FIT_VIEW_OPTIONS}
      proOptions={PRO_OPTIONS}
      colorMode="dark" nodesConnectable={!locked} elementsSelectable>
      <Background color="#2b292e" gap={24} size={1}/>
      <Controls position="bottom-left" showInteractive={false}/>
      <MiniMap pannable zoomable nodeColor="#8f4753" maskColor="rgba(15,13,17,0.72)" position="bottom-right"/>
    </ReactFlow>
    <div className="canvas-chip">GRAFO / V1 · VALIDAÇÃO ANTES DA EXECUÇÃO</div>
  </div>;
}
