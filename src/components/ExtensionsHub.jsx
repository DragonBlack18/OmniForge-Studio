import React, { useMemo, useState } from 'react';
import { NavGlyph } from './NavigationSidebar.jsx';
import './ExtensionsHub.css';

const PERMISSION_LABELS = {
  'workflow.transform': 'Transformar dados nos fluxos',
  'workspace.output.write': 'Gravar JSON na saída do projeto'
};
const shortHash=sha=>sha?.slice(0,12)||'—';

export default function ExtensionsHub({
  extensions=[],workspace='',busy=false,
  onInstall,onInstallExample,onEnable,onGrant,onRemove,onAddAction,onRefresh
}) {
  const [search,setSearch]=useState('');
  const [expanded,setExpanded]=useState(null);
  const filtered=useMemo(()=>extensions.filter(item=>
    [item.name,item.id,item.description,...item.actions.map(a=>a.name)]
      .join(' ').toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR'))
  ),[extensions,search]);
  const active=extensions.filter(item=>item.enabled).length;
  const executable=extensions.filter(item=>item.enabled&&item.granted.includes('workflow.transform')).length;
  return <section className="extensions-hub" data-testid="extension-hub">
    <div className="extensions-hero">
      <div>
        <span className="extensions-eyebrow">OMNIFORGE / EXTENSÕES LOCAIS</span>
        <h2>Central de extensões</h2>
        <p>Adicione capacidades executáveis aos fluxos com pacotes declarativos, controle de permissões e isolamento por workspace. Sem scripts de terceiros, internet ou instalação automática de dependências.</p>
        <div className="extensions-hero-actions">
          <button type="button" disabled={busy} onClick={onInstall} className="button button--solid" data-testid="extension-install">
            <NavGlyph name="folder" size={16}/> Instalar arquivo .ofx.json
          </button>
          <button type="button" disabled={busy} onClick={onInstallExample}
            className="button button--subtle" data-testid="extension-install-example">
            <NavGlyph name="workflow" size={16}/> Instalar exemplo funcional
          </button>
        </div>
      </div>
      <div className="extensions-summary" aria-label="Resumo das extensões">
        <div><small>INSTALADAS</small><strong>{extensions.length}</strong></div>
        <div><small>ATIVADAS</small><strong>{active}</strong></div>
        <div><small>AUTORIZADAS NESTE PROJETO</small><strong>{workspace?executable:'—'}</strong></div>
      </div>
    </div>
    <div className="extensions-sectionbar">
      <div><span className="extensions-eyebrow">GERENCIAMENTO</span>
        <h3>Pacotes instalados</h3></div>
      <div className="extensions-controls">
        <input value={search} onChange={event=>setSearch(event.target.value)}
          aria-label="Buscar extensões" placeholder="Buscar extensões..." />
        <button className="button button--subtle" type="button" disabled={busy} onClick={onRefresh}>Atualizar</button>
      </div>
    </div>
    {!workspace && <p className="extensions-note">
      <NavGlyph name="info" size={16}/>
      Selecione um workspace antes de conceder permissões ou executar ações. A instalação pode ser feita sem um projeto aberto.
    </p>}
    {!filtered.length && <div className="extensions-empty">
      <NavGlyph name="plug" size={23}/>
      <strong>{extensions.length?'Nenhuma extensão corresponde à busca.':'Nenhuma extensão instalada.'}</strong>
      <p>{extensions.length?'Experimente buscar por outro nome.':
        'Instale um arquivo local .ofx.json ou o exemplo funcional para testar o motor.'}</p>
    </div>}
    <div className="extensions-cards">
      {filtered.map(item=>{
        const ready=item.enabled&&item.granted.includes('workflow.transform');
        const open=expanded===item.id;
        return <article className="extensions-card" key={item.id}>
          <div className="extensions-card-main">
            <div className="extensions-icon"><NavGlyph name="plug" size={22}/></div>
            <div className="extensions-card-copy">
              <div className="extensions-card-title"><strong>{item.name}</strong>
                <span className="extensions-version">v{item.version}</span>
                <span className={`extensions-state ${ready?'extensions-state--active':''}`}>
                  {ready?'OPERACIONAL':item.enabled?'SEM AUTORIZAÇÃO':'DESATIVADA'}
                </span>
              </div>
              <p>{item.description}</p>
              <small>{item.id} · SHA256 {shortHash(item.sha256)}…</small>
            </div>
            <div className="extensions-card-actions">
              <button className="button button--subtle" type="button"
                aria-label={(open?'Ocultar':'Detalhes de')+' '+item.name}
                onClick={()=>setExpanded(open?null:item.id)}>
                {open?'Recolher':'Gerenciar'}
              </button>
              <button className="button button--outline" type="button"
                disabled={busy} onClick={()=>onEnable(item.id,!item.enabled)}>
                {item.enabled?'Desativar':'Ativar'}
              </button>
            </div>
          </div>
          {open && <div className="extensions-details">
            <div className="extensions-details-column">
              <h4>Permissões por workspace</h4>
              <p>Uma extensão instalada não recebe acesso automático. Autorizações são separadas por pasta de projeto.</p>
              {item.permissions.map(permission=><label key={permission} className="extensions-permission">
                <input type="checkbox" checked={item.granted.includes(permission)}
                  disabled={!workspace||!item.enabled||busy}
                  onChange={event=>onGrant(item.id,permission,event.target.checked)}/>
                <span><strong>{PERMISSION_LABELS[permission]||permission}</strong>
                  <small>{permission}</small></span>
              </label>)}
              <button className="extensions-remove" type="button" disabled={busy}
                onClick={()=>onRemove(item.id)}>Desinstalar extensão</button>
            </div>
            <div className="extensions-details-column">
              <h4>Ações executáveis</h4>
              <p>As ações usam o valor JSON de entrada do fluxo. Nenhum conteúdo de entrada é armazenado no registro de extensões.</p>
              {item.actions.map(action=>{
                const permitted=ready&&(!action.outputFile||item.granted.includes('workspace.output.write'));
                return <div key={action.id} className="extensions-action">
                  <div><strong>{action.name}</strong><small>{action.description}</small>
                    <span>{action.stepCount} operação(ões){action.outputFile?' · Grava '+action.outputFile:''}</span></div>
                  <button type="button" className="button button--subtle"
                    disabled={!workspace||!permitted||busy}
                    title={permitted?'Adicionar nó configurado ao fluxo':'Ative e autorize as permissões exigidas'}
                    onClick={()=>onAddAction(item.id,action.id)}>
                    Adicionar ao fluxo
                  </button>
                </div>;
              })}
            </div>
          </div>}
        </article>;
      })}
    </div>
    <footer className="extensions-footer">
      <NavGlyph name="info" size={16}/>
      O Hub v1 aceita apenas operações declarativas limitadas e assinaturas SHA-256 de integridade local.
      SHA-256 não autentica um autor. Este módulo não instala VSIX, não executa plugins JS arbitrários nem substitui um sandbox de código não confiável.
    </footer>
  </section>;
}
