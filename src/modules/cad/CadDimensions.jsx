import React,{useEffect,useId,useRef,useState} from 'react';
import {CAD_DIMENSION_LABELS,cadDimensionKinds,cadDimensionMeasurement,cadDimensionLabel,cadDimensionLayout} from '../../../core/modules/cad/cad-dimensions.mjs';

const numeric=value=>String(value).trim()===''?NaN:Number(String(value).trim().replace(',','.'));
const display=value=>String(Number(value.toFixed(4)));

export default function CadDimensions({entity,disabled,onApply,onRemove}){
  const kinds=cadDimensionKinds(entity);
  const [kind,setKind]=useState(entity.dimensions?.[0]?.kind||kinds[0]),[mode,setMode]=useState('reference');
  const [value,setValue]=useState(''),[offset,setOffset]=useState('10'),[error,setError]=useState('');
  const [fieldErrors,setFieldErrors]=useState({});
  const formId=useId(),valueErrorId=formId+'-value-error',offsetErrorId=formId+'-offset-error';
  const valueRef=useRef(null),offsetRef=useRef(null),pendingFocus=useRef(null);
  const current=entity.dimensions?.find(item=>item.kind===kind);
  const radial=entity.dimensions?.find(item=>['radius','diameter'].includes(item.kind));
  useEffect(()=>{
    const existing=entity.dimensions?.find(item=>item.kind===kind);
    setMode(existing?.mode||'reference');
    setValue(display(existing?.mode==='fixed'?existing.value:cadDimensionMeasurement(entity,kind)));
    setOffset(String(existing?.offset??10));setError('');setFieldErrors({});pendingFocus.current=null;
  },[entity,kind]);
  useEffect(()=>{
    const target=pendingFocus.current;pendingFocus.current=null;
    if(target==='value')valueRef.current?.focus();
    if(target==='offset')offsetRef.current?.focus();
  },[fieldErrors]);
  const apply=event=>{
    event.preventDefault();
    if(disabled)return;
    const parsedValue=numeric(value),parsedOffset=numeric(offset),invalid={};
    if(mode==='fixed'&&(!Number.isFinite(parsedValue)||parsedValue<0.0001||parsedValue>3_000_000))
      invalid.value='Informe uma medida positiva entre 0,0001 e 3.000.000 mm.';
    else if(mode==='fixed'&&Math.abs(parsedValue-Number(parsedValue.toFixed(4)))>1e-9)
      invalid.value='Use até quatro casas decimais em milímetros.';
    if(!Number.isFinite(parsedOffset)||Math.abs(parsedOffset)<0.0001||Math.abs(parsedOffset)>10000)
      invalid.offset='Informe afastamento diferente de zero, entre −10.000 e 10.000 mm.';
    pendingFocus.current=invalid.value?'value':invalid.offset?'offset':null;
    setFieldErrors(invalid);setError('');
    if(Object.keys(invalid).length)return;
    const dimension={kind,mode,offset:parsedOffset,...(mode==='fixed'?{value:parsedValue}:{})};
    setError(onApply(entity.id,dimension)||'');
  };
  return <details className="cad-property-section cad-persistent-dimensions" open data-testid="cad-persistent-dimensions">
    <summary>Cotas persistentes <small>{entity.dimensions?.length||0} no objeto</small></summary>
    <div className="cad-dimension-list" aria-label="Cotas do objeto">
      {(entity.dimensions||[]).map(item=><div key={item.kind} className="cad-dimension-row" data-testid="cad-dimension-entry" data-kind={item.kind}>
        <button type="button" className="cad-dimension-select" aria-pressed={kind===item.kind} onClick={()=>setKind(item.kind)}>
          <span>{CAD_DIMENSION_LABELS[item.kind]} <small>{item.mode==='fixed'?'Fixa':'Referência'}</small></span>
          <strong>{cadDimensionLabel(entity,item)}</strong>
        </button>
        <button type="button" disabled={disabled} className="cad-dimension-remove" aria-label={'Remover cota '+CAD_DIMENSION_LABELS[item.kind]} onClick={()=>setError(onRemove(entity.id,item.kind)||'')}>×</button>
      </div>)}
    </div>
    <form noValidate className="cad-property-form" onSubmit={apply}>
      <label>Grandeza<select aria-label="Grandeza da cota" disabled={disabled} value={kind} onChange={event=>setKind(event.target.value)}>
        {kinds.map(item=><option key={item} value={item} disabled={Boolean(radial&&['radius','diameter'].includes(item)&&radial.kind!==item)}>{CAD_DIMENSION_LABELS[item]}</option>)}
      </select></label>
      <label>Comportamento<select aria-label="Comportamento da cota" data-testid="cad-dimension-mode" disabled={disabled} value={mode} onChange={event=>{setMode(event.target.value);setFieldErrors({});setError('');}}>
        <option value="reference">Referência · acompanha o objeto</option>
        <option value="fixed">Fixa · mantém a medida</option>
      </select></label>
      <div className="cad-fields-grid">
        <label>Valor (mm)<input ref={valueRef} aria-label="Valor da cota (mm)" data-testid="cad-dimension-value" type="number" step="any" disabled={disabled||mode==='reference'}
          aria-invalid={Boolean(fieldErrors.value)||undefined} aria-describedby={fieldErrors.value?valueErrorId:undefined}
          value={mode==='reference'?display(cadDimensionMeasurement(entity,kind)):value} onChange={event=>setValue(event.target.value)}/>
          {fieldErrors.value&&<span id={valueErrorId} className="cad-dimension-field-error">{fieldErrors.value}</span>}
        </label>
        <label>Afastamento (mm)<input ref={offsetRef} aria-label="Afastamento da cota (mm)" data-testid="cad-dimension-offset" type="number" step="any" disabled={disabled}
          aria-invalid={Boolean(fieldErrors.offset)||undefined} aria-describedby={fieldErrors.offset?offsetErrorId:undefined}
          value={offset} onChange={event=>setOffset(event.target.value)}/>
          {fieldErrors.offset&&<span id={offsetErrorId} className="cad-dimension-field-error">{fieldErrors.offset}</span>}
        </label>
      </div>
      <p className="cad-inline-note">{mode==='fixed'?'Alterar o valor aqui modifica a geometria. Edições incompatíveis são recusadas até liberar a cota.':'A medida acompanha a geometria e permanece no desenho salvo.'}</p>
      {mode==='fixed'&&<p className="cad-inline-note">{entity.type==='line'?'O ponto inicial permanece na mesma posição.':entity.type==='rectangle'?'O canto inicial permanece fixo. Largura e altura seguem os eixos X e Y.':'O centro permanece na mesma posição.'}</p>}
      <button type="submit" className="cad-primary" disabled={disabled} data-testid="cad-dimension-apply">{current?'Aplicar cota':'Adicionar cota'}</button>
      {error&&<p className="cad-dimension-error" role="alert">{error}</p>}
    </form>
  </details>;
}

export const CadDimensionAnnotations=React.memo(function CadDimensionAnnotations({entities,selected,onSelect}){
  return entities.flatMap(entity=>(entity.dimensions||[]).map(dimension=>{
    const annotation=cadDimensionLayout(entity,dimension),active=entity.id===selected;
    return <g key={entity.id+':'+dimension.kind} data-entity-id={entity.id} data-testid="cad-dimension-annotation"
      data-dimension-kind={dimension.kind} data-dimension-mode={dimension.mode}
      className={'cad-dimension-annotation'+(active?' is-selected':'')}
      onClick={event=>{event.stopPropagation();onSelect(entity.id);}}>
      <title>{CAD_DIMENSION_LABELS[dimension.kind]} · {annotation.label} · {dimension.mode==='fixed'?'Fixa':'Referência'}</title>
      {annotation.lines.map((segment,index)=><line key={index} x1={segment.a.x} y1={-segment.a.y} x2={segment.b.x} y2={-segment.b.y}
        fill="none" strokeWidth={active?1.15:.85} vectorEffect="non-scaling-stroke" pointerEvents="stroke"/>)}
      <text x={annotation.text.x} y={-annotation.text.y} fontSize={annotation.text.height} textAnchor="middle" dominantBaseline="middle" pointerEvents="all">{annotation.label}</text>
    </g>;
  }));
});
