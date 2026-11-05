import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addCadEntity, addCadLayer, cadBounds, cadEntityMetrics, cadStats, deleteCadEntity, initialCadSketch, makeCadEntity, removeCadLayer, replaceCadEntity, snapCadPoint } from '../../../core/modules/cad/cad2d.mjs';
import { NavGlyph } from '../../shared/NavGlyph.jsx';
import { useCadRecovery } from './useCadRecovery.mjs';
import './CadWorkbench.css';
import CadOutliner from './CadOutliner.jsx';
import CadInspector from './CadInspector.jsx';
import {createCadPointer} from './cad-pointer.mjs';
import {CadPointerOverlay,CadCoordinates} from './CadPointer.jsx';
import { editCadIdentity, editCadLayer, duplicateCadEntity, transformCadEntity, setCadDimensions } from '../../../core/modules/cad/cad-edit.mjs';
import { rotateCadEntity,mirrorCadEntity,offsetCadLine,arrayCadEntity,measureCadPoints } from '../../../core/modules/cad/cad-toolkit.mjs';

const TOOLS = [
  ['select','pointer','Selecionar'],['pan','hand','Mover vista'],['line','line','Linha'],
  ['rectangle','rectangle','Retângulo'],['circle','circle','Círculo'],
  ['measure','ruler','Medir distância']
];
const MAX_UNDO = 60;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

const CadShape = React.memo(function CadShape({ entity, color, selected, onSelect }) {
  const shared={
    'data-entity-id': entity.id, onClick: event=>{event.stopPropagation();onSelect(entity.id);},
    stroke:selected?'#F1CFD3':color, strokeWidth:selected?2:1.25, vectorEffect:'non-scaling-stroke',
    fill:'none', style:{cursor:'pointer'}, pointerEvents:'stroke'
  };
  if(entity.type==='line') return <line x1={entity.a.x} y1={-entity.a.y} x2={entity.b.x} y2={-entity.b.y} {...shared}/>;
  if(entity.type==='rectangle')return <rect x={Math.min(entity.a.x,entity.b.x)} y={-Math.max(entity.a.y,entity.b.y)}
    width={Math.abs(entity.b.x-entity.a.x)} height={Math.abs(entity.b.y-entity.a.y)} {...shared}/>;
  return <circle cx={entity.center.x} cy={-entity.center.y} r={entity.radius} {...shared}/>;
});

export default function CadWorkbench({workspace,visible,onDirtyChange}) {
  const [sketch,setSketch]=useState(initialCadSketch);
  const [revision,setRevision]=useState(null);
  const [dirty,setDirty]=useState(false);
  const [working,setWorking]=useState(false);
  const [loadError,setLoadError]=useState(false);
  const operationRef=useRef(false);
  const [inspectorWidth,setInspectorWidth]=useState(()=>{try{const n=Number(localStorage.getItem('of.cad.inspectorWidth.v1'));return n>=272&&n<=420?n:310;}catch{return 310;}});
  const resizeRef=useRef(null);
  const [tool,setTool]=useState('select');
  const [layerId,setLayerId]=useState('principal');
  const [selected,setSelected]=useState(null);
  const [from,setFrom]=useState(null);
  const [hover,setHover]=useState(null);
  const [measureStart,setMeasureStart]=useState(null);
  const [measureEnd,setMeasureEnd]=useState(null);
  const [pointerStore]=useState(()=>createCadPointer());
  useEffect(()=>()=>pointerStore.dispose(),[pointerStore]);
  const [status,setStatus]=useState('Abra um projeto para criar um desenho técnico.');
  const [view,setView]=useState({cx:0,cy:0,zoom:4});
  const [grid,setGrid]=useState(5);
  const [snapEnabled,setSnapEnabled]=useState(true);
  const [newLayerName,setNewLayerName]=useState('');
  const [editFields,setEditFields]=useState({});
  const [dimensions,setDimensions]=useState({w:800,h:500});
  const [undo,setUndo]=useState([]);
  const [redo,setRedo]=useState([]);
  const [showRecoveryJson,setShowRecoveryJson]=useState(false);
  const svgRef=useRef(null);
  const panRef=useRef(null);
  const viewRef=useRef(view);
  const activeLayer=sketch.layers.find(l=>l.id===layerId);
  const stats=useMemo(()=>cadStats(sketch),[sketch]);
  const layersById=useMemo(()=>new Map(sketch.layers.map(layer=>[layer.id,layer])),[sketch.layers]);
  const visibleEntities=useMemo(()=>sketch.entities.filter(e=>e.visible!==false&&layersById.get(e.layerId)?.visible),[sketch.entities,layersById]);
  const selectedEntity=sketch.entities.find(e=>e.id===selected);
  const vb=useMemo(()=>`${view.cx-dimensions.w/(2*view.zoom)} ${-view.cy-dimensions.h/(2*view.zoom)} ${dimensions.w/view.zoom} ${dimensions.h/view.zoom}`,[view,dimensions]);
  const setDirtyFlag=useCallback(value=>{setDirty(value);onDirtyChange?.(value);},[onDirtyChange]);
  const recovery=useCadRecovery({workspace,sketch,revision,dirty});
  const editBlocked=!workspace||working||loadError||Boolean(recovery.draft);
  const selectObject=useCallback(id=>{setSelected(id);const item=sketch.entities.find(e=>e.id===id);if(item)setLayerId(item.layerId);setTool('select');setFrom(null);setMeasureStart(null);setMeasureEnd(null);},[sketch.entities]);
  const selectFromCanvas=useCallback(id=>{if(tool==='select')selectObject(id);},[tool,selectObject]);

  // Undo may remove the active layer. Keep selection references in the restored document.
  useEffect(()=>{
    if(!sketch.layers.some(layer=>layer.id===layerId))setLayerId(sketch.layers[0].id);
    if(selected&&!sketch.entities.some(entity=>entity.id===selected))setSelected(null);
  },[sketch.layers,sketch.entities,layerId,selected]);
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
    setSelected(null);setFrom(null);setMeasureStart(null);setMeasureEnd(null);setUndo([]);setRedo([]);setSketch(initialCadSketch());setRevision(null);setDirtyFlag(false);
    setShowRecoveryJson(false);setLoadError(false);
    recovery.reset();
    if(!workspace){setStatus('Abra um projeto para habilitar o CAD.');return()=>{active=false;};}
    setWorking(true);
    Promise.all([window.omni.loadCadSketch(),recovery.open(workspace)]).then(([doc])=>{
      if(!active)return;
      setSketch(doc.sketch);setLayerId(doc.sketch.layers[0].id);setRevision(doc.revision);setStatus(doc.revision?'Desenho CAD carregado do projeto.':'Novo desenho. Nada foi alterado no disco.');
    }).catch(e=>{if(active){setLoadError(true);setStatus(`Não foi possível abrir CAD: ${e.message}`);}})
      .finally(()=>{if(active)setWorking(false);});
    return()=>{active=false;};
  },[workspace,setDirtyFlag,recovery.open,recovery.reset]);

  const record=useCallback(next=>{
    if(editBlocked||operationRef.current)return;
    setUndo(old=>[...old.slice(-(MAX_UNDO-1)),structuredClone(sketch)]);
    setRedo([]);setSketch(next);setDirtyFlag(true);
  },[sketch,setDirtyFlag,editBlocked]);
  const undoOnce=useCallback(()=>{
    if(editBlocked||operationRef.current||!undo.length)return;
    setRedo(old=>[...old.slice(-(MAX_UNDO-1)),structuredClone(sketch)]);
    setSketch(undo[undo.length-1]);setUndo(x=>x.slice(0,-1));setSelected(null);setDirtyFlag(true);
  },[undo,sketch,setDirtyFlag,editBlocked]);
  const redoOnce=useCallback(()=>{
    if(editBlocked||operationRef.current||!redo.length)return;
    setUndo(old=>[...old.slice(-(MAX_UNDO-1)),structuredClone(sketch)]);
    setSketch(redo[redo.length-1]);setRedo(x=>x.slice(0,-1));setSelected(null);setDirtyFlag(true);
  },[redo,sketch,setDirtyFlag,editBlocked]);
  const erase=useCallback(()=>{
    if(editBlocked||operationRef.current||!selected)return;
    try{record(deleteCadEntity(sketch,selected));setSelected(null);setStatus('Entidade removida do desenho.');}
    catch(e){setStatus(e.message);}
  },[selected,sketch,record,editBlocked]);
  useEffect(()=>{
    if(!visible)return;
    const handler=e=>{
      if(/input|textarea|select/i.test(e.target?.tagName||''))return;
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)redoOnce();else undoOnce();}
      else if((e.key==='Delete'||e.key==='Backspace')&&selected){e.preventDefault();erase();}
      else if(e.key==='Escape'){setFrom(null);setSelected(null);setMeasureStart(null);setMeasureEnd(null);setTool('select');}
      else if(!e.ctrlKey&&!e.metaKey&&!e.altKey){const next={v:'select',g:'pan',l:'line',r:'rectangle',c:'circle',d:'measure'}[e.key.toLowerCase()];if(next){e.preventDefault();setTool(next);setFrom(null);setMeasureStart(null);setMeasureEnd(null);}}
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
    if(editBlocked||operationRef.current||event.button===2)return;
    if(tool==='pan'||event.button===1){
      event.preventDefault();panRef.current={x:event.clientX,y:event.clientY,initial:viewRef.current};
      event.currentTarget.setPointerCapture(event.pointerId);return;
    }
    if(tool==='select'){
      if(!event.target.closest?.('[data-entity-id]'))setSelected(null);
      return;
    }
    if(tool==='measure'){
      const p=toSnapped(event);
      if(!measureStart||measureEnd){setMeasureStart(p);setMeasureEnd(null);setHover(null);setStatus('Medir: selecione o segundo ponto.');}
      else {const m=measureCadPoints(measureStart,p);setMeasureEnd(p);
        setStatus(`Distância ${m.distance} mm · ΔX ${m.dx} · ΔY ${m.dy} · ${m.angle}°`);}
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
    const p=toSnapped(event);pointerStore.update(p);if(from||(tool==='measure'&&measureStart&&!measureEnd))setHover(p);
  }
  function pointerUp(event){
    if(panRef.current){panRef.current=null;return;}
    if(editBlocked||operationRef.current){setFrom(null);setHover(null);return;}
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
  function fitDrawing(id){
    const object=typeof id==='string'?sketch.entities.find(e=>e.id===id):null;
    const bounds=cadBounds(object?{...sketch,entities:[object]}:sketch,{visibleOnly:!object});
    if(!bounds){setView({cx:0,cy:0,zoom:4});return;}
    const w=Math.max(1,bounds.maxX-bounds.minX),h=Math.max(1,bounds.maxY-bounds.minY);
    setView({cx:(bounds.minX+bounds.maxX)/2,cy:(bounds.minY+bounds.maxY)/2,
      zoom:clamp(Math.min(dimensions.w/(w*1.35),dimensions.h/(h*1.35)),0.1,60)});
    setStatus('Vista ajustada à geometria visível.');
  }
  function addLayerFromName(){
    if(editBlocked||operationRef.current)return;
    const name=newLayerName.trim();
    if(!name){setStatus('Informe um nome para a nova camada.');return;}
    const id='layer_'+crypto.randomUUID().replaceAll('-','').slice(0,12);
    const palette=['#C8515E','#A6A0A6','#965862','#D08F96','#706C73'];
    try {
      record(addCadLayer(sketch,{id,name,color:palette[sketch.layers.length%palette.length]}));
      setLayerId(id);setNewLayerName('');setStatus('Camada criada: '+name);
    } catch(e){setStatus(e.message);}
  }
  function deleteActiveLayer(){
    if(editBlocked||operationRef.current)return;
    try {
      const next=removeCadLayer(sketch,layerId);
      record(next);setLayerId(next.layers[0].id);setStatus('Camada vazia removida.');
    } catch(e){setStatus(e.message);}
  }
  function applyGeometry(){
    if(!selectedEntity||editBlocked||operationRef.current)return;
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
  function editIdentity(id,patch){
    if(editBlocked||operationRef.current)return;
    try{record(editCadIdentity(sketch,id,patch));if(patch.layerId)setLayerId(patch.layerId);setStatus('Propriedades do objeto atualizadas.');}catch(e){setStatus(e.message);}
  }
  function editLayer(id,patch){
    if(editBlocked||operationRef.current)return;
    try{record(editCadLayer(sketch,id,patch));setStatus('Camada atualizada.');}catch(e){setStatus(e.message);}
  }
  function duplicate(id){
    if(editBlocked||operationRef.current)return;
    try{const copyId=crypto.randomUUID();record(duplicateCadEntity(sketch,id,copyId));setSelected(copyId);setStatus('Objeto duplicado com deslocamento de 10 mm.');}catch(e){setStatus(e.message);}
  }
  function transform(id,values){
    if(editBlocked||operationRef.current)return;
    try{record(transformCadEntity(sketch,id,values));setStatus('Transformação aplicada.');}catch(e){setStatus(e.message);}
  }
  function resizeObject(id,values){
    if(editBlocked||operationRef.current)return;
    try{record(setCadDimensions(sketch,id,values));setStatus('Dimensões aplicadas.');}catch(e){setStatus(e.message);}
  }
  function technicalOperation(kind,id,values){
    if(editBlocked||operationRef.current)return;
    try{
      let next,selectedCopy=null;
      if(kind==='rotate')next=rotateCadEntity(sketch,id,values);
      else if(kind==='mirror')next=mirrorCadEntity(sketch,id,values);
      else if(kind==='offset'){selectedCopy=crypto.randomUUID();next=offsetCadLine(sketch,id,selectedCopy,values);}
      else if(kind==='array'){next=arrayCadEntity(sketch,id,values,()=>crypto.randomUUID());selectedCopy=next.entities.at(-1)?.id;}
      else throw new Error('Operação CAD desconhecida.');
      if(!selectedCopy && JSON.stringify(next.entities.find(e=>e.id===id))===JSON.stringify(sketch.entities.find(e=>e.id===id))){
        setStatus('A operação não alterou a geometria.');return;
      }
      record(next);if(selectedCopy)setSelected(selectedCopy);
      const labels={rotate:'Rotação',mirror:'Espelhamento',offset:'Paralela',array:'Matriz'};
      setStatus(labels[kind]+' aplicada em geometria real; use Salvar desenho para persistir.');
    }catch(e){setStatus('Operação recusada: '+e.message);}
  }
  function persistWidth(value){try{localStorage.setItem('of.cad.inspectorWidth.v1',String(value));}catch{}}
  function resizeStart(event){
    event.preventDefault();resizeRef.current={x:event.clientX,width:inspectorWidth};event.currentTarget.setPointerCapture(event.pointerId);
  }
  function resizeMove(event){if(!resizeRef.current)return;setInspectorWidth(clamp(resizeRef.current.width+resizeRef.current.x-event.clientX,272,420));}
  function resizeEnd(){if(resizeRef.current){resizeRef.current=null;persistWidth(inspectorWidth);}}
  function resizeKey(event){
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();
    const next=event.key==='Home'?272:event.key==='End'?420:clamp(inspectorWidth+(event.key==='ArrowLeft'?10:-10),272,420);setInspectorWidth(next);persistWidth(next);
  }
  function restoreCadDraft(){
    if(!workspace || working)return;
    const value=recovery.restore(revision);
    if(!value){setStatus('Restauração CAD bloqueada: revisão do disco divergente.');return;}
    setUndo([]);setRedo([]);setSelected(null);setFrom(null);
    setSketch(value);setLayerId(value.layers[0].id);setDirtyFlag(true);
    setShowRecoveryJson(false);
    setStatus('Rascunho restaurado somente na memória. Use Salvar desenho para persistir.');
  }
  async function discardCadDraft(){
    if(!workspace || working || !recovery.draft)return;
    if(!window.confirm('Descartar somente a cópia de recuperação CAD? O desenho salvo não será alterado.'))return;
    try{
      await recovery.discard(workspace);
      setShowRecoveryJson(false);
      setStatus('Cópia de recuperação CAD descartada; arquivo original preservado.');
    }catch(e){setStatus('Não foi possível descartar rascunho CAD: '+e.message);}
  }
  async function save(){
    if(!workspace||working||loadError||operationRef.current)return;
    if(recovery.draft){setStatus('Resolva o rascunho CAD pendente antes de salvar.');return;}
    operationRef.current=true;setWorking(true);
    try{
      await recovery.beforeSave(workspace);
      const result=await window.omni.saveCadSketch(sketch,revision);
      setRevision(result.revision);setDirtyFlag(false);setStatus(`Desenho salvo: ${result.path}`);
      await recovery.onSaved(workspace);
    }catch(e){setStatus(`Erro ao salvar: ${e.message}`);}finally{operationRef.current=false;setWorking(false);}
  }
  useEffect(()=>{
    if(!visible || !workspace)return;
    const shortcut=event=>{
      if(!(event.ctrlKey||event.metaKey) || event.altKey || event.key.toLowerCase()!=='s')return;
      event.preventDefault();
      if(event.repeat || working || !dirty)return;
      save();
    };
    window.addEventListener('keydown',shortcut);
    return ()=>window.removeEventListener('keydown',shortcut);
  },[visible,workspace,dirty,working,sketch,revision]);

  async function importDxf() {
    if (editBlocked || operationRef.current) return;
    if (dirty && !window.confirm('Importar DXF substitui o esboço atual ainda não salvo. Deseja continuar?')) return;
    operationRef.current=true;setWorking(true);
    try {
      const imported = await window.omni.importCadDxf();
      if (!imported) {
        setStatus('Importação cancelada. O desenho atual foi preservado.');
        return;
      }
      // The dialog/reader is read-only. Import changes only this editor buffer;
      // native save with the previous revision remains a separate user action.
      setUndo(old => [...old.slice(-(MAX_UNDO - 1)), structuredClone(sketch)]);
      setRedo([]);
      setSketch(imported.sketch);
      setDirtyFlag(true);
      setLayerId(imported.sketch.layers[0].id);
      setSelected(null);setFrom(null);setHover(null);setTool('select');
      const bounds = cadBounds(imported.sketch);
      if(bounds) {
        const w=Math.max(1,bounds.maxX-bounds.minX);
        const h=Math.max(1,bounds.maxY-bounds.minY);
        setView({
          cx:(bounds.minX+bounds.maxX)/2,
          cy:(bounds.minY+bounds.maxY)/2,
          zoom:clamp(Math.min(dimensions.w/(w*1.35),dimensions.h/(h*1.35)),0.1,60)
        });
      }
      const units = imported.meta.assumedMillimeters ? 'mm confirmados' :
        imported.meta.units + (imported.meta.scaleToMm!==1?' convertidos para mm':'');
      setStatus(`DXF importado: ${imported.sourceName} · ${imported.meta.entityCount} entidades · ${units}. Não salvo: use Salvar desenho.`);
    } catch(error) {
      setStatus('Importação DXF recusada: '+error.message);
    } finally {operationRef.current=false;setWorking(false);}
  }
  async function exportFormat(format){
    if(!workspace||working||loadError||operationRef.current)return;
    operationRef.current=true;setWorking(true);
    try{
      const result=await window.omni.exportCadSketch(format,sketch);
      setStatus(`Arquivo ${format.toUpperCase()} real exportado: ${result.relativePath} (${result.bytes} bytes).`);
    }catch(e){setStatus(`Erro na exportação: ${e.message}`);}finally{operationRef.current=false;setWorking(false);}
  }
  function toggleLayer(id,key){
    const next={...structuredClone(sketch),layers:sketch.layers.map(layer=>layer.id===id?{...layer,[key]:!layer[key]}:layer)};
    record(next);
  }
  const layerColor=id=>sketch.layers.find(l=>l.id===id)?.color||'#C8515E';
  const tip=tool==='line'?'Arraste do ponto inicial ao final para criar uma linha.':tool==='rectangle'?'Arraste para criar um retângulo com dimensões em mm.':tool==='circle'?'Arraste do centro até o raio do círculo.':tool==='measure'?'Clique em dois pontos para medir a distância (sem alterar o desenho).':tool==='pan'?'Arraste o desenho para mover a câmera.':'Clique em uma entidade para selecionar e medir.';
  const measureTarget=measureEnd||(tool==='measure'?hover:null);
  const measurement=measureStart&&measureTarget?measureCadPoints(measureStart,measureTarget):null;

  return <div className="cad-workbench" aria-label="OmniForge CAD 2D" data-testid="cad-workbench">
    <header className="cad-topbar">
      <div className="cad-heading"><strong>CAD <span>2D</span></strong></div>
      <div className="cad-context"><span data-testid="cad-entity-count">{stats.count}</span> objetos · mm {dirty?'• não salvo':''}</div>
      <div className="cad-top-actions">
        <button type="button" disabled={editBlocked} onClick={importDxf}
          className="cad-action cad-import-action" data-testid="cad-import-dxf" title="Importar LINE, CIRCLE e LWPOLYLINE reta do DXF ASCII">Importar DXF</button>
        <button type="button" disabled={editBlocked||!dirty} onClick={save} className="cad-action cad-primary" data-testid="cad-save">Salvar desenho</button>
        <button type="button" disabled={!workspace||working||loadError} onClick={()=>exportFormat('dxf')} className="cad-action">Exportar DXF</button>
        <button type="button" disabled={!workspace||working||loadError} onClick={()=>exportFormat('svg')} className="cad-action">Exportar SVG</button>
      </div>
    </header>
    {workspace && (recovery.draft || recovery.error ||
      (dirty && (recovery.status==='pending'||recovery.status==='saved'))) &&
      <section className={`cad-recovery ${recovery.draft && recovery.draft.baseRevision!==revision?'cad-recovery--conflict':''}`}
        aria-label="Recuperação de desenho CAD" data-testid={recovery.draft?'cad-recovery':undefined}>
        {recovery.draft ? <>
          <strong>{recovery.draft.baseRevision===revision?'Rascunho CAD recuperável':'Conflito: desenho CAD alterado externamente'}</strong>
          <span>{recovery.draft.baseRevision===revision
            ? 'Cópia temporária local disponível. Restaure ou descarte antes de editar; restaurar não grava no projeto.'
            : 'O arquivo CAD mudou desde o checkpoint. Restauração direta bloqueada; examine o JSON antes de descartar.'}</span>
          {recovery.draft.baseRevision===revision &&
            <button type="button" disabled={working} data-testid="cad-restore-draft" onClick={restoreCadDraft}>Restaurar no CAD</button>}
          <button type="button" disabled={working} onClick={discardCadDraft}>Descartar rascunho CAD</button>
          <button type="button" onClick={()=>setShowRecoveryJson(old=>!old)}>Visualizar JSON recuperável</button>
          {showRecoveryJson && <textarea aria-label="JSON do rascunho CAD" readOnly value={JSON.stringify(recovery.draft.sketch,null,2)} />}
        </> : recovery.error ? <span role="alert">{recovery.error}</span> :
          <span data-testid={recovery.status==='saved'?'cad-draft-saved':undefined}>
            {recovery.status==='saved'?'Rascunho CAD protegido no perfil local.':'Protegendo rascunho CAD...'}
          </span>}
      </section>}
    <div className="cad-body">
      <aside className="cad-tools" aria-label="Ferramentas CAD">

        {TOOLS.map(([id,icon,label])=><button key={id} title={label} aria-label={label} data-testid={`cad-tool-${id}`} className={`cad-tool ${tool===id?'is-active':''}`} disabled={editBlocked} onClick={()=>{setTool(id);setFrom(null);setHover(null);setMeasureStart(null);setMeasureEnd(null);}}><NavGlyph name={icon} size={19}/></button>)}
        <div className="cad-tools-separator"/>
        <button title="Desfazer" aria-label="Desfazer" disabled={editBlocked||!undo.length} className="cad-tool cad-tool-small" onClick={undoOnce}><NavGlyph name="undo" size={16}/></button>
        <button title="Refazer" aria-label="Refazer" disabled={editBlocked||!redo.length} className="cad-tool cad-tool-small" onClick={redoOnce}><NavGlyph name="redo" size={16}/></button>
        <button title="Excluir entidade" aria-label="Excluir entidade" disabled={editBlocked||!selected||Boolean(selectedEntity?.locked)||Boolean(layersById.get(selectedEntity?.layerId)?.locked)} className="cad-tool cad-tool-small" onClick={erase}><NavGlyph name="trash" size={16}/></button>
        <button title="Ajustar desenho à tela" aria-label="Ajustar desenho à tela" className="cad-tool cad-tool-small" onClick={()=>fitDrawing()}><NavGlyph name="focus" size={16}/></button>
      </aside>
      <section className="cad-center">
        {(!workspace||loadError)&&<div className="cad-overlay"><div className="cad-overlay-symbol">▱</div><strong>{loadError?'Desenho indisponível':'Nenhum projeto aberto'}</strong><p>{loadError?'Reabra o projeto para tentar novamente. O arquivo original foi preservado.':'Abra uma pasta pela barra superior.'}</p></div>}
        <div className="cad-view-settings"><label>Grade<select aria-label="Espaçamento da grade" value={grid} onChange={e=>setGrid(Number(e.target.value))}>{[1,5,10,25,50].map(n=><option key={n} value={n}>{n} mm</option>)}</select></label><label><input type="checkbox" checked={snapEnabled} onChange={e=>setSnapEnabled(e.target.checked)}/>Snap</label></div>
        <svg ref={svgRef} aria-label="Área de desenho CAD" data-testid="cad-canvas" className={`cad-canvas cad-canvas--${tool}`} role="application"
          viewBox={vb} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={()=>{panRef.current=null;setFrom(null);}} onWheel={zoomWheel}>
          <defs><pattern id="cad-grid" x="0" y="0" width={grid} height={grid} patternUnits="userSpaceOnUse"><path d={`M ${grid} 0 L 0 0 0 ${grid}`} fill="none" stroke="#27272b" strokeWidth={0.65} vectorEffect="non-scaling-stroke"/></pattern></defs>
          <rect x="-1000000" y="-1000000" width="2000000" height="2000000" fill="#111113"/>
          <rect x="-1000000" y="-1000000" width="2000000" height="2000000" fill="url(#cad-grid)"/>
          <line x1="-1000000" x2="1000000" y1="0" y2="0" stroke="#4a3a40" strokeWidth="1" vectorEffect="non-scaling-stroke"/>
          <line y1="-1000000" y2="1000000" x1="0" x2="0" stroke="#3b3b40" strokeWidth="1" vectorEffect="non-scaling-stroke"/>
          {visibleEntities.map(e=><CadShape key={e.id} entity={e} color={layerColor(e.layerId)} selected={e.id===selected} onSelect={selectFromCanvas}/>)}
          {from&&hover&&<g opacity="0.85" pointerEvents="none"><CadShape entity={{id:'preview',type:tool,layerId,a:from,b:hover,center:from,radius:Math.hypot(hover.x-from.x,hover.y-from.y)}} color="#C8515E" selected={false} onSelect={()=>{}}/></g>}
          {measureStart&&measureTarget&&<g pointerEvents="none" data-testid="cad-measure-overlay">
            <line x1={measureStart.x} y1={-measureStart.y} x2={measureTarget.x} y2={-measureTarget.y}
              stroke="#e6b9c0" strokeWidth={1.5/view.zoom} strokeDasharray={`${5/view.zoom} ${3/view.zoom}`}/>
            {[[measureStart.x,-measureStart.y],[measureTarget.x,-measureTarget.y]].map(([x,y],i)=><circle key={i} cx={x} cy={y} r={3/view.zoom} fill="#e6b9c0"/>)}
            <text x={(measureStart.x+measureTarget.x)/2} y={-(measureStart.y+measureTarget.y)/2-8/view.zoom}
              fill="#f5d7dc" fontSize={11/view.zoom} textAnchor="middle">{measurement.distance} mm</text>
          </g>}
          {visible&&workspace&&<CadPointerOverlay store={pointerStore} zoom={view.zoom}/>}
        </svg>
        {measurement&&<div className="cad-measure-summary" data-testid="cad-measure-result">
          {measurement.distance} mm <span>ΔX {measurement.dx} · ΔY {measurement.dy} · {measurement.angle}°</span>
        </div>}
        <div className="cad-viewport-help">{tip}</div>
        <div className="cad-viewport-zoom">{Math.round(view.zoom*25)}% <span>· Roda do mouse para zoom</span></div>
      </section>
      <div className="cad-panel-resize" role="separator" tabIndex={0} aria-label="Largura do inspetor CAD" aria-orientation="vertical"
        aria-valuemin={272} aria-valuemax={420} aria-valuenow={inspectorWidth} onPointerDown={resizeStart} onPointerMove={resizeMove} onPointerUp={resizeEnd} onPointerCancel={resizeEnd} onKeyDown={resizeKey}/>
      <aside className="cad-properties" style={{width:inspectorWidth,flexBasis:inspectorWidth}}>
        <CadOutliner sketch={sketch} selected={selected} layerId={layerId} disabled={editBlocked}
          onSelect={selectObject} onLayer={id=>{setLayerId(id);setSelected(null);}}
          onEntityFlag={(id,key,value)=>editIdentity(id,{[key]:value})} onLayerFlag={(id,key,value)=>editLayer(id,{[key]:value})}/>
        <CadInspector sketch={sketch} selected={selected} layerId={layerId} disabled={editBlocked}
          editFields={editFields} setEditFields={setEditFields} onGeometry={applyGeometry} onIdentity={editIdentity}
          onTransform={transform} onDimensions={resizeObject} onDuplicate={duplicate} onToolkit={technicalOperation} onFocus={fitDrawing} onLayerEdit={editLayer}
          newLayerName={newLayerName} setNewLayerName={setNewLayerName} onAddLayer={addLayerFromName}
          onRemoveLayer={deleteActiveLayer} stats={stats}/>
      </aside>
    </div>
    <footer className="cad-status" role="status"><span>{status}</span><CadCoordinates store={pointerStore}/></footer>
  </div>;
}
