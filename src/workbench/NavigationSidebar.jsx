import React, { useEffect, useState } from 'react';
import { NavGlyph } from '../shared/NavGlyph.jsx';
import { NAV_GROUPS } from './module-registry.mjs';
import './NavigationSidebar.css';
export { NavGlyph } from '../shared/NavGlyph.jsx';

/** One global navigator. Editors own their tools, not another application menu. */
export default function NavigationSidebar({mode,collapsed,onCollapse,onNavigate,workspace,busy=false}) {
  const [folded,setFolded]=useState(()=>{
    try { const value=JSON.parse(localStorage.getItem('of.nav.folded')||'[]');
      return new Set(Array.isArray(value)?value.filter(x=>NAV_GROUPS.some(g=>g.title===x)):[]);
    } catch {return new Set();}
  });
  useEffect(()=>{try{localStorage.setItem('of.nav.folded',JSON.stringify([...folded]));}catch{}},[folded]);
  const toggle=title=>setFolded(old=>{const next=new Set(old);next.has(title)?next.delete(title):next.add(title);return next;});
  return <nav className={`primary-nav ${collapsed?'primary-nav--collapsed':''}`}
    aria-label="Navegação principal" data-testid="primary-sidebar">
    <div className="primary-nav__heading">
      <span className="primary-nav__heading-text">FERRAMENTAS</span>
      <button type="button" className="primary-nav__collapse" onClick={onCollapse}
        title="Ctrl+B" aria-label={collapsed?'Expandir menu lateral':'Recolher menu lateral'}>
        <NavGlyph name={collapsed?'expand':'collapse'} size={16}/>
      </button>
    </div>
    <div className="primary-nav__groups">
      {NAV_GROUPS.map(group=><section className="primary-nav__group" key={group.id} aria-label={group.title}>
        {!collapsed && <button className="primary-nav__group-toggle" type="button"
          aria-label={(folded.has(group.title)?'Expandir':'Recolher')+' grupo '+group.title}
          aria-expanded={!folded.has(group.title)} onClick={()=>toggle(group.title)}>
          <span>{group.title}</span><NavGlyph name="chevron" size={12}/>
        </button>}
        {(collapsed||!folded.has(group.title))&&group.items.map(item=><button type="button" key={item.mode}
          className={`primary-nav__item ${mode===item.mode?'primary-nav__item--active':''}`}
          aria-label={item.aria} title={item.aria} aria-current={mode===item.mode?'page':undefined}
          disabled={item.mode==='history'&&(!workspace||busy)} onClick={()=>onNavigate(item.mode)}>
          <NavGlyph name={item.icon} size={17}/><span className="primary-nav__item-label">{item.label}</span>
        </button>)}
      </section>)}
    </div>
    <div className="primary-nav__bottom"><button type="button" className={`primary-nav__item ${mode==='about'?'primary-nav__item--active':''}`}
      aria-label="Sobre o projeto" title="Sobre o projeto" onClick={()=>onNavigate('about')}>
      <NavGlyph name="info" size={17}/><span className="primary-nav__item-label">Sobre</span>
    </button></div>
  </nav>;
}
