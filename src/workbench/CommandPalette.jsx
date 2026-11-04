import React, { useEffect, useMemo, useRef, useState } from 'react';
import { searchWorkbenchCommands } from './command-registry.mjs';
import { NavGlyph } from '../shared/NavGlyph.jsx';
import './CommandPalette.css';

/**
 * Accessible quick navigation over allowlisted commands and indexed local files.
 * No shell, eval, network lookup or arbitrary path is reachable from this UI.
 */
export default function CommandPalette({
  open, scope, commands, mode, hasWorkspace, onClose, onExecute
}) {
  const [query,setQuery] = useState('');
  const [active,setActive] = useState(0);
  const searchRef = useRef(null);
  const entries = useMemo(() => searchWorkbenchCommands(commands,query,{
    scope, mode, hasWorkspace, limit:35
  }),[commands,query,scope,mode,hasWorkspace]);
  const selected = Math.min(active,Math.max(0,entries.length-1));
  useEffect(() => {
    if (!open) return undefined;
    const before = document.activeElement;
    setQuery('');
    setActive(0);
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      if (before?.isConnected && typeof before.focus === 'function') before.focus();
    };
  },[open,scope]);
  if (!open) return null;
  const choose = item => {
    if (!item) return;
    onClose();
    onExecute(item);
  };
  const keyDown = event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
    else if (event.key === 'ArrowDown') {
      event.preventDefault(); setActive(x=>Math.min(entries.length-1,x+1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault(); setActive(x=>Math.max(0,x-1));
    } else if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault(); choose(entries[selected]);
    }
  };
  return <div className="command-overlay" data-testid="command-palette-overlay"
    onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <section role="dialog" aria-modal="true" aria-label={scope==='files'?'Abrir arquivo rapidamente':'Paleta de comandos'}
      className="command-palette" data-testid="command-palette" onKeyDown={keyDown}>
      <header className="command-palette__heading">
        <span><NavGlyph name={scope==='files'?'folder':'terminal'} size={16}/>{scope==='files'?'ABRIR ARQUIVO':'EXECUTAR COMANDO'}</span>
        <kbd>ESC</kbd>
      </header>
      <div className="command-palette__search">
        <NavGlyph name="search" size={19}/>
        <input ref={searchRef} type="search" spellCheck={false} autoComplete="off"
          aria-label={scope==='files'?'Pesquisar arquivos':'Pesquisar comandos'}
          aria-controls="command-palette-results"
          placeholder={scope==='files'?'Nome ou caminho no projeto...':'Navegue por ferramentas ou ações...'}
          value={query} onChange={event=>{setQuery(event.target.value);setActive(0);}}/>
        <small>{entries.length} / 35</small>
      </div>
      <div id="command-palette-results" className="command-palette__results" role="listbox"
        aria-label="Resultados da pesquisa">
        {entries.map((item,index) => <button type="button" key={item.id}
          role="option" aria-selected={index===selected}
          data-testid="command-result"
          className={index===selected?'command-palette__option is-selected':'command-palette__option'}
          onMouseEnter={()=>setActive(index)} onClick={()=>choose(item)}>
          <span className="command-palette__glyph"><NavGlyph name={item.icon} size={17}/></span>
          <span className="command-palette__copy"><strong>{item.title}</strong><small>{item.detail}</small></span>
          <NavGlyph name="arrow" size={14}/>
        </button>)}
        {!entries.length && <div className="command-palette__empty">
          {scope==='files'&&!hasWorkspace?'Abra um projeto para acessar seus arquivos.':'Nenhuma opção disponível para esta pesquisa.'}
        </div>}
      </div>
      <footer className="command-palette__footer"><span><kbd>↑</kbd> <kbd>↓</kbd> Navegar</span>
        <span><kbd>Enter</kbd> Abrir</span>
        <span>Somente ações explícitas do software · execução local</span></footer>
    </section>
  </div>;
}
