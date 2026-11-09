import React,{useEffect,useRef} from 'react';
import {NavGlyph} from '../shared/NavGlyph.jsx';
import './CreateMenu.css';
export default function CreateMenu({busy,hasWorkspace,onAction}){
  const ref=useRef(null);
  useEffect(()=>{const outside=e=>{if(ref.current&&!ref.current.contains(e.target))ref.current.open=false;};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[]);
  const act=kind=>{ref.current.open=false;onAction(kind);};
  return <details ref={ref} className="studio-create-menu" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();ref.current.open=false;ref.current.querySelector('summary')?.focus();}}}>
    <summary aria-label="Criar no OmniForge"><NavGlyph name="code" size={15}/>Criar</summary>
    <div role="group" aria-label="Criação de documentos e projetos">
      <button type="button" disabled={busy} onClick={()=>act('new')}><span>Novo arquivo</span><kbd>Ctrl N</kbd></button>
      <button type="button" disabled={busy} onClick={()=>act('template')}><span>Arquivo de modelo…</span></button>
      <button type="button" disabled={busy||!hasWorkspace} onClick={()=>act('folder')}><span>Pastas aninhadas…</span></button>
      <hr/>
      <button type="button" disabled={busy} onClick={()=>act('project')}><span>Novo projeto…</span><kbd>Ctrl ⇧ N</kbd></button>
    </div>
  </details>;
}
