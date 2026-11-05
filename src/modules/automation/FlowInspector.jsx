import React,{useEffect,useState} from 'react';
import {NODE_CATALOG} from '../../../core/modules/automation/catalog.mjs';
import {NavGlyph} from '../../shared/NavGlyph.jsx';
import './FlowAuthoring.css';

export default function FlowInspector({selected,graph,projects,extensions,validation,lastRun,running,liveSteps,
  busy,tabRequest,onConfig,onSelect,onRename}){
  const [tab,setTab]=useState('properties');
  const [query,setQuery]=useState('');
  const [name,setName]=useState(graph.name);
  useEffect(()=>setName(graph.name),[graph.name]);
  useEffect(()=>{if(tabRequest)setTab(tabRequest.tab);},[tabRequest]);
  const meta=NODE_CATALOG[selected?.data.kind];
  const normalize=text=>String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const rows=graph.nodes.filter(n=>normalize(n.id+' '+NODE_CATALOG[n.type]?.label+' '+n.type).includes(normalize(query)));
  const choose=id=>{onSelect(id);setTab('properties');};
  return <aside className="inspector flow-inspector" aria-label="Inspetor de automações">
    <div role="tablist" aria-label="Painel do fluxo" className="flow-inspector-tabs">
      {[['properties','Propriedades'],['outline','Estrutura'],['diagnostics','Diagnóstico']].map(([id,label])=>
        <button type="button" role="tab" key={id} aria-selected={tab===id} onClick={()=>setTab(id)}>{label}</button>)}
    </div>
    {tab==='properties' && <div role="tabpanel" aria-label="Propriedades do fluxo" className="flow-inspector-scroll">
      {meta ? <section className="inspector-section">
        <h3>{meta.label}</h3><code className="flow-object-id">{selected.id}</code><p>{meta.description}</p>
        <fieldset disabled={busy} className="flow-fields">
        {meta.fields.map(field=><label key={field.key} className="setting-field"><span>{field.label}</span>
          {field.kind==='extension'?<select aria-label="Extensão do nó" value={selected.data.config.extensionId||''} onChange={e=>onConfig('extensionId',e.target.value)}>
            <option value="">Selecione uma extensão autorizada</option>{extensions.filter(x=>x.enabled&&x.granted.includes('workflow.transform')).map(x=><option key={x.id} value={x.id}>{x.name} ({x.id})</option>)}</select>
          :field.kind==='extensionAction'?<select aria-label="Ação da extensão" value={selected.data.config.actionId||''} onChange={e=>onConfig('actionId',e.target.value)}>
            <option value="">Selecione uma ação</option>{(extensions.find(x=>x.id===selected.data.config.extensionId)?.actions||[]).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>
          :field.kind==='project'?<select value={selected.data.config.projectId||''} onChange={e=>onConfig('projectId',e.target.value)}>
            <option value="">Selecione um projeto</option>{projects.filter(x=>x.available).map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select>
          :field.kind==='capability'?<select value={selected.data.config.capabilityId||''} onChange={e=>onConfig('capabilityId',e.target.value)}>
            <option value="">Selecione uma capacidade</option>{(projects.find(x=>x.id===selected.data.config.projectId)?.capabilities||[]).map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select>
          :field.kind==='select'?<select value={selected.data.config[field.key]??field.default} onChange={e=>onConfig(field.key,e.target.value)}>{field.options.map(x=><option key={x} value={x}>{x}</option>)}</select>
          :field.kind==='json'?<textarea rows={7} spellCheck={false} value={selected.data.config[field.key]??''} onChange={e=>onConfig(field.key,e.target.value)}/>
          :<input value={selected.data.config[field.key]??''} onChange={e=>onConfig(field.key,e.target.value)}/>}</label>)}
        </fieldset>
        <details className="flow-port-contract"><summary>Portas e contrato</summary>
          {meta.inputs.map(p=><div key={'i'+p.id}>Entrada <code>{p.id}</code><small>{p.type} · {p.required?'obrigatória':'opcional'}</small></div>)}
          {meta.outputs.map(p=><div key={'o'+p.id}>Saída <code>{p.id}</code><small>{p.type}</small></div>)}
        </details>
      </section> : <section className="inspector-section"><h3>Documento de automação</h3>
        <label className="setting-field"><span>Nome do fluxo</span><input aria-label="Nome do fluxo" value={name} maxLength={120} disabled={busy}
          onChange={e=>setName(e.target.value)} onBlur={()=>{if(name.trim())onRename(name);else setName(graph.name);}}
          onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/></label>
        <p>Selecione um bloco no desenho ou na aba Estrutura para editar suas propriedades.</p>
      </section>}
    </div>}
    {tab==='outline' && <div role="tabpanel" aria-label="Estrutura do fluxo" className="flow-inspector-scroll">
      <div className="flow-outline-search"><NavGlyph name="search" size={14}/><input aria-label="Localizar bloco no fluxo" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Nome, tipo ou identificador"/></div>
      <div className="flow-outline-count">{rows.length} blocos · {graph.edges.length} conexões</div>
      {rows.map(n=><button type="button" key={n.id} className={'flow-outline-row '+(selected?.id===n.id?'is-active':'')}
        data-testid={'flow-outline-'+n.id} onClick={()=>choose(n.id)}>
        <NavGlyph name={n.type==='trigger.manual'?'workflow':'code'} size={15}/><span>{NODE_CATALOG[n.type]?.label||n.type}<small>{n.id}</small></span><NavGlyph name="focus" size={13}/>
      </button>)}
      {!rows.length&&<p className="flow-panel-empty">Nenhum bloco encontrado.</p>}
    </div>}
    {tab==='diagnostics' && <div role="tabpanel" aria-label="Diagnóstico do fluxo" className="flow-inspector-scroll diagnostic-log">
      {running&&<div className="run-active" data-testid="flow-running" role="status">EXECUTANDO · {liveSteps.length} etapas concluídas</div>}
      {!running&&!validation&&!lastRun&&<p className="flow-panel-empty">Valide ou execute para inspecionar o fluxo atual.</p>}
      {validation&&<><div className={validation.valid?'log-success':'log-error'}>{validation.valid?'Estrutura válida':validation.errors.length+' problemas encontrados'}</div>
        {(validation.diagnostics||validation.errors.map(message=>({message}))).map((d,i)=><button type="button" key={i}
          className="flow-diagnostic" disabled={!d.nodeId} onClick={()=>choose(d.nodeId)} data-testid="flow-diagnostic">
          <span>{d.message}</span>{d.nodeId&&<small>Ir para {d.nodeId}</small>}</button>)}
        {validation.warnings.map((m,i)=><p key={i} className="log-muted">{m}</p>)}
      </>}
      {(running?liveSteps:lastRun?.steps||[]).map((step,i)=><button type="button" key={i} className="flow-execution-row" onClick={()=>choose(step.nodeId)}>
        <span className={step.status==='PASS'?'log-success':step.status==='FAIL'?'log-error':'log-muted'}>{step.status}</span>
        <strong>{step.nodeId}</strong><small>{step.elapsedMs} ms</small>{step.message&&<p>{step.message}</p>}</button>)}
      {lastRun&&<><div className="run-divider">{lastRun.dryRun?'SIMULAÇÃO':'EXECUÇÃO REAL'} · {lastRun.ok?'PASS':'FAIL'}</div>
        {(lastRun.artifacts||[]).map((a,i)=><p key={i} className="log-muted">{a.simulated?'Seria gravado':'Gravado'}: {a.relativePath}</p>)}
        {lastRun.error&&<p className="log-error">{lastRun.error}</p>}
      </>}
    </div>}
  </aside>;
}

export function FlowEditTools({name,nodeCount,edgeCount,busy,selected,canUndo,canRedo,onAction}){
  return <div className="flow-edit-tools" role="toolbar" aria-label="Edição do fluxo">
    <span className="flow-document-name" title={name}>{name}</span>
    {[['undo','undo','Desfazer fluxo',!canUndo],['redo','redo','Refazer fluxo',!canRedo],
      ['duplicate','duplicate','Duplicar bloco',!selected],['delete','trash','Excluir bloco',!selected],
      ['arrange','layers','Organizar fluxo',!nodeCount],['fit','focus','Enquadrar fluxo',!nodeCount]].map(([id,icon,label,disabled])=>
      <button type="button" key={id} title={label} aria-label={label} data-testid={'flow-'+id} disabled={busy||disabled} onClick={()=>onAction(id)}><NavGlyph name={icon} size={15}/></button>)}
    <small>{nodeCount} / {edgeCount}</small>
  </div>;
}
