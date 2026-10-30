import React from 'react';
import { ReactFlow, Background, Controls, MiniMap, Handle, Position } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { NODE_CATALOG } from '../../../core/modules/automation/catalog.mjs';
import { NavGlyph } from '../../workbench/NavigationSidebar.jsx';

const LABELS = { 'trigger.manual': 'GATILHO', 'logic.pick': 'LÓGICA', 'io.writeJson': 'ARQUIVOS', 'http.localJson': 'API LOCAL', 'project.callLocalApi': 'PROJETO' };
const CATEGORY_NAV_ICONS = { Gatilhos:'workflow', Lógica:'workflow', Dados:'code', Texto:'code', Matemática:'code', Codificação:'code', Datas:'history', Arquivos:'folder', Integrações:'plug', Projetos:'folder', Engenharia:'cad' };
function BlockNode({ data, selected }) {
  const meta = NODE_CATALOG[data.kind];
  const icon = CATEGORY_NAV_ICONS[meta.category] || 'workflow';
  const category = LABELS[data.kind] || meta.category.toUpperCase();
  const positionFor = (index, length) => `${Math.round((index+1)*100/(length+1))}%`;
  return (
    <div className={`graph-node ${selected ? 'graph-node--selected' : ''}`}>
      {meta.inputs.map((port, index) => (
        <React.Fragment key={port.id}>
          <Handle type="target" position={Position.Left} id={port.id} className="node-handle" style={{top:positionFor(index,meta.inputs.length)}} />
          {meta.inputs.length>1 && <span className="node-port node-port--left" style={{top:positionFor(index,meta.inputs.length)}}>{port.id}</span>}
        </React.Fragment>
      ))}
      <div className="graph-node__overline"><span><NavGlyph name={icon} size={15}/></span>{category}</div>
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
}

const NODE_TYPES = { block: BlockNode };

export default function FlowCanvas({ nodes, edges, onNodesChange, onEdgesChange, onConnect, onNodeClick, onPaneClick }) {
  return <div className="canvas-wrap">
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={NODE_TYPES}
      onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
      onConnect={onConnect} onNodeClick={onNodeClick} onPaneClick={onPaneClick}
      fitView fitViewOptions={{ padding: 0.24 }}
      proOptions={{ hideAttribution: false }}
      colorMode="dark" nodesConnectable elementsSelectable>
      <Background color="#253347" gap={24} size={1}/>
      <Controls position="bottom-left" showInteractive={false}/>
      <MiniMap pannable zoomable nodeColor="#327db1" maskColor="rgba(7,14,24,0.72)" position="bottom-right"/>
    </ReactFlow>
    <div className="canvas-chip">GRAFO / V1 · VALIDAÇÃO ANTES DA EXECUÇÃO</div>
  </div>;
}
