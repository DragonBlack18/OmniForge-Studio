import React from 'react';
import { NavGlyph } from '../shared/NavGlyph.jsx';
import './WorkspaceOverview.css';
export default function WorkspaceOverview({workspace,version,flowDirty=false,cadDirty=false}) {
  return <section className="studio-start" data-testid="workspace-overview" aria-label="Área de trabalho">
    <div className="studio-start__mark" aria-hidden="true">OF</div>
    <h1>{workspace?workspace.split(/[\\/]/).pop():'OmniForge Studio'}</h1>
    <p>{workspace?'Selecione uma ferramenta na navegação lateral.':'Abra uma pasta de projeto na barra superior.'}</p>
    {workspace&&<code title={workspace}>{workspace}</code>}
    {(flowDirty||cadDirty)&&<p className="studio-start__pending"><NavGlyph name="info" size={14}/>Edições pendentes</p>}
    <div className="studio-start__keys" aria-label="Atalhos"><span><kbd>Ctrl ⇧ P</kbd>Comandos</span><span><kbd>Ctrl P</kbd>Arquivos</span><span><kbd>Ctrl B</kbd>Navegação</span></div>
    <small>v{version} · Local</small>
  </section>;
}
