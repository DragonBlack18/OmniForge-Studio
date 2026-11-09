import React from 'react';
import { NavGlyph } from '../shared/NavGlyph.jsx';
import './WorkspaceOverview.css';
export default function WorkspaceOverview({workspace,version,flowDirty=false,cadDirty=false,onCreate,busy}) {
  return <section className="studio-start" data-testid="workspace-overview" aria-label="Área de trabalho">
    <div className="studio-start__mark" aria-hidden="true">OF</div>
    <h1>{workspace?workspace.split(/[\\/]/).pop():'OmniForge Studio'}</h1>
    <p>{workspace?'Selecione uma ferramenta na navegação lateral.':'Crie um documento ou projeto, ou abra uma pasta existente.'}</p>
    <div className="studio-start__create"><button type="button" disabled={busy} onClick={()=>onCreate('new')}><NavGlyph name="code" size={16}/>Novo documento</button><button type="button" disabled={busy} onClick={()=>onCreate('project')}><NavGlyph name="folder" size={16}/>Novo projeto</button></div>
    {workspace&&<code title={workspace}>{workspace}</code>}
    {(flowDirty||cadDirty)&&<p className="studio-start__pending"><NavGlyph name="info" size={14}/>Edições pendentes</p>}
    <div className="studio-start__keys" aria-label="Atalhos"><span><kbd>Ctrl ⇧ P</kbd>Comandos</span><span><kbd>Ctrl P</kbd>Arquivos</span><span><kbd>Ctrl B</kbd>Navegação</span></div>
    <small>v{version} · Local</small>
  </section>;
}
