import React,{useEffect,useId,useRef,useState} from 'react';
import {NavGlyph} from '../../shared/NavGlyph.jsx';
import {EDITOR_MODES} from './layout-model.mjs';
export default function LayoutControls({layout,mode,hasWorkspace}) {
  const [open,setOpen]=useState(false),root=useRef(null),trigger=useRef(null),id=useId();
  const close=(restore=true)=>{setOpen(false);if(restore)trigger.current?.focus();};
  useEffect(()=>{setOpen(false);},[mode,layout.scope]);
  useEffect(()=>{
    if(!open)return;
    const outside=e=>{if(!root.current?.contains(e.target))setOpen(false);};
    document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);
  },[open]);
  const editor=EDITOR_MODES.includes(mode),settings=layout.preferences[mode];
  return <div className="layout-control" ref={root} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOpen(false);}}
    onKeyDown={e=>{if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();close();}}}>
    {layout.focus&&<button type="button" className="button button--outline layout-focus-exit" onClick={layout.exitFocus} data-testid="layout-exit-focus">Sair do foco</button>}
    <button ref={trigger} type="button" className="button button--outline layout-trigger" title="Organizar área de trabalho"
      aria-label="Organizar área de trabalho" aria-expanded={open} aria-controls={id}
      onClick={()=>setOpen(value=>!value)} data-testid="layout-open"><NavGlyph name="panel" size={15}/><span>Layout</span></button>
    {open&&<section className="layout-popover" id={id} aria-label="Opções de layout" data-testid="layout-options">
      <header><strong>Área de trabalho</strong><small>{hasWorkspace?'Preferências deste projeto':'Preferências da sessão inicial'}</small></header>
      <div className="layout-presets" role="group" aria-label="Disposição dos painéis">
        <button type="button" onClick={()=>layout.preset('balanced')}>Equilibrado</button>
        <button type="button" onClick={()=>layout.preset('wide')}>Área ampla</button>
        {editor&&mode!=='code'&&<button type="button" onClick={()=>layout.preset('inspect')}>Inspeção</button>}
      </div>
      <div className="layout-options">
        <label><input type="checkbox" checked={!layout.preferences.navigationCollapsed} onChange={e=>layout.set('navigationCollapsed',!e.target.checked)}/>Navegação expandida</label>
        {(mode==='canvas'||mode==='code')&&<label><input type="checkbox" checked={settings.contextOpen} onChange={e=>layout.set('contextOpen',e.target.checked)}/>{mode==='code'?'Explorador de arquivos':'Biblioteca de blocos'}</label>}
        {(mode==='canvas'||mode==='cad')&&<label><input type="checkbox" checked={settings.inspectorOpen} onChange={e=>layout.set('inspectorOpen',e.target.checked)}/>Inspetor de propriedades</label>}
        {editor&&<button type="button" className="layout-option" aria-pressed={layout.focus} onClick={()=>{layout.toggleFocus();close();}}>{layout.focus?'Sair do modo de foco':'Focar editor'}<kbd>Ctrl⇧F11</kbd></button>}
      </div>
      <footer><button type="button" onClick={()=>{layout.reset();close();}}>Restaurar layout deste projeto</button>
        <small role="status">{layout.status==='invalid'?'Preferências inválidas: usando valores seguros. Restaurar substitui somente o layout.':layout.status==='unavailable'?'Somente nesta sessão: armazenamento local indisponível.':layout.effective.adapted?'Painéis ajustados à janela; tamanhos preferidos preservados.':'Salvo localmente. Nenhum documento é alterado.'}</small></footer>
    </section>}
  </div>;
}
