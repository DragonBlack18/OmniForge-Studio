import React,{useMemo,useRef,useState} from 'react';
import {REFERENCE_CATALOG,REFERENCE_GROUPS,REFERENCE_STATUS,filterReferences} from '../../../core/modules/workspace/reference-catalog.mjs';
import {NavGlyph} from '../../shared/NavGlyph.jsx';
import './CapabilityCenter.css';

const MODULE_NAMES={canvas:'Automações',code:'Editor de código',development:'Executar e testar',cad:'CAD Sketch 2D'};
const FUTURE_TOOLS=[
  ['Depurador','DAP + debugpy / vscode-js-debug','Breakpoints, variáveis e pilha precisam de um host de depuração testado.'],
  ['Terminal interativo','xterm.js + node-pty','Depende de PTY nativo e testes de distribuição Windows. O console de execução já está disponível.'],
  ['Modelagem de sólidos','OpenCascade.js + Replicad','Depende de kernel, viewport 3D, unidades, seleção e persistência de topologia.'],
  ['Restrições de esboço','SolveSpace','Depende de solver, indicação de conflitos e testes numéricos.'],
  ['Bancos de dados','SQLite / DuckDB','Depende de conexões locais, migrações e consulta cancelável.'],
  ['CAM e BIM','OpenCAMLib / web-ifc','Depende de modelos, formatos, perfis e validação de unidades.']
];
export default function CapabilityCenter({onNavigate}) {
  const [query,setQuery]=useState(''),[group,setGroup]=useState('all'),[status,setStatus]=useState('all');
  const [selectedId,setSelectedId]=useState(1),[opening,setOpening]=useState(false),[error,setError]=useState('');
  const pending=useRef(false);
  const rows=useMemo(()=>filterReferences({query,group,status}),[query,group,status]);
  const selected=rows.find(row=>row.id===selectedId)||rows[0]||null;
  const counts=useMemo(()=>Object.fromEntries(Object.keys(REFERENCE_STATUS).map(key=>[key,REFERENCE_CATALOG.filter(row=>row.status===key).length])),[]);
  const openSource=async()=>{
    if(!selected||pending.current)return;
    pending.current=true;setOpening(true);setError('');
    try{if(!window.omni?.openReference)throw Error('Abra o OmniForge pelo aplicativo desktop.');await window.omni.openReference(selected.id);}
    catch(e){setError(e.message||'Não foi possível abrir a fonte. O endereço permanece disponível abaixo.');}
    finally{pending.current=false;setOpening(false);}
  };
  return <section className="capability-center" data-testid="capability-center" aria-labelledby="capability-title">
    <header className="main-toolbar"><div className="toolbar-heading"><span className="eyebrow">AMBIENTE / EVOLUÇÃO DO STUDIO</span><strong id="capability-title">Ferramentas e referências</strong></div><span className="capability-total">{REFERENCE_CATALOG.length} fontes mapeadas</span></header>
    <div className="capability-intro"><p>Consulte o que o OmniForge utiliza hoje e o caminho previsto para as próximas ferramentas. Cada referência tem uma finalidade; as alternativas competem pela mesma função.</p>
      <div className="capability-counts" aria-label="Estado das referências">{Object.entries(REFERENCE_STATUS).map(([key,label])=><span key={key}><strong>{counts[key]}</strong> {label}</span>)}</div>
    </div>
    <div className="capability-filters">
      <label className="capability-search">Buscar referência<input type="search" placeholder="Nome, ferramenta ou função…" value={query} onChange={event=>setQuery(event.target.value)} maxLength={160}/></label>
      <label>Área<select aria-label="Área" value={group} onChange={event=>setGroup(event.target.value)}><option value="all">Todas as áreas</option>{REFERENCE_GROUPS.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label>Estado<select aria-label="Estado" value={status} onChange={event=>setStatus(event.target.value)}><option value="all">Todos os estados</option>{Object.entries(REFERENCE_STATUS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      <button type="button" className="button button--subtle" disabled={!query&&group==='all'&&status==='all'} onClick={()=>{setQuery('');setGroup('all');setStatus('all');}}>Limpar filtros</button>
    </div>
    <div className="capability-result-count" role="status">{rows.length} de {REFERENCE_CATALOG.length} referências</div>
    <div className="capability-content">
      <div className="capability-table-scroll" tabIndex={0} aria-label="Lista de referências">
        <table className="capability-table"><caption className="sr-only">Fontes e decisões de implementação</caption><thead><tr><th scope="col">Referência</th><th scope="col">Área</th><th scope="col">Estado</th></tr></thead>
          <tbody>{rows.map(row=><tr key={row.id} data-selected={selected?.id===row.id}><th scope="row"><button type="button" aria-pressed={selected?.id===row.id} onClick={()=>{setSelectedId(row.id);setError('');}}><span className="capability-index">{String(row.id).padStart(3,'0')}</span>{row.name}</button></th><td>{row.category}</td><td><span className={'capability-state capability-state--'+row.status}>{REFERENCE_STATUS[row.status]}</span></td></tr>)}</tbody>
        </table>
        {!rows.length&&<div className="capability-empty"><NavGlyph name="search" size={26}/><h2>Nenhuma referência encontrada</h2><p>Altere o termo ou limpe os filtros para recuperar a lista completa.</p></div>}
      </div>
      <aside className="capability-detail" aria-label="Detalhes da referência">{selected?<>
        <span className="eyebrow">{selected.category}</span><h2>{selected.name}</h2><span className={'capability-state capability-state--'+selected.status}>{REFERENCE_STATUS[selected.status]}</span>
        <h3>Aplicação no OmniForge</h3><p>{selected.proposal}</p>
        {selected.evidence?<><h3>Componente em uso</h3><code className="capability-evidence">{selected.evidence}</code><p className="capability-help">O estado descreve o componente efetivamente incluído no projeto. Não implica incorporar todas as funções do produto de origem.</p></>:<p className="capability-help">Esta fonte ainda não foi incorporada como dependência. A proposta orienta a próxima implementação e seus testes.</p>}
        {selected.status==='integrated'&&selected.target&&<button type="button" className="button button--solid" onClick={()=>onNavigate(selected.target)}>Abrir {MODULE_NAMES[selected.target]}<NavGlyph name="arrow" size={15}/></button>}
        <h3>Fonte oficial</h3><p className="capability-url">{selected.url}</p>
        <button type="button" className="button button--subtle" disabled={opening} aria-busy={opening} onClick={openSource}>{opening?'Abrindo fonte…':'Abrir fonte no navegador'}</button>
        {error&&<p className="capability-error" role="alert">{error}</p>}
      </>:<p>Selecione uma referência para consultar a finalidade e a fonte.</p>}</aside>
    </div>
    <details className="capability-future"><summary>Próximas ferramentas · preparação visual</summary><p>As ferramentas abaixo estão planejadas e permanecem indisponíveis até a implementação e os testes de integração.</p><div className="capability-future-grid">{FUTURE_TOOLS.map(([name,dependencies,reason])=><article key={name}><h3>{name}</h3><p>{dependencies}</p><p>{reason}</p><button type="button" className="button button--subtle" disabled>Planejado · indisponível</button></article>)}</div></details>
  </section>;
}
