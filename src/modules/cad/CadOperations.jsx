import React,{useEffect,useState} from 'react';

const cleanNumber=(raw)=>{const value=String(raw).trim();return value?Number(value.replace(',','.')):NaN;};
const modes=[
  {value:'rotate',label:'Rotacionar'},
  {value:'mirror',label:'Espelhar'},
  {value:'offset',label:'Criar paralela'},
  {value:'array',label:'Matriz retangular'}
];
/** One progressive technical inspector, not a second global toolbar. */
export default function CadOperations({entity,disabled,onApply}) {
  const [operation,setOperation]=useState('rotate');
  const [pivot,setPivot]=useState('center');
  const [angle,setAngle]=useState('90');
  const [axis,setAxis]=useState('x');
  const [distance,setDistance]=useState('10');
  const [side,setSide]=useState('left');
  const [rows,setRows]=useState('2');
  const [columns,setColumns]=useState('3');
  const [stepX,setStepX]=useState('50');
  const [stepY,setStepY]=useState('50');
  const [error,setError]=useState('');
  useEffect(()=>{setError('');setOperation('rotate');},[entity?.id]);
  if(!entity)return null;
  const mode=operation==='offset'&&entity.type!=='line'?'rotate':operation;
  const submit=e=>{
    e.preventDefault();setError('');
    const values=mode==='rotate'?{angle:cleanNumber(angle),pivot}:
      mode==='mirror'?{axis,pivot}:
      mode==='offset'?{distance:cleanNumber(distance),side}:
      {rows:cleanNumber(rows),columns:cleanNumber(columns),stepX:cleanNumber(stepX),stepY:cleanNumber(stepY)};
    if(Object.values(values).some(v=>typeof v==='number'&&!Number.isFinite(v))){
      setError('Revise os valores numéricos.');return;
    }
    if(mode==='array'&&(!Number.isInteger(values.rows)||!Number.isInteger(values.columns))){
      setError('Linhas e colunas devem ser números inteiros.');return;
    }
    onApply(mode,entity.id,values);
  };
  const field=(label,value,onChange,step='any')=><label key={label}>{label}
    <input type="number" step={step} value={value} onChange={e=>onChange(e.target.value)} disabled={disabled} aria-label={label}/>
  </label>;
  return <details className="cad-property-section cad-technical-operations" data-testid="cad-technical-operations">
    <summary>Operações geométricas <small>precisão em mm</small></summary>
    <form className="cad-property-form" onSubmit={submit}>
      <label>Operação<select aria-label="Operação geométrica CAD" value={mode} disabled={disabled}
        onChange={e=>{setOperation(e.target.value);setError('');}}>
        {modes.filter(item=>item.value!=='offset'||entity.type==='line')
          .map(item=><option value={item.value} key={item.value}>{item.label}</option>)}
      </select></label>
      {(mode==='rotate'||mode==='mirror')&&<label>Pivô<select aria-label="Pivô da operação CAD" value={pivot} disabled={disabled}
        onChange={e=>setPivot(e.target.value)}><option value="center">Centro do objeto</option><option value="origin">Origem (0, 0)</option></select></label>}
      {mode==='rotate'&&<div className="cad-fields-grid">{field('Ângulo de rotação (graus)',angle,setAngle)}</div>}
      {mode==='mirror'&&<label>Eixo de simetria<select aria-label="Eixo de simetria CAD" value={axis} disabled={disabled}
        onChange={e=>setAxis(e.target.value)}><option value="x">Horizontal (X)</option><option value="y">Vertical (Y)</option></select></label>}
      {mode==='offset'&&<><div className="cad-fields-grid">{field('Distância paralela (mm)',distance,setDistance)}</div>
        <label>Lado da linha<select aria-label="Lado da linha paralela" value={side} disabled={disabled}
          onChange={e=>setSide(e.target.value)}><option value="left">Esquerda</option><option value="right">Direita</option></select></label></>}
      {mode==='array'&&<div className="cad-fields-grid">
        {field('Linhas da matriz',rows,setRows,'1')}
        {field('Colunas da matriz',columns,setColumns,'1')}
        {field('Passo horizontal (mm)',stepX,setStepX)}
        {field('Passo vertical (mm)',stepY,setStepY)}
      </div>}
      <p className="cad-inline-note">{mode==='rotate'?
        (entity.type==='rectangle'?'O retângulo aceita rotações múltiplas de 90° para preservar seu formato 2D.':'Ângulo em graus, sentido anti-horário.'):
        mode==='mirror'?'Espelha a geometria sem duplicar o objeto.':
        mode==='offset'?'Cria uma linha paralela independente, sem alterar a original.':
        'A primeira posição é o próprio objeto. Até 64 novas cópias por operação.'}</p>
      {error&&<p role="alert" className="cad-inspector-error">{error}</p>}
      <button className="cad-primary" type="submit" disabled={disabled} data-testid="cad-operation-apply">
        {mode==='rotate'?'Aplicar rotação':mode==='mirror'?'Espelhar objeto':mode==='offset'?'Criar linha paralela':'Gerar matriz'}
      </button>
    </form>
  </details>;
}
