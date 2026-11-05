import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import './RuntimeDiagnostics.css';

export default function RuntimeDiagnostics({ onClose }) {
  const [report,setReport]=useState(null),[status,setStatus]=useState(''),[working,setWorking]=useState(false);
  const dialogRef=useRef(null),closeRef=useRef(null),alive=useRef(true);
  const refresh=useCallback(async()=>{
    setWorking(true);
    try {const value=await window.omni.runtimeDiagnostics();if(alive.current){setReport(value);setStatus('');}}
    catch {if(alive.current)setStatus('Não foi possível consultar o diagnóstico local.');}
    finally {if(alive.current)setWorking(false);}
  },[]);
  useLayoutEffect(()=>{
    alive.current=true;
    const previous=document.activeElement;
    closeRef.current?.focus();
    void refresh();
    return ()=>{alive.current=false;if(previous?.isConnected)previous.focus();};
  },[refresh]);
  const keyboard=event=>{
    event.stopPropagation();
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();return;}
    if(event.key!=='Tab')return;
    const buttons=[...dialogRef.current.querySelectorAll('button:not(:disabled)')];
    const first=buttons[0],last=buttons.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  };
  const exportReport=async()=>{
    setWorking(true);
    try {const result=await window.omni.exportRuntimeDiagnostics();if(alive.current)setStatus(result.saved?'Relatório exportado.':'Exportação cancelada.');}
    catch(e){
      if(alive.current)setStatus(String(e?.message||'').includes('O arquivo já existe.')
        ? 'O arquivo já existe. Escolha outro nome; nada foi sobrescrito.'
        : 'Não foi possível exportar. Selecione um novo arquivo JSON em uma pasta acessível.');
    }
    finally {if(alive.current)setWorking(false);}
  };
  return <div className="runtime-diagnostics-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section ref={dialogRef} className="runtime-diagnostics" role="dialog" aria-modal="true" aria-labelledby="runtime-title" onKeyDown={keyboard}>
      <header><div><small>OMNIFORGE / SUPORTE LOCAL</small><h2 id="runtime-title">Diagnóstico local</h2></div>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Fechar diagnóstico">×</button></header>
      <div className="runtime-diagnostics-body">
        {!report?<p role="status">{status||'Consultando o processo nativo…'}</p>:<>
          <dl><div><dt>Aplicação</dt><dd>OmniForge {report.application.version}</dd></div>
            <div><dt>Distribuição</dt><dd>{report.application.packaged?'Empacotada':'Desenvolvimento'} · experimental</dd></div>
            <div><dt>Plataforma</dt><dd>{report.runtime.platform} / {report.runtime.arch}</dd></div>
            <div><dt>Runtime</dt><dd>Electron {report.runtime.electron} · Node {report.runtime.node}</dd></div>
            <div><dt>Processo principal</dt><dd>{Math.round(report.runtime.mainRssBytes/1024/1024)} MiB · {Math.floor(report.runtime.uptimeMs/1000)} s ativo</dd></div></dl>
          <h3>Proteções do processo atual</h3>
          <dl>{[['sandbox','Sandbox do renderer'],['contextIsolation','Contexto isolado'],
            ['nodeIntegrationDisabled','Node desabilitado no renderer'],['webSecurity','Segurança web'],
            ['encryptedFlowRecoveryAvailable','Recuperação protegida de fluxos']].map(([key,label])=><div key={key}><dt>{label}</dt>
              <dd className={report.protections[key]?'runtime-ok':'runtime-warning'}>{report.protections[key]?'Ativa':'Indisponível'}</dd></div>)}</dl>
          <h3>Eventos nesta sessão</h3>
          <p>{Object.values(report.eventTotals).reduce((total,value)=>total+value,0)} registros técnicos. Nenhum envio automático.</p>
          <p className="runtime-note">A exportação contém versões, estados e contadores. Não inclui arquivos do projeto, comandos, tokens ou caminhos. Não é um certificado de segurança.</p>
        </>}
      </div>
      <footer><span role="status">{status}</span><button type="button" disabled={working} onClick={refresh}>Atualizar</button>
        <button type="button" disabled={working||!report} onClick={exportReport}>Exportar JSON</button></footer>
    </section>
  </div>;
}
