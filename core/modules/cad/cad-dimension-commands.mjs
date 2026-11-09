/** Immutable dimension editing. Each command commits geometry and intent together. */
import {validateCadSketch,MAX_CAD_DOCUMENT_BYTES} from './cad2d.mjs';
import {cadDimensionMeasurement,validateCadDimensions} from './cad-dimensions.mjs';
const clone=value=>structuredClone(value);
const round=value=>Number(value.toFixed(4));

function writable(sketch,id){
  validateCadSketch(sketch);
  const entity=sketch.entities.find(item=>item.id===id);
  if(!entity)throw new Error('Objeto CAD não encontrado.');
  const layer=sketch.layers.find(item=>item.id===entity.layerId);
  if(entity.locked||layer.locked)throw new Error('Objeto ou camada bloqueada para edição de cotas.');
  return entity;
}
function drive(entity,kind,value){
  if(kind==='length'){
    const current=cadDimensionMeasurement(entity,kind),factor=value/current;
    entity.b={x:round(entity.a.x+(entity.b.x-entity.a.x)*factor),
      y:round(entity.a.y+(entity.b.y-entity.a.y)*factor)};
  }else if(kind==='width'){
    entity.b.x=round(entity.a.x+Math.sign(entity.b.x-entity.a.x)*value);
  }else if(kind==='height'){
    entity.b.y=round(entity.a.y+Math.sign(entity.b.y-entity.a.y)*value);
  }else entity.radius=round(value/(kind==='diameter'?2:1));
}

export function setCadDimension(sketch,id,dimension){
  const source=writable(sketch,id);
  if(!dimension||typeof dimension!=='object'||Array.isArray(dimension))throw new Error('Cota CAD inválida.');
  const next=clone(sketch),entity=next.entities.find(item=>item.id===id);
  const dimensions=entity.dimensions||[],index=dimensions.findIndex(item=>item.kind===dimension.kind);
  if(index<0)dimensions.push(clone(dimension));else dimensions[index]=clone(dimension);
  entity.dimensions=dimensions;
  validateCadDimensions(entity,{enforceFixed:false});
  if(dimension.mode==='fixed')drive(entity,dimension.kind,dimension.value);
  // v1 readers reject v2 instead of silently editing a constrained object.
  next.schemaVersion=2;
  validateCadSketch(next);
  if(new TextEncoder().encode(JSON.stringify(next,null,2)+'\n').byteLength>MAX_CAD_DOCUMENT_BYTES)
    throw new Error('Cotas excedem o limite de 1,5 MB do documento CAD.');
  // Source metadata remains opaque to this operation and is never reconstructed.
  if(source.source)entity.source=clone(source.source);
  return next;
}
export function removeCadDimension(sketch,id,kind){
  writable(sketch,id);
  const next=clone(sketch),entity=next.entities.find(item=>item.id===id);
  if(!entity.dimensions?.some(item=>item.kind===kind))throw new Error('Cota CAD não encontrada.');
  entity.dimensions=entity.dimensions.filter(item=>item.kind!==kind);
  if(!entity.dimensions.length)delete entity.dimensions;
  // Keep v2 after explicit removal: undo/recovery and the stored version stay clear.
  validateCadSketch(next);return next;
}

/** Only call after explicit geometry-only export intent. The source is untouched. */
export function cadGeometryOnlySketch(sketch){
  validateCadSketch(sketch);
  const next=clone(sketch);
  for(const entity of next.entities)delete entity.dimensions;
  next.schemaVersion=1;
  validateCadSketch(next);return next;
}
