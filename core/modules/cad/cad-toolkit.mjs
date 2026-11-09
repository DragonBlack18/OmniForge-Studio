/** OmniForge CAD 2D — deterministic, immutable technical editing commands.
 * Metric coordinates, axis-aligned rectangle representation and v1 schema stay
 * unchanged. No implicit disk writes or third-party CAD engine is involved.
 */
import { validateCadSketch } from './cad2d.mjs';
import { cadEntityLabel } from './cad-edit.mjs';
import {normalizeCadAngle} from './cad-arcs.mjs';

const round = n => Number(n.toFixed(4));
const clone = data => structuredClone(data);
const MAX_COORD = 1_000_000;
const MAX_ENTITIES = 2000;
const MAX_COPIES = 64;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
function finite(n, label, limit = MAX_COORD) {
  if(typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n)>limit)
    throw new Error(`${label}: número inválido ou fora dos limites.`);
  return n;
}
function writable(sketch, id) {
  validateCadSketch(sketch);
  const entity=sketch.entities.find(item=>item.id===id);
  if(!entity)throw new Error('Objeto CAD não encontrado.');
  const layer=sketch.layers.find(item=>item.id===entity.layerId);
  if(entity.locked || layer.locked || !layer.visible || entity.visible===false)
    throw new Error('Objeto ou camada bloqueada/oculta; edição não autorizada.');
  return entity;
}
function centre(entity) {
  return ['circle','arc'].includes(entity.type)? entity.center : {
    x:(entity.a.x+entity.b.x)/2, y:(entity.a.y+entity.b.y)/2
  };
}
function coords(entity, transform, isQuarterTurn=false) {
  const output=clone(entity);
  if(entity.type==='circle'||entity.type==='arc') {
    output.center=transform(entity.center);
  } else if(entity.type==='rectangle' && isQuarterTurn) {
    // The v1 rectangle stores only opposite axis-aligned corners.
    // Rotating by a multiple of 90 degrees preserves that representation.
    const a={x:Math.min(entity.a.x,entity.b.x),y:Math.min(entity.a.y,entity.b.y)};
    const b={x:Math.max(entity.a.x,entity.b.x),y:Math.max(entity.a.y,entity.b.y)};
    const pts=[a,{x:a.x,y:b.y},b,{x:b.x,y:a.y}].map(transform);
    output.a={x:Math.min(...pts.map(p=>p.x)),y:Math.min(...pts.map(p=>p.y))};
    output.b={x:Math.max(...pts.map(p=>p.x)),y:Math.max(...pts.map(p=>p.y))};
  } else { output.a=transform(entity.a);output.b=transform(entity.b); }
  return output;
}
function replace(sketch,id,nextEntity) {
  const next=clone(sketch);
  const index=next.entities.findIndex(e=>e.id===id);
  next.entities[index]=nextEntity;
  validateCadSketch(next);
  return next;
}
function newEntity(sketch,source,entity,newId) {
  if(typeof newId!=='string' || !ID.test(newId) || sketch.entities.some(e=>e.id===newId))
    throw new Error('Identificador CAD de cópia inválido ou repetido.');
  return {...entity,id:newId,locked:false,name:(cadEntityLabel(source)+' — cópia').slice(0,80)};
}
function validateRotation(angle, entity) {
  finite(angle,'Rotação',360_000);
  if(entity.type==='rectangle' && Math.abs(angle/90-Math.round(angle/90))>1e-9)
    throw new Error('Retângulos do CAD 2D aceitam rotação somente de 90° em 90°.');
}
/** Rotate about object centre or world origin; line supports arbitrary angles. */
export function rotateCadEntity(sketch,id,{angle=0,pivot='center'}={}) {
  const entity=writable(sketch,id);
  if(!['center','origin'].includes(pivot))throw new Error('Pivô CAD inválido.');
  validateRotation(angle,entity);
  const c=pivot==='center'?centre(entity):{x:0,y:0};
  const radians=((angle%360)*Math.PI)/180;
  const co=Math.cos(radians),si=Math.sin(radians);
  const move=p=>({x:round(c.x+(p.x-c.x)*co-(p.y-c.y)*si),
    y:round(c.y+(p.x-c.x)*si+(p.y-c.y)*co)});
  const rotated=coords(entity,move,entity.type==='rectangle');
  if(entity.type==='arc'){
    rotated.startAngle=normalizeCadAngle(entity.startAngle+angle);
    rotated.endAngle=normalizeCadAngle(entity.endAngle+angle);
  }
  return replace(sketch,id,rotated);
}
/** Reflect over the horizontal (X) or vertical (Y) axis through pivot. */
export function mirrorCadEntity(sketch,id,{axis='x',pivot='center'}={}) {
  const entity=writable(sketch,id);
  if(!['x','y'].includes(axis)||!['center','origin'].includes(pivot))
    throw new Error('Eixo ou pivô de espelhamento inválido.');
  const c=pivot==='center'?centre(entity):{x:0,y:0};
  const move=p=>({x:round(axis==='y'?2*c.x-p.x:p.x),
    y:round(axis==='x'?2*c.y-p.y:p.y)});
  const mirrored=coords(entity,move,entity.type==='rectangle');
  if(entity.type==='arc'){
    // Reflection reverses orientation, so reverse endpoints to retain CCW arcs.
    mirrored.startAngle=normalizeCadAngle(axis==='x'?-entity.endAngle:180-entity.endAngle);
    mirrored.endAngle=normalizeCadAngle(axis==='x'?-entity.startAngle:180-entity.startAngle);
  }
  return replace(sketch,id,mirrored);
}
/** Create a truly parallel segment at a signed side of the original line. */
export function offsetCadLine(sketch,id,newId,{distance,side='left'}={}) {
  const entity=writable(sketch,id);
  if(entity.type!=='line')throw new Error('Paralela disponível apenas para linhas.');
  if(!['left','right'].includes(side))throw new Error('Lado da paralela inválido.');
  finite(distance,'Distância da paralela');
  if(distance<0.0001)throw new Error('Distância da paralela precisa ser positiva.');
  if(sketch.entities.length>=MAX_ENTITIES)throw new Error('Limite de 2.000 objetos CAD atingido.');
  const dx=entity.b.x-entity.a.x,dy=entity.b.y-entity.a.y,len=Math.hypot(dx,dy);
  if(len<0.0001)throw new Error('Linha sem comprimento para offset.');
  const sign=side==='left'?1:-1;
  const step={x:-dy/len*distance*sign,y:dx/len*distance*sign};
  const move=p=>({x:round(p.x+step.x),y:round(p.y+step.y)});
  const added=newEntity(sketch,entity,coords(entity,move),newId);
  const next={...clone(sketch),entities:[...clone(sketch.entities),added]};
  validateCadSketch(next);return next;
}
/** Parallel line or concentric circle/arc; never mutates the source geometry. */
export function offsetCadEntity(sketch,id,newId,{distance,side='left'}={}) {
  const entity=writable(sketch,id);
  if(entity.type==='line')return offsetCadLine(sketch,id,newId,{distance,side});
  if(!['circle','arc'].includes(entity.type))throw new Error('Offset disponível para linhas, círculos e arcos.');
  if(!['outward','inward'].includes(side))throw new Error('Direção do offset circular inválida.');
  finite(distance,'Distância do offset');
  if(distance<0.0001)throw new Error('Distância do offset precisa ser positiva.');
  if(sketch.entities.length>=MAX_ENTITIES)throw new Error('Limite de 2.000 objetos CAD atingido.');
  const radius=round(entity.radius+(side==='outward'?distance:-distance));
  if(radius<0.0001)throw new Error('Offset interno excede o raio do objeto.');
  const added=newEntity(sketch,entity,{...clone(entity),radius},newId);
  const next={...clone(sketch),entities:[...clone(sketch.entities),added]};
  validateCadSketch(next);return next;
}
/** All-or-nothing rectangular array; base object occupies [0,0]. */
export function arrayCadEntity(sketch,id,{rows=1,columns=2,stepX=10,stepY=10}={},idFactory=()=>crypto.randomUUID()) {
  const entity=writable(sketch,id);
  if(!Number.isInteger(rows)||!Number.isInteger(columns)||rows<1||columns<1||rows>16||columns>16)
    throw new Error('A matriz aceita de 1 a 16 linhas e colunas.');
  const copies=rows*columns-1;
  if(copies<1||copies>MAX_COPIES)throw new Error('A matriz aceita de 1 a 64 cópias.');
  if(sketch.entities.length+copies>MAX_ENTITIES)throw new Error('Limite de 2.000 objetos CAD atingido.');
  finite(stepX,'Passo X');finite(stepY,'Passo Y');
  if(columns>1&&Math.abs(stepX)<0.0001 || rows>1&&Math.abs(stepY)<0.0001)
    throw new Error('O espaçamento deve ser diferente de zero no eixo repetido.');
  if(typeof idFactory!=='function')throw new Error('Gerador de IDs CAD inválido.');
  const known=new Set(sketch.entities.map(e=>e.id)), additions=[];
  const baseName=cadEntityLabel(entity);
  for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
    if(row===0&&column===0)continue;
    const newId=idFactory();
    if(typeof newId!=='string'||!ID.test(newId)||known.has(newId))
      throw new Error('Identificador CAD da matriz inválido ou repetido.');
    known.add(newId);
    const dx=column*stepX;
    const dy=row*stepY;
    const moved=coords(entity,p=>({x:round(p.x+dx),y:round(p.y+dy)}));
    additions.push({...moved,id:newId,locked:false,
      name:(baseName+` [${row+1},${column+1}]`).slice(0,80)});
  }
  const next={...clone(sketch),entities:[...clone(sketch.entities),...additions]};
  validateCadSketch(next);return next;
}
/** Read-only point-to-point inspection, not a dimension constraint. */
export function measureCadPoints(a,b) {
  if(!a||!b||typeof a!=='object'||typeof b!=='object')throw new Error('Pontos de medição inválidos.');
  const ax=finite(a.x,'Ponto A X'),ay=finite(a.y,'Ponto A Y');
  const bx=finite(b.x,'Ponto B X'),by=finite(b.y,'Ponto B Y');
  const dx=bx-ax,dy=by-ay;
  return {dx:round(dx),dy:round(dy),distance:round(Math.hypot(dx,dy)),
    angle:round(Math.atan2(dy,dx)*180/Math.PI)};
}
