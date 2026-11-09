import React,{useEffect,useRef,useState} from 'react';
import {cadEntityMetrics} from '../../../core/modules/cad/cad2d.mjs';
import {cadEntityLabel,cadGeometrySummary,CAD_TYPE_LABELS} from '../../../core/modules/cad/cad-edit.mjs';
import {NavGlyph} from '../../shared/NavGlyph.jsx';
import CadOperations from './CadOperations.jsx';
const fmt=n=>Number(n.toFixed(4)).toLocaleString('pt-BR',{maximumFractionDigits:4});
export default function CadInspector({sketch,selected,layerId,disabled,editFields,setEditFields,onGeometry,onIdentity,onTransform,onDimensions,onDuplicate,onToolkit,onFocus,onLayerEdit,newLayerName,setNewLayerName,onAddLayer,onRemoveLayer,stats}){
  const panelRef=useRef(null);
  useEffect(()=>{if(panelRef.current)panelRef.current.scrollTop=0;},[selected]);
  const entity=sketch.entities.find(e=>e.id===selected);
  const layer=sketch.layers.find(l=>l.id===layerId);
  const objectLayer=sketch.layers.find(l=>l.id===entity?.layerId);
  const locked=disabled||Boolean(entity?.locked)||Boolean(objectLayer?.locked);
  const [name,setName]=useState(''),[layerName,setLayerName]=useState('');
  const [transform,setTransform]=useState({dx:'0',dy:'0',scale:'1'});
  const [localError,setLocalError]=useState('');
  const [geometryMode,setGeometryMode]=useState('coordinates');
  const [sizeFields,setSizeFields]=useState({});
  useEffect(()=>{if(!entity)return;const g=cadGeometrySummary(entity);setSizeFields({x:String(g.x),y:String(g.y),width:String(g.width),height:String(g.height),length:String(cadEntityMetrics(entity).length),angle:String(g.angle??0)});},[entity]);
  useEffect(()=>setGeometryMode('coordinates'),[selected]);
  useEffect(()=>{setName(entity?cadEntityLabel(entity,sketch.entities.indexOf(entity)):'');setLocalError('');setTransform({dx:'0',dy:'0',scale:'1'});},[entity]);
  useEffect(()=>{setLayerName(layer?.name||'');},[layer?.name,layer?.id]);
  const applyName=()=>{
    if(locked||!entity||name===cadEntityLabel(entity,sketch.entities.indexOf(entity)))return;
    if(!name.trim()){setLocalError('Informe um nome para o objeto.');return;}
    onIdentity(entity.id,{name});
  };
  const applyTransform=e=>{
    e.preventDefault();
    const parsed=Object.fromEntries(Object.entries(transform).map(([k,v])=>[k,String(v).trim()===''?NaN:Number(String(v).replace(',','.'))]));
    if(Object.values(parsed).some(v=>!Number.isFinite(v))){setLocalError('Informe valores numéricos válidos.');return;}
    onTransform(entity.id,parsed);setLocalError('');
  };
  const measures=entity?cadEntityMetrics(entity):null;
  const geometry=entity?cadGeometrySummary(entity):null;
  const roundGeometry=entity&&['circle','arc'].includes(entity.type);
  const coordinateFields=roundGeometry?[['cx','Centro X'],['cy','Centro Y'],['radius','Raio'],
    ...(entity.type==='arc'?[['startAngle','Ângulo inicial'],['endAngle','Ângulo final']]:[])]:[['ax','X inicial'],['ay','Y inicial'],['bx','X final'],['by','Y final']];
  return <section ref={panelRef} className="cad-inspection" aria-label="Propriedades CAD">
    <header className="cad-section-heading"><span>Propriedades</span><small>{entity?CAD_TYPE_LABELS[entity.type]:'Documento'}</small></header>
    {entity?<>
      <div className="cad-property-form">
        <label>Nome<input aria-label="Nome do objeto" maxLength={80} disabled={locked} value={name} onChange={e=>setName(e.target.value)} onBlur={applyName}
          onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();applyName();}}}/></label>
        <label>Camada<select aria-label="Camada do objeto" disabled={locked} value={entity.layerId} onChange={e=>onIdentity(entity.id,{layerId:e.target.value})}>
          {sketch.layers.map(l=><option value={l.id} key={l.id} disabled={l.locked}>{l.name}{l.locked?' · bloqueada':''}</option>)}</select></label>
        <div className="cad-object-actions"><button type="button" disabled={locked} onClick={()=>onDuplicate(entity.id)} data-testid="cad-duplicate"><NavGlyph name="duplicate" size={14}/>Duplicar</button>
          <button type="button" onClick={()=>onFocus(entity.id)}><NavGlyph name="focus" size={14}/>Enquadrar</button></div>
        {locked&&!disabled&&<p className="cad-inline-note"><NavGlyph name="lock" size={12}/>Objeto ou camada bloqueada.</p>}
        {entity.visible===false&&<p className="cad-inline-note">Objeto oculto; não será exportado.</p>}
      </div>
      <details className="cad-property-section" open><summary>Geometria <small>mm</small></summary>
        <form noValidate onSubmit={e=>{e.preventDefault();if(geometryMode==='coordinates'||roundGeometry)onGeometry();else {const values=Object.fromEntries(Object.entries(sizeFields).map(([k,v])=>[k,String(v).trim()===''?NaN:Number(v)]));onDimensions(entity.id,values);}}} className="cad-property-form">
          {!roundGeometry&&<label>Método<select aria-label="Método de edição geométrica" value={geometryMode} onChange={e=>setGeometryMode(e.target.value)}><option value="coordinates">Coordenadas</option><option value="dimensions">{entity.type==='line'?'Comprimento e ângulo':'Posição e tamanho'}</option></select></label>}
          <div className="cad-fields-grid">
            {(roundGeometry||geometryMode==='coordinates'?coordinateFields:[]).map(([key,label])=>
              <label key={key}>{label}<input aria-label={label+(key.endsWith('Angle')?' (graus)':' (mm)')} type="number" step="any" disabled={locked} value={editFields[key]??''} onChange={e=>setEditFields(old=>({...old,[key]:e.target.value}))}/></label>)}
            {geometryMode==='dimensions'&&!roundGeometry&&(entity.type==='line'?[['length','Comprimento (mm)'],['angle','Ângulo (graus)']]:[['x','Posição X (mm)'],['y','Posição Y (mm)'],['width','Largura (mm)'],['height','Altura (mm)']]).map(([key,label])=><label key={key}>{label}<input aria-label={label} type="number" step="any" disabled={locked} value={sizeFields[key]??''} onChange={e=>setSizeFields(old=>({...old,[key]:e.target.value}))}/></label>)}
          </div>
          {entity.type==='arc'&&<p className="cad-inline-note">Ângulos em graus, sentido anti-horário. O arco mantém seu raio ao editar os extremos.</p>}
          <button type="submit" className="cad-primary" disabled={locked} data-testid="cad-apply-geometry">{geometryMode==='coordinates'?'Aplicar coordenadas':'Aplicar dimensões'}</button>
        </form>
      </details>
      <details className="cad-property-section"><summary>Transformar</summary>
        <form noValidate className="cad-property-form" onSubmit={applyTransform}><div className="cad-fields-grid">
          {[['dx','Deslocamento X (mm)'],['dy','Deslocamento Y (mm)'],['scale','Escala uniforme']].map(([key,label])=><label key={key}>{label}<input aria-label={label} type="number" step="any" disabled={locked} value={transform[key]} onChange={e=>setTransform(old=>({...old,[key]:e.target.value}))}/></label>)}
        </div><p className="cad-inline-note">Escala a partir do centro do objeto.</p><button type="submit" disabled={locked}>Aplicar transformação</button></form>
      </details>
      <CadOperations key={entity.id} entity={entity} disabled={locked} onApply={onToolkit}/>
      <details className="cad-property-section" open><summary>Medições</summary><dl className="cad-measurements">
        <dt>{['line','arc'].includes(entity.type)?'Comprimento':'Perímetro'}</dt><dd data-testid="cad-measure-length">{fmt(measures.length)} mm</dd>
        {['circle','rectangle'].includes(entity.type)&&<><dt>Área</dt><dd>{fmt(measures.area)} mm²</dd></>}
        <dt>{entity.type==='circle'?'Diâmetro':'Largura'}</dt><dd>{fmt(geometry.width)} mm</dd>
        {entity.type!=='circle'&&<><dt>Altura</dt><dd>{fmt(geometry.height)} mm</dd></>}
        {geometry.angle!==null&&<><dt>{entity.type==='arc'?'Abertura':'Ângulo'}</dt><dd>{fmt(geometry.angle)}°</dd></>}
      </dl></details>
      <details className="cad-property-section"><summary>Identificação</summary><code className="cad-object-id">{entity.id}</code></details>
      {entity.source&&<details className="cad-property-section cad-source-inspection" open={entity.source.blockPath.length>0} data-testid="cad-source-inspector"><summary>Origem DXF</summary>
        <dl className="cad-measurements"><dt>Entidade original</dt><dd>{entity.source.entityType}</dd>
          {entity.source.handle&&<><dt>Handle original</dt><dd>{entity.source.handle}</dd></>}
          {entity.source.blockPath.length>0&&<><dt>Bloco original</dt><dd data-testid="cad-source-block">{entity.source.blockPath.join(' › ')}</dd>
            <dt>Instância importada</dt><dd>{entity.source.insertPath.join(' / ')}</dd>
            <dt>Objetos desta origem</dt><dd>{sketch.entities.filter(item=>item.source?.insertPath?.join('/')===entity.source.insertPath.join('/')).length}</dd></>}
        </dl>
        {entity.source.blockPath.length>0&&<p className="cad-inline-note">Convertido em objeto independente. Editar este objeto não altera outras instâncias do bloco. A origem é preservada no desenho OmniForge; a exportação DXF é desagrupada.</p>}
      </details>}
    </>:<div className="cad-property-form"><dl className="cad-measurements"><dt>Unidade</dt><dd>Milímetro</dd><dt>Objetos</dt><dd>{stats.count}</dd><dt>Visíveis</dt><dd>{stats.visible}</dd></dl><p className="cad-inline-note">Selecione um objeto na vista ou na árvore.</p></div>}
    <details className="cad-property-section" open={!entity} key={entity?'layer-collapsed':'layer-open'}><summary>Camada ativa <small>{sketch.layers.find(l=>l.id===layerId)?.name}</small></summary>
      <div className="cad-property-form">
        <label>Nome da camada<input aria-label="Nome da camada ativa" maxLength={60} value={layerName} disabled={disabled||layer?.locked} onChange={e=>setLayerName(e.target.value)} onBlur={()=>{if(layerName!==layer?.name)onLayerEdit(layer.id,{name:layerName});}}/></label>
        <label className="cad-color-field">Cor<input type="color" aria-label="Cor da camada" value={layer?.color||'#C8515E'} disabled={disabled||layer?.locked} onChange={e=>onLayerEdit(layer.id,{color:e.target.value})}/></label>
        <button type="button" disabled={disabled||sketch.layers.length<=1||layer?.locked} onClick={onRemoveLayer}>Remover camada vazia</button>
      </div>
    </details>
    <form noValidate className="cad-add-layer" onSubmit={e=>{e.preventDefault();onAddLayer();}}>
      <input aria-label="Nome da nova camada" placeholder="Nova camada" maxLength={60} disabled={disabled} value={newLayerName} onChange={e=>setNewLayerName(e.target.value)}/>
      <button type="submit" disabled={disabled||sketch.layers.length>=32}>+ Criar</button>
    </form>
    {localError&&<p className="cad-inspector-error" role="alert">{localError}</p>}
  </section>;
}
