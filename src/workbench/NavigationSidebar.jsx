import React, { useEffect, useState } from 'react';
import './NavigationSidebar.css';

import { NavGlyph } from '../shared/NavGlyph.jsx';
export { NavGlyph } from '../shared/NavGlyph.jsx';
import { NAV_GROUPS } from './module-registry.mjs';

export default function NavigationSidebar({
  mode, collapsed, onCollapse, onNavigate, onOpenProject,
  workspace, projectsCount = 0, busy = false
}) {
  const shortName = workspace?.split(/[\\/]/).pop();
  const [folded,setFolded] = useState(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem('of.nav.folded') || '[]');
      return new Set(Array.isArray(saved) ? saved.filter(x=>typeof x==='string') : []);
    } catch { return new Set(); }
  });
  useEffect(() => {
    try { window.localStorage.setItem('of.nav.folded',JSON.stringify([...folded])); }
    catch { /* Local preferences are optional */ }
  },[folded]);
  const toggleGroup = title => setFolded(current=>{
    const next=new Set(current);
    if(next.has(title))next.delete(title);else next.add(title);
    return next;
  });
  return <nav className={`primary-nav ${collapsed?'primary-nav--collapsed':''}`}
    aria-label="Navegação principal" data-testid="primary-sidebar">
    <div className="primary-nav__heading">
      <span className="primary-nav__heading-text">NAVEGAÇÃO</span>
      <button type="button" className="primary-nav__collapse"
        aria-label={collapsed?'Expandir menu lateral':'Recolher menu lateral'}
        title={collapsed?'Expandir menu lateral':'Recolher menu lateral'}
        onClick={onCollapse}><NavGlyph name={collapsed?'expand':'collapse'} size={17}/></button>
    </div>
    <div className="primary-nav__groups">
      {NAV_GROUPS.map(group=><section key={group.title} className="primary-nav__group" aria-label={group.title}>
        <button type="button" className="primary-nav__group-toggle"
          aria-label={(folded.has(group.title)?'Expandir':'Recolher')+' grupo '+group.title}
          aria-expanded={collapsed || !folded.has(group.title)}
          onClick={()=>toggleGroup(group.title)}>
          <span>{group.title}</span><NavGlyph name="chevron" size={13}/>
        </button>
        {(collapsed || !folded.has(group.title)) && group.items.map(item=>{
          const active=mode===item.mode;
          return <button key={item.mode} type="button"
            className={`primary-nav__item ${active?'primary-nav__item--active':''}`}
            aria-label={item.aria} title={item.aria}
            aria-current={active?'page':undefined}
            disabled={item.mode==='history' && (!workspace || busy)}
            onClick={()=>onNavigate(item.mode)}>
            <NavGlyph name={item.icon}/>
            <span className="primary-nav__item-label">{item.label}</span>
            {item.mode==='projects' && projectsCount>0 && <small className="primary-nav__count">{projectsCount}</small>}
          </button>;
        })}
      </section>)}
    </div>
    <div className="primary-nav__bottom">
      <div className="primary-nav__project" title={workspace || 'Sem projeto selecionado'}>
        <span className="primary-nav__project-symbol"><NavGlyph name="folder" size={17}/></span>
        <span className="primary-nav__project-copy"><strong>{shortName || 'Sem workspace'}</strong>
          <small>{shortName?'Projeto local ativo':'Nenhum projeto aberto'}</small></span>
      </div>
      <button type="button" className="primary-nav__switch" disabled={busy} onClick={onOpenProject}
        aria-label="Selecionar workspace" title="Selecionar workspace">
        <NavGlyph name="arrow" size={16}/><span>Trocar workspace</span>
      </button>
      <button type="button" className={`primary-nav__item primary-nav__about ${mode==='about'?'primary-nav__item--active':''}`}
        aria-label="Sobre o projeto" title="Sobre o projeto" onClick={()=>onNavigate('about')}>
        <NavGlyph name="info"/><span className="primary-nav__item-label">Sobre o OmniForge</span>
      </button>
    </div>
  </nav>;
}
