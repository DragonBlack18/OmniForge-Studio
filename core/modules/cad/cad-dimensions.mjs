/** Per-object dimensions: closed-form measurements, invariants and presentation.
 * No solver or relationship between different CAD objects is implied.
 */
import {cadArcSweep} from './cad-arcs.mjs';

export const CAD_DIMENSION_LABELS=Object.freeze({
  length:'Comprimento',width:'Largura',height:'Altura',radius:'Raio',diameter:'Diâmetro'
});
const KINDS=Object.freeze({line:['length'],rectangle:['width','height'],circle:['radius','diameter'],arc:['radius']});
const round=n=>Number(n.toFixed(4));
const number=n=>typeof n==='number'&&Number.isFinite(n);
const point=(x,y)=>({x:round(x),y:round(y)});
const add=(p,u,d)=>point(p.x+u.x*d,p.y+u.y*d);
const format=n=>round(n).toLocaleString('pt-BR',{useGrouping:false,maximumFractionDigits:4});

export function cadDimensionKinds(entity){return [...(KINDS[entity?.type]||[])];}
export function cadDimensionMeasurement(entity,kind){
  if(!cadDimensionKinds(entity).includes(kind))throw new Error('Grandeza de cota incompatível com o objeto.');
  if(kind==='length')return Math.hypot(entity.b.x-entity.a.x,entity.b.y-entity.a.y);
  if(kind==='width')return Math.abs(entity.b.x-entity.a.x);
  if(kind==='height')return Math.abs(entity.b.y-entity.a.y);
  return entity.radius*(kind==='diameter'?2:1);
}
export function cadDimensionTolerance(kind,value){
  // Rotating quantized line endpoints can change their measured length slightly.
  // The relative cap keeps that allowance from swallowing very small objects.
  return kind==='length'?Math.min(0.00015,Math.abs(value)*0.001):1e-8;
}
export function validateCadDimensions(entity,{enforceFixed=true}={}){
  if(entity.dimensions===undefined)return;
  if(!Array.isArray(entity.dimensions)||entity.dimensions.length>2)
    throw new Error('Cotas CAD inválidas ou acima do limite por objeto.');
  const used=new Set(),allowed=cadDimensionKinds(entity);
  for(const dimension of entity.dimensions){
    if(!dimension||typeof dimension!=='object'||Array.isArray(dimension)||
       Object.keys(dimension).some(key=>!['kind','mode','value','offset'].includes(key))||
       !allowed.includes(dimension.kind)||!['reference','fixed'].includes(dimension.mode)||
       !number(dimension.offset)||Math.abs(dimension.offset)<0.0001||Math.abs(dimension.offset)>10000)
      throw new Error('Cota CAD inválida: verifique grandeza, modo e afastamento.');
    const family=['radius','diameter'].includes(dimension.kind)?'radial':dimension.kind;
    if(used.has(family))throw new Error('O objeto já possui uma cota para esta grandeza.');
    used.add(family);
    if(dimension.mode==='reference'){
      if(Object.hasOwn(dimension,'value'))throw new Error('Cota de referência calcula o valor diretamente da geometria.');
      continue;
    }
    const value=dimension.value;
    if(!number(value)||value<0.0001||value>3_000_000||Math.abs(value-round(value))>1e-9)
      throw new Error('Valor da cota fixa inválido; use milímetros positivos com até quatro casas decimais.');
    if(enforceFixed&&Math.abs(cadDimensionMeasurement(entity,dimension.kind)-value)>cadDimensionTolerance(dimension.kind,value))
      throw new Error(`Dimensão fixa de ${CAD_DIMENSION_LABELS[dimension.kind].toLocaleLowerCase('pt-BR')} (${format(value)} mm) seria alterada. Edite a cota ou mude para referência.`);
  }
}
export function hasCadDimensions(sketch){return sketch.entities.some(entity=>entity.dimensions?.length);}
export function cadDimensionLabel(entity,dimension){
  const value=dimension.mode==='fixed'?dimension.value:cadDimensionMeasurement(entity,dimension.kind);
  const prefix=dimension.kind==='radius'?'R ':dimension.kind==='diameter'?'Ø ':'';
  return prefix+format(value)+' mm';
}

/** Stable world-mm annotation shared by the SVG viewport and SVG export. */
export function cadDimensionLayout(entity,dimension){
  const lines=[],textHeight=3.5,label=cadDimensionLabel(entity,dimension);
  const halfWidth=label.length*textHeight*.34;
  const labelGap=normal=>halfWidth*Math.abs(normal.x)+textHeight/2*Math.abs(normal.y)+2;
  const line=(a,b)=>lines.push({a,b});
  const tick=(p,u,n)=>{
    const direction={x:(u.x+n.x)/Math.SQRT2,y:(u.y+n.y)/Math.SQRT2};
    line(add(p,direction,-1.5),add(p,direction,1.5));
  };
  let labelPoint;
  const offset=dimension.offset,side=offset<0?-1:1;
  const aligned=(a,b,n)=>{
    const length=Math.hypot(b.x-a.x,b.y-a.y),u={x:(b.x-a.x)/length,y:(b.y-a.y)/length};
    const from=add(a,n,offset),to=add(b,n,offset);
    line(add(a,n,side),add(from,n,side*1.5));line(add(b,n,side),add(to,n,side*1.5));
    line(from,to);tick(from,u,n);tick(to,u,n);
    labelPoint=add({x:(from.x+to.x)/2,y:(from.y+to.y)/2},n,side*labelGap(n));
  };
  if(dimension.kind==='length'){
    const length=cadDimensionMeasurement(entity,'length');
    aligned(entity.a,entity.b,{x:-(entity.b.y-entity.a.y)/length,y:(entity.b.x-entity.a.x)/length});
  }else if(dimension.kind==='width'){
    const y=offset>0?Math.max(entity.a.y,entity.b.y):Math.min(entity.a.y,entity.b.y);
    aligned({x:Math.min(entity.a.x,entity.b.x),y},{x:Math.max(entity.a.x,entity.b.x),y},{x:0,y:1});
  }else if(dimension.kind==='height'){
    const x=offset>0?Math.max(entity.a.x,entity.b.x):Math.min(entity.a.x,entity.b.x);
    aligned({x,y:Math.min(entity.a.y,entity.b.y)},{x,y:Math.max(entity.a.y,entity.b.y)},{x:1,y:0});
  }else{
    const angle=(entity.type==='arc'?entity.startAngle+cadArcSweep(entity)/2:45)*Math.PI/180;
    const u={x:Math.cos(angle),y:Math.sin(angle)},n={x:-u.y,y:u.x};
    const edge=add(entity.center,u,entity.radius),outside=add(edge,u,offset);
    const from=dimension.kind==='diameter'?add(entity.center,u,-entity.radius):entity.center;
    line(from,edge);line(edge,outside);tick(edge,u,n);
    if(dimension.kind==='diameter')tick(from,u,n);
    labelPoint=add(outside,n,side*labelGap(n));
  }
  const points=lines.flatMap(segment=>[segment.a,segment.b]);
  points.push({x:labelPoint.x-halfWidth,y:labelPoint.y-textHeight/2},
    {x:labelPoint.x+halfWidth,y:labelPoint.y+textHeight/2});
  return {kind:dimension.kind,mode:dimension.mode,label,lines,
    text:{...labelPoint,height:textHeight,width:halfWidth*2},
    bounds:{minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),
      minY:Math.min(...points.map(p=>p.y)),maxY:Math.max(...points.map(p=>p.y))}};
}
