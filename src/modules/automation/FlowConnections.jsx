import React,{useMemo} from 'react';
import {getFlowNodeConnections} from '../../../core/modules/automation/connections.mjs';
import {NavGlyph} from '../../shared/NavGlyph.jsx';

/** Inspect actual wires, including open required ports; never infer runtime data. */
export default function FlowConnections({graph,nodeId,busy,onSelect,onDisconnect}) {
  const ports=useMemo(()=>getFlowNodeConnections(graph,nodeId),[graph,nodeId]);
  if(!ports)return <div className="flow-panel-empty">Selecione um bloco para consultar suas entradas, saídas e conexões.</div>;
  return <div className="flow-connections" data-testid="flow-connections">
    <div className="flow-connection-heading"><strong>Conexões do bloco</strong><code>{nodeId}</code></div>
    {[['inputs','Entradas'],['outputs','Saídas']].map(([side,label])=><section key={side} aria-label={label+' do bloco'}>
      <h3>{label}</h3>
      {!ports[side].length&&<p className="flow-port-empty">Este bloco não possui {label.toLowerCase()}.</p>}
      {ports[side].map(port=><div key={port.id} className="flow-connection-port" data-testid={`flow-port-${side}-${port.id}`}>
        <div className="flow-connection-port-title"><code>{port.id}</code><span>{port.type}</span>
          {side==='inputs'&&<small>{port.required?'obrigatória':'opcional'}</small>}</div>
        {!port.connections.length&&<p className={'flow-port-empty '+(port.required?'is-required':'')}>
          {port.required?'Entrada ainda não conectada.':'Sem conexão.'}</p>}
        {port.connections.map(wire=><div className="flow-connection-wire" key={wire.edgeId} data-testid={'flow-wire-'+wire.edgeId}>
          <button type="button" className="flow-connection-target" disabled={!wire.available}
            title={`Ir para ${wire.nodeId}`} aria-label={`Ir para bloco ${wire.nodeId}`}
            onClick={()=>onSelect(wire.nodeId)}>
            <NavGlyph name={side==='inputs'?'arrow':'workflow'} size={13}/>
            <span>{wire.label}<small>{wire.nodeId} · {wire.port}</small></span>
          </button>
          <button type="button" className="flow-disconnect" title="Desconectar" aria-label={`Desconectar ${wire.edgeId}`}
            disabled={busy||typeof onDisconnect!=='function'} onClick={()=>onDisconnect(wire.edgeId)}><NavGlyph name="close" size={13}/></button>
        </div>)}
      </div>)}
    </section>)}
    <p className="flow-connection-help">Selecione a origem ou o destino para navegar. Arraste a ponta de uma conexão no desenho para ligá-la a outra porta.</p>
  </div>;
}
