import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addCadEntity, addCadLayer, cadBounds, cadEntityMetrics, cadStats, deleteCadEntity, initialCadSketch, makeCadEntity, removeCadLayer, replaceCadEntity, snapCadPoint } from '../../core/cad2d.mjs';
import { NavGlyph } from './NavigationSidebar.jsx';
import './CadWorkbench.css';

const TOOLS = [
  ['select','pointer','Selecionar'],['pan','hand','Mover vista'],['line','line','Linha'],
  ['rectangle','rectangle','Retângulo'],['circle','circle','Círculo']
];
const MAX_UNDO = 60;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const number=x=>Number(x.toFixed(2));

function CadShape({ entity, color, selected, onSelect }) {
  const shared={
    'data-entity-id': entity.id, onClick: event=>{event.stopPropagation();onSelect(entity.id);},
    stroke:selected?'#F4C985':color, strokeWidth:selected?2:1.25, vectorEffect:'non-scaling-stroke',
    fill:'none', style:{cursor:'pointer'}, pointerEvents:'stroke'
  };
  if(entity.type==='line') return <line x1={entity.a.x} y1={-entity.a.y} x2={entity.b.x} y2={-entity.b.y} {...shared}/>;
  if(entity.type==='rectangle')return <rect x={Math.min(entity.a.x,entity.b.x)} y={-Math.max(entity.a.y,entity.b.y)}
    width={Math.abs(entity.b.x-entity.a.x)} height={Math.abs(entity.b.y-entity.a.y)} {...shared}/>;
  return <circle cx={entity.center.x} cy={-entity.center.y} r={entity.radius} {...shared}/>;
}

export default function CadWorkbench({workspace,visible,onDirtyChange}) {
  const [sketch,setSketch]=useState(initialCadSketch);
  const [revision,setRevision]=useState(null);
  const [dirty,setDirty]=useState(false);
  const [working,setWorking]=useState(false);
  const [tool,setTool]=useState('select');
  const [layerId,setLayerId]=useState('principal');
  const [selected,setSelected]=useState(null);
  const [from,setFrom]=useState(null);
  const [hover,setHover]=useState(null);
  const [cursor,setCursor]=useState({x:0,y:0,kind:'grid'});
  const [status,setStatus]=useState('Abra um projeto para criar um desenho técnico.');
  const [view,setView]=useState({cx:0,cy:0,zoom:4});
  const [grid,setGrid]=useState(5);
  const [snapEnabled,setSnapEnabled]=useState(true);
  const [newLayerName,setNewLayerName]=useState('');
  const [editFields,setEditFields]=useState({});
  const [dimensions,setDimensions]=useState({w:800,h:500});
  const [undo,setUndo]=useState([]);
  const [redo,setRedo]=useState([]);
  const svgRef=useRef(null);
  const panRef=useRef(null);
  const viewRef=useRef(view);
  const activeLayer=sketch.layers.find(l=>l.id===layerId);
  const stats=useMemo(()=>cadStats(sketch),[sketch]);
  const selectedEntity=sketch.entities.find(e=>e.id===selected);
  const vb=useMemo(()=>`${view.cx-dimensions.w/(2*view.zoom)} ${-view.cy-dimensions.h/(2*view.zoom)} ${dimensions.w/view.zoom} ${dimensions.h/view.zoom}`,[view,dimensions]);
  const setDirtyFlag=useCallback(value=>{setDirty(value);onDirtyChange?.(value);},[onDirtyChange]);

  useEffect(()=>{viewRef.current=view;},[view]);
  useEffect(()=>{
    if(!selectedEntity){setEditFields({});return;}
    if(selectedEntity.type==='circle'){
      setEditFields({cx:String(selectedEntity.center.x),cy:String(selectedEntity.center.y),radius:String(selectedEntity.radius)});
    } else {
      setEditFields({ax:String(selectedEntity.a.x),ay:String(selectedEntity.a.y),bx:String(selectedEntity.b.x),by:String(selectedEntity.b.y)});
    }
  },[selected,sketch]);
  useEffect(()=>{
    if(!svgRef.current)return;
    const observer=new ResizeObserver(entries=>{
      const w=entries[0]?.contentRect?.width, h=entries[0]?.contentRect?.height;
      if(w>0&&h>0)setDimensions({w,h});
    });
    observer.observe(svgRef.current);return ()=>observer.disconnect();
  },[workspace]);
  useEffect(()=>{
    let active=true;
    setSelected(null);setFrom(null);setUndo([]);setRedo([]);setSketch(initialCadSketch());setRevision(null);setDirtyFlag(false);
    if(!workspace){setStatus('Abra um projeto para habilitar o CAD.');return()=>{active=false;};}
    setWorking(true);
    window.omni.loadCadSketch().then(doc=>{
      if(!active)return;
      setSketch(doc.sketch);setRevision(doc.revision);setStatus(doc.revision?'Desenho CAD carregado do projeto.':'Novo desenho. Nada foi alterado no disco.');
    }).catch(e=>{if(active)setStatus(`Não foi possível abrir CAD: ${e.message}`);})
      .finally(()=>{if(active)setWorking(false);});
    return()=>{active=false;};
  },[workspace,setDirtyFlag]);

  const record=useCallback(next=>{
    if(working)return;
    setUndo(old=>[...old.slice(-(MAX_UNDO-1)),structuredClone(sketch)]);
    setRedo([]);setSketch(next);setDirtyFlag(true);
  },[sketch,setDirtyFlag,working]);
  const undoOnce=useCallback(()=>{
    if(working||!undo.length)return;
    setRedo(old=>[...old.slice(-(MAX_UNDO-1)),structuredClone(sketch)]);
    setSketch(undo[undo.length-1]);setUndo(x=>x.slice(0,-1));setSelected(null);setDirtyFlag(true);
  },[undo,sketch,setDirtyFlag,working]);
  const redoOnce=useCallback(()=>{
    if(working||!redo.length)return;
    setUndo(old=>[...old.slice(-(MAX_UNDO-1)),structuredClone(sketch)]);
    setSketch(redo[redo.length-1]);setRedo(x=>x.slice(0,-1));setSelected(null);setDirtyFlag(true);
  },[redo,sketch,setDirtyFlag,working]);
  const erase=useCallback(()=>{
    if(working||!selected)return;
    try{record(deleteCadEntity(sketch,selected));setSelected(null);setStatus('Entidade removida do desenho.');}
    catch(e){setStatus(e.message);}
  },[selected,sketch,record,working]);
  useEffect(()=>{
    if(!visible)return;
    const handler=e=>{
      if(/input|textarea|select/i.test(e.target?.tagName||''))return;
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)redoOnce();else undoOnce();}
      else if((e.key==='Delete'||e.key==='Backspace')&&selected){e.preventDefault();erase();}
      else if(e.key==='Escape'){setFrom(null);setSelected(null);setTool('select');}
    };
    window.addEventListener('keydown',handler);
    return()=>window.removeEventListener('keydown',handler);
  },[visible,undoOnce,redoOnce,erase,selected]);

  function toWorld(event) {
    const svg=svgRef.current;
    if(!svg)return{x:0,y:0};
    const ctm=svg.getScreenCTM();
    if(!ctm)return{x:0,y:0};
    const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(ctm.inverse());
    return{x:point.x,y:-point.y};
  }
  function toSnapped(event) {
    const p=toWorld(event);
    return snapEnabled ? snapCadPoint(p,sketch,viewRef.current.zoom,grid)
      : {x:Number(p.x.toFixed(4)),y:Number(p.y.toFixed(4)),kind:'free'};
  }
  function pointerDown(event) {
    if(!workspace||working||event.button===2)return;
    if(tool==='pan'||event.button===1){
      event.preventDefault();panRef.current={x:event.clientX,y:event.clientY,initial:viewRef.current};
      event.currentTarget.setPointerCapture(event.pointerId);return;
    }
    if(tool==='select'){
      if(!event.target.closest?.('[data-entity-id]'))setSelected(null);
      return;
    }
    if(activeLayer?.locked || !activeLayer?.visible){
      setStatus('A camada ativa está bloqueada ou oculta. Desbloqueie e mostre para desenhar.');
      return;
    }
    const p=toSnapped(event);
    setFrom(p);setHover(p);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event){
    if(panRef.current){
      const {x,y,initial}=panRef.current;
      setView({...initial,cx:initial.cx-(event.clientX-x)/initial.zoom,cy:initial.cy+(event.clientY-y)/initial.zoom});return;
    }
    if(!workspace)return;
    const p=toSnapped(event);setCursor(p);if(from)setHover(p);
  }
  function pointerUp(event){
    if(panRef.current){panRef.current=null;return;}
    if(working){setFrom(null);setHover(null);return;}
    if(!from||!workspace||!['line','rectangle','circle'].includes(tool))return;
    const to=toSnapped(event);
    setFrom(null);setHover(null);
    try{
      const entity=makeCadEntity(tool,from,to,layerId);
      record(addCadEntity(sketch,entity));setSelected(entity.id);
      setStatus(`${tool==='line'?'Linha':tool==='circle'?'Círculo':'Retângulo'} criado em milímetros.`);
    }catch(e){setStatus(e.message);}
  }
  function zoomWheel(e){
    if(!visible||!workspace)return;
    e.preventDefault();
    const at=toWorld(e);
    setView(old=>{
      const zoom=clamp(old.zoom*(e.deltaY<0?1.12:1/1.12),0.1,60);
      const factor=1-old.zoom/zoom;
      return {cx:old.cx+(at.x-old.cx)*factor,cy:old.cy+(at.y-old.cy)*factor,zoom};
    });
  }
  function fitDrawing(){
    const bounds=cadBounds(sketch);
    if(!bounds){setView({cx:0,cy:0,zoom:4});return;}
    const w=Math.max(1,bounds.maxX-bounds.minX),h=Math.max(1,bounds.maxY-bounds.minY);
    setView({cx:(bounds.minX+bounds.maxX)/2,cy:(bounds.minY+bounds.maxY)/2,
      zoom:clamp(Math.min(dimensions.w/(w*1.35),dimensions.h/(h*1.35)),0.1,60)});
    setStatus('Vista ajustada à geometria visível.');
  }
  function addLayerFromName(){
    if(working)return;
    const name=newLayerName.trim();
    if(!name){setStatus('Informe um nome para a nova camada.');return;}
    const id='layer_'+crypto.randomUUID().replaceAll('-','').slice(0,12);
    const palette=['#61BFE5','#D6AE72','#A9DCA0','#B6A0EB','#E4A5B2'];
    try {
      record(addCadLayer(sketch,{id,name,color:palette[sketch.layers.length%palette.length]}));
      setLayerId(id);setNewLayerName('');setStatus('Camada criada: '+name);
    } catch(e){setStatus(e.message);}
  }
  function deleteActiveLayer(){
    if(working)return;
    try {
      const next=removeCadLayer(sketch,layerId);
      record(next);setLayerId(next.layers[0].id);setStatus('Camada vazia removida.');
    } catch(e){setStatus(e.message);}
  }
  function applyGeometry(){
    if(!selectedEntity||working)return;
    const read=key=>{
      const raw=String(editFields[key]??'').trim().replace(',','.');
      if(!raw||!Number.isFinite(Number(raw)))throw new Error('Informe coordenadas numéricas válidas em mm.');
      return Number(raw);
    };
    try {
      const replacement=selectedEntity.type==='circle'
        ? {...selectedEntity,center:{x:read('cx'),y:read('cy')},radius:read('radius')}
        : {...selectedEntity,a:{x:read('ax'),y:read('ay')},b:{x:read('bx'),y:read('by')}};
      record(replaceCadEntity(sketch,replacement));
      setStatus('Medidas aplicadas com precisão em milímetros.');
    }catch(e){setStatus(e.message);}
  }
  async function save(){
    if(!workspace||working)return;
    setWorking(true);
    try{
      const result=await window.omni.saveCadSketch(sketch,revision);
      setRevision(result.revision);setDirtyFlag(false);setStatus(`Desenho salvo: ${result.path}`);
    }catch(e){setStatus(`Erro ao salvar: ${e.message}`);}finally{setWorking(false);}
  }
  async function exportFormat(format){
    if(!workspace||working)return;
    setWorking(true);
    try{
      const result=await window.omni.exportCadSketch(format,sketch);
      setStatus(`Arquivo ${format.toUpperCase()} real exportado: ${result.relativePath} (${result.bytes} bytes).`);
    }catch(e){setStatus(`Erro na exportação: ${e.message}`);}finally{setWorking(false);}
  }
  function toggleLayer(id,key){
    const next={...structuredClone(sketch),layers:sketch.layers.map(layer=>layer.id===id?{...layer,[key]:!layer[key]}:layer)};
    record(next);
  }
  const layerColor=id=>sketch.layers.find(l=>l.id===id)?.color||'#6CBCEC';
  const tip=tool==='line'?'Arraste do ponto inicial ao final para criar uma linha.':tool==='rectangle'?'Arraste para criar um retângulo com dimensões em mm.':tool==='circle'?'Arraste do centro até o raio do círculo.':tool==='pan'?'Arraste o desenho para mover a câmera.':'Clique em uma entidade para selecionar e medir.';

  return <div className="cad-workbench" aria-label="OmniForge CAD 2D" data-testid="cad-workbench">
    <header className="cad-topbar">
      <div className="cad-heading"><span className="cad-eyebrow">ENGENHARIA / DESENHO TÉCNICO</span><strong>CAD Sketch <span>2D</span></strong></div>
      <div className="cad-context"><span className="cad-online-dot"/>{workspace?workspace.split(/[\\/]/).pop():'Sem projeto'} · mm · <span data-testid="cad-entity-count">{stats.count}</span> entidades {dirty?'• não salvo':''}</div>
      <div className="cad-top-actions">
        <button type="button" disabled={!workspace||!dirty||working} onClick={save} className="cad-action cad-primary" data-testid="cad-save">Salvar desenho</button>
        <button type="button" disabled={!workspace||working} onClick={()=>exportFormat('dxf')} className="cad-action">Exportar DXF</button>
        <button type="button" disabled={!workspace||working} onClick={()=>exportFormat('svg')} className="cad-action">Exportar SVG</button>
      </div>
    </header>
    <div className="cad-body">
      <aside className="cad-tools" aria-label="Ferramentas CAD">
        <span className="cad-label">DESENHAR</span>
        {TOOLS.map(([id,icon,label])=><button key={id} title={label} aria-label={label} data-testid={`cad-tool-${id}`} className={`cad-tool ${tool===id?'is-active':''}`} onClick={()=>{setTool(id);setFrom(null);}}><NavGlyph name={icon} size={19}/></button>)}
        <div className="cad-tools-separator"/>
        <button title="Desfazer" aria-label="Desfazer" disabled={!undo.length} className="cad-tool cad-tool-small" onClick={undoOnce}>↶</button>
        <button title="Refazer" aria-label="Refazer" disabled={!redo.length} className="cad-tool cad-tool-small" onClick={redoOnce}>↷</button>
        <button title="Excluir entidade" aria-label="Excluir entidade" disabled={!selected} className="cad-tool cad-tool-small" onClick={erase}>⌫</button>
        <button title="Ajustar desenho à tela" aria-label="Ajustar desenho à tela" className="cad-tool cad-tool-small" onClick={fitDrawing}>⌖</button>
      </aside>
      <section className="cad-center">
        {!workspace&&<div className="cad-overlay"><div className="cad-overlay-symbol">▱</div><strong>Nenhum workspace selecionado</strong><p>Abra um projeto para desenhar e armazenar a geometria na pasta .omniforge/cad.</p></div>}
        <div className="cad-viewport-badge"><span>ESBOÇO 2D</span> · GRADE {grid} mm · {snapEnabled?'SNAP ATIVO':'SNAP LIVRE'}</div>
        <svg ref={svgRef} aria-label="Área de desenho CAD" data-testid="cad-canvas" className={`cad-canvas cad-canvas--${tool}`} role="application"
          viewBox={vb} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={()=>{panRef.current=null;setFrom(null);}} onWheel={zoomWheel}>
          <defs><pattern id="cad-grid" x="0" y="0" width={grid} height={grid} patternUnits="userSpaceOnUse"><path d={`M ${grid} 0 L 0 0 0 ${grid}`} fill="none" stroke="#30444c" strokeWidth={0.65} vectorEffect="non-scaling-stroke"/></pattern></defs>
          <rect x="-1000000" y="-1000000" width="2000000" height="2000000" fill="#0f1921"/>
          <rect x="-1000000" y="-1000000" width="2000000" height="2000000" fill="url(#cad-grid)"/>
          <line x1="-1000000" x2="1000000" y1="0" y2="0" stroke="#52717a" strokeWidth="1" vectorEffect="non-scaling-stroke"/>
          <line y1="-1000000" y2="1000000" x1="0" x2="0" stroke="#436386" strokeWidth="1" vectorEffect="non-scaling-stroke"/>
          {sketch.entities.filter(e=>sketch.layers.find(l=>l.id===e.layerId)?.visible).map(e=><CadShape key={e.id} entity={e} color={layerColor(e.layerId)} selected={e.id===selected} onSelect={id=>{if(tool==='select')setSelected(id);}}/>)}
          {from&&hover&&<g opacity="0.85" pointerEvents="none"><CadShape entity={{id:'preview',type:tool,layerId,a:from,b:hover,center:from,radius:Math.hypot(hover.x-from.x,hover.y-from.y)}} color="#E7C383" selected={false} onSelect={()=>{}}/></g>}
          {visible&&workspace&&<g pointerEvents="none"><circle cx={cursor.x} cy={-cursor.y} r={4/view.zoom} stroke="#E7C383" fill="none" strokeWidth={1.2} vectorEffect="non-scaling-stroke"/></g>}
        </svg>
        <div className="cad-viewport-help">{tip}</div>
        <div className="cad-viewport-zoom">{Math.round(view.zoom*25)}% <span>· Roda do mouse para zoom</span></div>
      </section>
      <aside className="cad-properties" aria-label="Propriedades CAD">
        <div className="cad-property-heading"><span>PROPRIEDADES</span><strong>{selectedEntity?'ENTIDADE':'DOCUMENTO'}</strong></div>
        {selectedEntity?<div className="cad-property-block"><label>Tipo</label><strong>{selectedEntity.type}</strong><label>Camada</label><strong>{selectedEntity.layerId}</strong><label>Comprimento / perímetro</label><strong>{cadEntityMetrics(selectedEntity).length} mm</strong><label>Área</label><strong>{cadEntityMetrics(selectedEntity).area} mm²</strong><button className="cad-action cad-danger" onClick={erase}>Excluir entidade selecionada</button></div>:
          <div className="cad-property-block"><label>Unidade</label><strong>Milímetro (mm)</strong><label>Entidades</label><strong>{stats.count}</strong><label>Comprimento visível</label><strong>{stats.totalLength} mm</strong><label>Formato original</label><strong>OmniForge Sketch v1</strong></div>}
        {selectedEntity && <div className="cad-precision">
          <div className="cad-precision-title">GEOMETRIA EXATA <span>mm</span></div>
          <div className="cad-coordinate-grid">
            {(selectedEntity.type==='circle'
              ? [['cx','Centro X'],['cy','Centro Y'],['radius','Raio']]
              : [['ax','X inicial'],['ay','Y inicial'],['bx','X final'],['by','Y final']]
            ).map(([key,label])=><label key={key}>{label} (mm)
              <input aria-label={label+' (mm)'} type="number" step="any" value={editFields[key]??''}
                disabled={working || sketch.layers.find(l=>l.id===selectedEntity.layerId)?.locked}
                onChange={e=>setEditFields(fields=>({...fields,[key]:e.target.value}))}/>
            </label>)}
          </div>
          <button type="button" className="cad-action cad-primary cad-full-action" disabled={working || sketch.layers.find(l=>l.id===selectedEntity.layerId)?.locked}
            onClick={applyGeometry} data-testid="cad-apply-geometry">Aplicar coordenadas</button>
        </div>}
        <div className="cad-property-heading"><span>PRECISÃO / VISTA</span><strong>mm</strong></div>
        <div className="cad-settings">
          <label>Espaçamento da grade
            <select aria-label="Espaçamento da grade" value={grid} onChange={event=>setGrid(Number(event.target.value))}>
              {[1,5,10,25,50].map(step=><option key={step} value={step}>{step} mm</option>)}
            </select>
          </label>
          <label className="cad-snap-label"><input type="checkbox" checked={snapEnabled} onChange={e=>setSnapEnabled(e.target.checked)}/> Snap para grade e objetos</label>
          <button className="cad-action cad-fit-action" onClick={fitDrawing}>Ajustar desenho à tela</button>
        </div>
        <div className="cad-property-heading"><span>CAMADAS</span><strong>{sketch.layers.length}</strong></div>
        <div className="cad-layers">{sketch.layers.map(layer=><div className={`cad-layer ${layer.id===layerId?'selected':''}`} key={layer.id}>
          <button className="cad-layer-pick" onClick={()=>setLayerId(layer.id)} title="Selecionar camada ativa"><i style={{background:layer.color}}/>{layer.name}</button>
          <button className="cad-layer-eye" title={layer.visible?'Ocultar camada':'Mostrar camada'} onClick={()=>toggleLayer(layer.id,'visible')}>{layer.visible?'◉':'○'}</button>
          <button className="cad-layer-eye" title={layer.locked?'Desbloquear':'Bloquear'} onClick={()=>toggleLayer(layer.id,'locked')}>{layer.locked?'🔒':'▢'}</button>
        </div>)}</div>
        <div className="cad-add-layer">
          <input type="text" maxLength={60} value={newLayerName} onChange={e=>setNewLayerName(e.target.value)} placeholder="Nova camada" aria-label="Nome da nova camada" onKeyDown={e=>{if(e.key==='Enter')addLayerFromName();}} />
          <button className="cad-action" onClick={addLayerFromName} disabled={working || sketch.layers.length>=32}>+ Criar</button>
        </div>
        <button className="cad-remove-layer" onClick={deleteActiveLayer} disabled={working || sketch.layers.length<=1}
          title="Remove apenas a camada ativa vazia">Remover camada ativa vazia</button>
        <div className="cad-brief"><strong>Desenho nativo e exportável</strong><p>Geometria 2D real em mm. SVG e DXF R12 são exportados para .omniforge/output. Modelagem 3D paramétrica é o próximo módulo separado.</p></div>
      </aside>
    </div>
    <footer className="cad-status" role="status"><span>{status}</span><span>X {number(cursor.x)} · Y {number(cursor.y)} mm · {cursor.kind==='object'?'SNAP OBJETO':cursor.kind==='grid'?'GRADE':'LIVRE'}</span></footer>
  </div>;
}
