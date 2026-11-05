import React, {useMemo,useState} from 'react';
import {NavGlyph} from '../../shared/NavGlyph.jsx';
import {cadEntityLabel} from '../../../core/modules/cad/cad-edit.mjs';

/** Local document hierarchy, not a second application navigator. */
export default React.memo(function CadOutliner({sketch,selected,layerId,disabled,onSelect,onLayer,onEntityFlag,onLayerFlag}){
  const [query,setQuery]=useState('');
  const [folded,setFolded]=useState(()=>new Set());
  const grouped=useMemo(()=>{
    const q=query.toLocaleLowerCase('pt-BR').trim();
    const groups=new Map(sketch.layers.map(l=>[l.id,[]]));
    sketch.entities.forEach((entity,index)=>{
      const name=cadEntityLabel(entity,index);
      if(!q||`${name} ${entity.id}`.toLocaleLowerCase('pt-BR').includes(q))groups.get(entity.layerId)?.push({entity,name});
    });return groups;
  },[sketch,query]);
  const keyDown=e=>{
    if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key)||e.target.tagName==='INPUT')return;
    const rows=[...e.currentTarget.querySelectorAll('[data-tree-entry]')];
    const i=rows.indexOf(document.activeElement);if(i<0)return;
    const next=e.key==='Home'?0:e.key==='End'?rows.length-1:Math.max(0,Math.min(rows.length-1,i+(e.key==='ArrowDown'?1:-1)));
    e.preventDefault();rows[next]?.focus();
  };
  return <section className="cad-outliner" aria-label="Objetos e camadas" onKeyDown={keyDown}>
    <header className="cad-section-heading"><span>Objetos</span><small>{sketch.entities.length}</small></header>
    <label className="cad-object-search"><NavGlyph name="search" size={13}/><input aria-label="Buscar objetos CAD" placeholder="Buscar objetos" value={query} onChange={e=>setQuery(e.target.value)}/></label>
    <div className="cad-object-tree" role="tree" aria-label="Hierarquia do desenho">
      {sketch.layers.map(layer=>{
        const items=grouped.get(layer.id)||[];
        if(query&&items.length===0)return null;
        const expanded=query||!folded.has(layer.id);
        return <div className="cad-tree-group" key={layer.id} role="none">
          <div className={`cad-tree-row cad-tree-layer ${layer.id===layerId&&!selected?'is-selected':''}`}>
            <button type="button" className="cad-tree-fold" aria-expanded={Boolean(expanded)} aria-label={(expanded?'Recolher':'Expandir')+' camada '+layer.name}
              onClick={()=>setFolded(old=>{const next=new Set(old);next.has(layer.id)?next.delete(layer.id):next.add(layer.id);return next;})}>
              <NavGlyph name="chevron" size={11}/></button>
            <button type="button" role="treeitem" aria-level={1} data-tree-entry aria-expanded={Boolean(expanded)} aria-selected={layer.id===layerId&&!selected}
              className="cad-tree-label" onClick={()=>onLayer(layer.id)}><i style={{background:layer.color}}/><span>{layer.name}</span><small>{items.length}</small></button>
            <button type="button" className="cad-tree-flag" disabled={disabled} title={layer.visible?'Ocultar camada':'Mostrar camada'}
              aria-label={(layer.visible?'Ocultar camada ':'Mostrar camada ')+layer.name} onClick={()=>onLayerFlag(layer.id,'visible',!layer.visible)}><NavGlyph name={layer.visible?'eye':'eye-off'} size={13}/></button>
            <button type="button" className="cad-tree-flag" disabled={disabled} aria-label={(layer.locked?'Desbloquear camada ':'Bloquear camada ')+layer.name}
              onClick={()=>onLayerFlag(layer.id,'locked',!layer.locked)}><NavGlyph name={layer.locked?'lock':'unlock'} size={12}/></button>
          </div>
          {expanded&&<div role="group">{items.map(({entity,name})=><div key={entity.id} className={`cad-tree-row cad-tree-object ${selected===entity.id?'is-selected':''} ${entity.visible===false||!layer.visible?'is-hidden':''}`}>
            <button type="button" role="treeitem" aria-level={2} data-tree-entry aria-selected={selected===entity.id} title={entity.id}
              data-testid="cad-object-entry" data-object-id={entity.id} className="cad-tree-label" onClick={()=>onSelect(entity.id)}>
              <NavGlyph name={entity.type} size={13}/><span>{name}</span></button>
            <button type="button" className="cad-tree-flag" disabled={disabled||layer.locked||entity.locked}
              aria-label={(entity.visible===false?'Mostrar objeto ':'Ocultar objeto ')+name}
              onClick={()=>onEntityFlag(entity.id,'visible',entity.visible===false)}><NavGlyph name={entity.visible===false?'eye-off':'eye'} size={13}/></button>
            <button type="button" className="cad-tree-flag" disabled={disabled||layer.locked}
              aria-label={(entity.locked?'Desbloquear objeto ':'Bloquear objeto ')+name}
              onClick={()=>onEntityFlag(entity.id,'locked',!entity.locked)}><NavGlyph name={entity.locked?'lock':'unlock'} size={12}/></button>
          </div>)}</div>}
        </div>;
      })}
      {sketch.entities.length===0&&<p className="cad-tree-empty">Desenhe ou importe um DXF.</p>}
      {query&&[...grouped.values()].every(items=>!items.length)&&<p className="cad-tree-empty">Nenhum objeto encontrado.</p>}
    </div>
  </section>;
});
