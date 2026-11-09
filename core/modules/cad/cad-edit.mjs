/** Immutable CAD editing commands. All mutations pass the same persistence validator. */
import { validateCadSketch, addCadEntity, replaceCadEntity } from './cad2d.mjs';
import {cadArcExtrema,cadArcSweep} from './cad-arcs.mjs';
export const CAD_TYPE_LABELS=Object.freeze({line:'Linha',rectangle:'Retângulo',circle:'Círculo',arc:'Arco'});
const clone=value=>structuredClone(value);
const round=value=>Number(value.toFixed(4));
function numeric(value,label){
  if(typeof value!=='number'||!Number.isFinite(value))throw new Error(`${label}: valor numérico inválido.`);
  return value;
}
function existing(sketch,id){
  validateCadSketch(sketch);
  const entity=sketch.entities.find(e=>e.id===id);
  if(!entity)throw new Error('Objeto CAD não encontrado.');
  return entity;
}
function editable(sketch,entity){
  if(entity.locked||sketch.layers.find(l=>l.id===entity.layerId)?.locked)
    throw new Error('Objeto ou camada bloqueada para edição.');
}
export function cadEntityLabel(entity,index=0){return entity.name||`${CAD_TYPE_LABELS[entity.type]||'Objeto'} ${index+1}`;}
export function editCadIdentity(sketch,id,patch){
  const entity=existing(sketch,id);
  if(!patch||typeof patch!=='object'||Array.isArray(patch)||
    Object.keys(patch).some(k=>!['name','layerId','visible','locked'].includes(k)))
    throw new Error('Propriedade CAD não editável.');
  const keys=Object.keys(patch);
  const unlockOnly=keys.length===1&&keys[0]==='locked'&&patch.locked===false;
  if(sketch.layers.find(l=>l.id===entity.layerId)?.locked||entity.locked&&!unlockOnly)
    throw new Error('Objeto ou camada bloqueada para edição.');
  const next=clone(sketch), updated=next.entities.find(e=>e.id===id);
  if(patch.layerId!==undefined){
    const target=sketch.layers.find(l=>l.id===patch.layerId);
    if(!target||target.locked)throw new Error('Camada de destino inexistente ou bloqueada.');
  }
  Object.assign(updated,patch);
  if(typeof updated.name==='string')updated.name=updated.name.trim();
  validateCadSketch(next);return next;
}
export function editCadLayer(sketch,id,patch){
  validateCadSketch(sketch);
  if(!patch||typeof patch!=='object'||Array.isArray(patch)||
    Object.keys(patch).some(k=>!['name','color','visible','locked'].includes(k)))
    throw new Error('Propriedade de camada inválida.');
  const next=clone(sketch),layer=next.layers.find(l=>l.id===id);
  if(!layer)throw new Error('Camada não encontrada.');
  // Locked layers can be unlocked or hidden, but not renamed/recoloured implicitly.
  if(layer.locked && Object.keys(patch).some(k=>!['locked','visible'].includes(k)))
    throw new Error('Desbloqueie a camada antes de editar.');
  Object.assign(layer,patch);if(typeof layer.name==='string')layer.name=layer.name.trim();
  validateCadSketch(next);return next;
}
/** Scale around object centre, then translate; rectangle stays axis-aligned. */
export function transformCadEntity(sketch,id,{dx=0,dy=0,scale=1}={}){
  const entity=existing(sketch,id);editable(sketch,entity);
  numeric(dx,'Deslocamento X');numeric(dy,'Deslocamento Y');numeric(scale,'Escala');
  if(scale<.001||scale>1000)throw new Error('Escala deve estar entre 0,001 e 1.000.');
  const next=clone(entity);
  const centre=['circle','arc'].includes(entity.type)?entity.center:{x:(entity.a.x+entity.b.x)/2,y:(entity.a.y+entity.b.y)/2};
  const move=p=>({x:round(centre.x+(p.x-centre.x)*scale+dx),y:round(centre.y+(p.y-centre.y)*scale+dy)});
  if(['circle','arc'].includes(entity.type)){next.center=move(entity.center);next.radius=round(entity.radius*scale);}
  else{next.a=move(entity.a);next.b=move(entity.b);}
  return replaceCadEntity(sketch,next);
}
export function duplicateCadEntity(sketch,id,newId,{dx=10,dy=10}={}){
  const entity=existing(sketch,id);editable(sketch,entity);
  if(typeof newId!=='string'||!newId||sketch.entities.some(e=>e.id===newId))throw new Error('ID da cópia inválido ou duplicado.');
  const moved=transformCadEntity(sketch,id,{dx,dy}).entities.find(e=>e.id===id);
  const duplicate={...clone(moved),id:newId,locked:false,
    name:(cadEntityLabel(entity,sketch.entities.indexOf(entity))+' — cópia').slice(0,80)};
  return addCadEntity(sketch,duplicate);
}
export function cadGeometrySummary(entity){
  if(entity.type==='arc'){
    const points=cadArcExtrema(entity),xs=points.map(p=>p.x),ys=points.map(p=>p.y);
    return {width:round(Math.max(...xs)-Math.min(...xs)),height:round(Math.max(...ys)-Math.min(...ys)),angle:cadArcSweep(entity),x:entity.center.x,y:entity.center.y};
  }
  if(entity.type==='circle')return {width:round(entity.radius*2),height:round(entity.radius*2),angle:null,
    x:entity.center.x,y:entity.center.y};
  const dx=entity.b.x-entity.a.x,dy=entity.b.y-entity.a.y;
  return {width:round(Math.abs(dx)),height:round(Math.abs(dy)),
    angle:entity.type==='line'?round(Math.atan2(dy,dx)*180/Math.PI):null,
    x:Math.min(entity.a.x,entity.b.x),y:Math.min(entity.a.y,entity.b.y)};
}
/** Dimension-based editing is explicit: line length/angle, rectangle origin/size. */
export function setCadDimensions(sketch,id,values){
  const entity=existing(sketch,id);editable(sketch,entity);
  if(!values||typeof values!=='object')throw new Error('Dimensões inválidas.');
  const next=clone(entity);
  if(entity.type==='line'){
    const length=numeric(values.length,'Comprimento'),angle=numeric(values.angle,'Ângulo');
    if(length<.0001||length>2_000_000||Math.abs(angle)>360_000)throw new Error('Comprimento ou ângulo fora do limite.');
    const r=angle*Math.PI/180;
    next.b={x:round(entity.a.x+length*Math.cos(r)),y:round(entity.a.y+length*Math.sin(r))};
  }else if(entity.type==='rectangle'){
    const x=numeric(values.x,'X'),y=numeric(values.y,'Y');
    const width=numeric(values.width,'Largura'),height=numeric(values.height,'Altura');
    if(width<.0001||height<.0001)throw new Error('Largura e altura devem ser positivas.');
    next.a={x:round(x),y:round(y)};next.b={x:round(x+width),y:round(y+height)};
  }else throw new Error('Use centro e raio para editar círculos.');
  return replaceCadEntity(sketch,next);
}
