/** OmniForge CAD Sketch v1/v2 — deterministic 2D geometry and local dimensions.
 * Coordinates are real millimetres with Y increasing upwards.
 * Analytic arcs belong to v1; persistent dimensions explicitly promote to v2.
 */
import {cadArcExtrema,cadArcPoint,cadArcSweep,cadArcPath,normalizeCadAngle} from './cad-arcs.mjs';
import {validateCadDimensions,cadDimensionLayout,hasCadDimensions} from './cad-dimensions.mjs';

const MAX_COORD = 1_000_000;
const MAX_ENTITIES = 2000;
const MAX_LAYERS = 32;
export const MAX_CAD_DOCUMENT_BYTES = 1_500_000;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const KINDS = new Set(['line', 'circle', 'rectangle', 'arc']);
const round = n => Number(n.toFixed(4));

function finite(n, label) {
  if (typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > MAX_COORD) {
    throw new Error(`${label}: coordenada inválida ou fora de ±1.000.000 mm.`);
  }
  return n;
}
function point(p, label = 'Ponto') {
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error(`${label} inválido.`);
  return { x: round(finite(p.x, label)), y: round(finite(p.y, label)) };
}
function same(a,b) { return Math.hypot(a.x-b.x, a.y-b.y) < 1e-6; }
function fmt(n) { return String(round(n)); }
function clone(value) { return structuredClone(value); }

export function initialCadSketch() {
  return { schemaVersion: 1, name: 'Desenho técnico', units: 'mm', layers: [
    { id: 'principal', name: 'Principal', color: '#C8515E', visible: true, locked: false },
    { id: 'construcao', name: 'Construção', color: '#989398', visible: true, locked: false }
  ], entities: [] };
}

/** All serialized data is checked on both input and output boundaries. */
export function validateCadSketch(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || ![1,2].includes(raw.schemaVersion) || raw.units !== 'mm' ||
      typeof raw.name !== 'string' || raw.name.length > 100 || !Array.isArray(raw.layers) ||
      !raw.layers.length || raw.layers.length > MAX_LAYERS || !Array.isArray(raw.entities) ||
      raw.entities.length > MAX_ENTITIES) throw new Error('Documento CAD incompatível ou excede os limites.');
  const layers = new Set();
  const entities = new Set();
  for (const layer of raw.layers) {
    if (!layer || !ID.test(layer.id) || layers.has(layer.id) || typeof layer.name !== 'string' ||
        !layer.name.trim() || layer.name.length > 60 || !COLOR.test(layer.color) ||
        typeof layer.visible !== 'boolean' || typeof layer.locked !== 'boolean') throw new Error('Camada CAD inválida ou duplicada.');
    layers.add(layer.id);
  }
  for (const entity of raw.entities) {
    if (!entity || !ID.test(entity.id) || entities.has(entity.id) || !KINDS.has(entity.type) || !layers.has(entity.layerId)) {
      throw new Error('Entidade CAD inválida, duplicada ou sem camada.');
    }
    if (entity.name !== undefined && (typeof entity.name !== 'string' || !entity.name.trim() ||
        entity.name.length>80 || /[\u0000-\u001f\u007f]/.test(entity.name))) throw new Error('Nome do objeto CAD inválido.');
    for (const key of ['visible','locked']) if (entity[key] !== undefined && typeof entity[key] !== 'boolean')
      throw new Error('Estado do objeto CAD inválido.');
    if(raw.schemaVersion===1&&entity.dimensions!==undefined)
      throw new Error('Cotas persistentes exigem documento CAD versão 2.');
    if(entity.source!==undefined){
      const source=entity.source;
      if(!source||typeof source!=='object'||Array.isArray(source)||source.format!=='DXF'||
        Object.keys(source).some(key=>!['format','entityType','handle','blockPath','insertPath'].includes(key))||
        !['LINE','CIRCLE','ARC','LWPOLYLINE'].includes(source.entityType)||
        (source.handle!==undefined&&(typeof source.handle!=='string'||!/^[A-Fa-f0-9]{1,64}$/.test(source.handle))))
        throw new Error('Proveniência DXF inválida.');
      if(!Array.isArray(source.blockPath)||!Array.isArray(source.insertPath)||source.blockPath.length!==source.insertPath.length||source.blockPath.length>8||
        source.blockPath.some(name=>typeof name!=='string'||!name.trim()||name.length>128||/[\u0000-\u001f\u007f]/.test(name))||
        source.insertPath.some(id=>typeof id!=='string'||!ID.test(id)))throw new Error('Proveniência de bloco DXF inválida.');
    }
    entities.add(entity.id);
    if (entity.type === 'circle' || entity.type === 'arc') {
      point(entity.center, 'Centro');
      if (typeof entity.radius !== 'number' || !Number.isFinite(entity.radius) || entity.radius < 0.0001 || entity.radius > MAX_COORD) throw new Error('Raio CAD inválido.');
      if(entity.type==='arc') {
        for(const key of ['startAngle','endAngle'])if(typeof entity[key]!=='number'||!Number.isFinite(entity[key])||entity[key]<0||entity[key]>=360)
          throw new Error('Ângulo de arco inválido; use graus entre 0 e 360.');
        if(cadArcSweep(entity)<0.0001)throw new Error('Arco precisa de abertura não nula; para 360° use círculo.');
        for(const p of cadArcExtrema(entity))point(p,'Limite do arco');
      } else if (Math.abs(entity.center.x) + entity.radius > MAX_COORD || Math.abs(entity.center.y) + entity.radius > MAX_COORD) throw new Error('Círculo ultrapassa limites do desenho.');
    } else {
      const a = point(entity.a, 'Ponto A'), b = point(entity.b, 'Ponto B');
      if (same(a,b)) throw new Error('Entidade CAD não pode ter tamanho nulo.');
      if (entity.type === 'rectangle' && (Math.abs(a.x-b.x) < 1e-6 || Math.abs(a.y-b.y) < 1e-6)) throw new Error('Retângulo precisa de largura e altura.');
    }
    validateCadDimensions(entity);
  }
  return raw;
}

export function makeCadEntity(type, first, second, layerId = 'principal', id = crypto.randomUUID()) {
  if (!KINDS.has(type) || type==='arc' || !ID.test(layerId) || !ID.test(id)) throw new Error('Tipo, camada ou ID CAD inválido.');
  const a = point(first, 'Ponto inicial'), b = point(second, 'Ponto final');
  let entity;
  if (type === 'circle') {
    const radius = round(Math.hypot(b.x-a.x, b.y-a.y));
    entity = { id, type, layerId, center:a, radius };
  } else entity = { id, type, layerId, a, b };
  // validate through a complete trusted document, not a second schema.
  validateCadSketch({ ...initialCadSketch(), layers:[{id:layerId,name:layerId,color:'#C8515E',visible:true,locked:false}], entities:[entity] });
  return entity;
}

/** Arc creation is explicit: centre, radius, start and end angle, CCW. */
export function makeCadArc(center,radius,startAngle,endAngle,layerId='principal',id=crypto.randomUUID()) {
  if(![radius,startAngle,endAngle].every(Number.isFinite))throw new Error('Raio ou ângulo de arco inválido.');
  const entity={id,type:'arc',layerId,center:point(center,'Centro'),radius:round(radius),
    startAngle:normalizeCadAngle(startAngle),endAngle:normalizeCadAngle(endAngle)};
  validateCadSketch({...initialCadSketch(),layers:[{id:layerId,name:layerId,color:'#C8515E',visible:true,locked:false}],entities:[entity]});
  return entity;
}

export function addCadEntity(sketch, entity) {
  validateCadSketch(sketch);
  if (sketch.entities.length >= MAX_ENTITIES) throw new Error('Limite de 2.000 entidades atingido.');
  const next = { ...clone(sketch), entities:[...sketch.entities, clone(entity)] };
  validateCadSketch(next);
  const layer = next.layers.find(l=>l.id === entity.layerId);
  if (layer.locked) throw new Error('Camada bloqueada para edição.');
  return next;
}

export function deleteCadEntity(sketch, id) {
  validateCadSketch(sketch);
  const entity = sketch.entities.find(e => e.id === id);
  if (!entity) return clone(sketch);
  if (entity.locked || sketch.layers.find(l=>l.id === entity.layerId)?.locked) throw new Error('Camada bloqueada para edição.');
  return { ...clone(sketch), entities:sketch.entities.filter(e => e.id !== id).map(clone) };
}

/** Precise edit of one existing geometry with its original identity. */
export function replaceCadEntity(sketch, replacement) {
  validateCadSketch(sketch);
  if (!replacement || typeof replacement.id !== 'string') throw new Error('Entidade para edição inválida.');
  const index=sketch.entities.findIndex(e=>e.id===replacement.id);
  if(index<0)throw new Error('Entidade CAD não encontrada.');
  const previous=sketch.entities[index];
  if(previous.type!==replacement.type || previous.layerId!==replacement.layerId)
    throw new Error('A edição numérica não altera tipo nem camada.');
  if(JSON.stringify(previous.dimensions??null)!==JSON.stringify(replacement.dimensions??null))
    throw new Error('Use o editor de cotas para alterar ou remover uma dimensão persistente.');
  if(previous.locked || sketch.layers.find(l=>l.id===previous.layerId)?.locked)
    throw new Error('Camada bloqueada para edição.');
  const next=clone(sketch);
  next.entities[index]=clone(replacement);
  validateCadSketch(next);
  return next;
}

/** Simple native layer management; no entities can become dangling. */
export function addCadLayer(sketch, { id, name, color = '#C8515E' }) {
  validateCadSketch(sketch);
  if(sketch.layers.length>=MAX_LAYERS)throw new Error('Limite de 32 camadas atingido.');
  const next=clone(sketch);
  next.layers.push({id,name,color,visible:true,locked:false});
  validateCadSketch(next);
  return next;
}
export function removeCadLayer(sketch, id) {
  validateCadSketch(sketch);
  if(sketch.layers.length<=1)throw new Error('O desenho precisa ter uma camada.');
  const layer=sketch.layers.find(l=>l.id===id);
  if(!layer)throw new Error('Camada inexistente.');
  if(layer.locked)throw new Error('Desbloqueie a camada antes de remover.');
  if(sketch.entities.some(e=>e.layerId===id))throw new Error('A camada possui entidades. Mova ou exclua as entidades antes.');
  const next=clone(sketch);
  next.layers=next.layers.filter(l=>l.id!==id);
  validateCadSketch(next);
  return next;
}
export function cadBounds(sketch, { visibleOnly=true, includeDimensions=false } = {}) {
  validateCadSketch(sketch);
  const pts=[];
  for(const e of sketch.entities) {
    if(visibleOnly && (e.visible===false || !sketch.layers.find(l=>l.id===e.layerId)?.visible))continue;
    if(e.type==='arc')pts.push(...cadArcExtrema(e));
    else if(e.type==='circle')pts.push(
      {x:e.center.x-e.radius,y:e.center.y-e.radius},
      {x:e.center.x+e.radius,y:e.center.y+e.radius}
    );
    else pts.push(e.a,e.b);
    if(includeDimensions)for(const dimension of e.dimensions||[]){
      const bounds=cadDimensionLayout(e,dimension).bounds;
      pts.push({x:bounds.minX,y:bounds.minY},{x:bounds.maxX,y:bounds.maxY});
    }
  }
  if(!pts.length)return null;
  return {
    minX:Math.min(...pts.map(p=>p.x)),maxX:Math.max(...pts.map(p=>p.x)),
    minY:Math.min(...pts.map(p=>p.y)),maxY:Math.max(...pts.map(p=>p.y))
  };
}

export function cadEntityMetrics(entity) {
  if(entity.type==='arc')return {length:round(entity.radius*cadArcSweep(entity)*Math.PI/180),area:0};
  if (entity.type === 'circle') return { length:round(2*Math.PI*entity.radius), area:round(Math.PI*entity.radius**2) };
  const dx=entity.b.x-entity.a.x,dy=entity.b.y-entity.a.y;
  if (entity.type === 'rectangle') return { length:round(2*(Math.abs(dx)+Math.abs(dy))),area:round(Math.abs(dx*dy)) };
  return { length:round(Math.hypot(dx,dy)),area:0 };
}

export function cadStats(sketch) {
  validateCadSketch(sketch);
  const visible = sketch.entities.filter(e => e.visible!==false && sketch.layers.find(l=>l.id===e.layerId)?.visible);
  const totalLength = visible.reduce((sum,e) => sum+cadEntityMetrics(e).length,0);
  return { count:sketch.entities.length, visible:visible.length, layers:sketch.layers.length, totalLength:round(totalLength) };
}

export function snapCadPoint(raw, sketch, scale = 1, grid = 5) {
  validateCadSketch(sketch);
  const p = point(raw);
  finite(scale,'Escala');
  if (scale <= 0 || grid <= 0 || !Number.isFinite(grid)) throw new Error('Escala ou grade CAD inválida.');
  const tolerance = 10 / scale;
  const candidates=[];
  for (const e of sketch.entities) {
    const layer=sketch.layers.find(l=>l.id===e.layerId);
    if (e.visible===false || !layer?.visible) continue;
    if(e.type==='arc')candidates.push(e.center,cadArcPoint(e,e.startAngle),cadArcPoint(e,e.endAngle),cadArcPoint(e,e.startAngle+cadArcSweep(e)/2));
    else if (e.type === 'circle') candidates.push(e.center);
    else {
      candidates.push(e.a,e.b);
      candidates.push({x:(e.a.x+e.b.x)/2,y:(e.a.y+e.b.y)/2});
      if(e.type==='rectangle') candidates.push({x:e.a.x,y:e.b.y},{x:e.b.x,y:e.a.y});
    }
  }
  let nearest=null,minimum=tolerance;
  for(const c of candidates){const d=Math.hypot(c.x-p.x,c.y-p.y);if(d<=minimum){minimum=d;nearest=c;}}
  if(nearest)return { ...point(nearest), kind:'object' };
  const g={x:round(Math.round(p.x/grid)*grid),y:round(Math.round(p.y/grid)*grid)};
  return { ...g,kind:'grid' };
}

/** World-space geometry, browser presentation and export share the same model. */
export function cadSvg(sketch, { padding = 20 } = {}) {
  validateCadSketch(sketch);
  if(!Number.isFinite(padding) || padding < 0 || padding > 1000) throw new Error('Margem inválida.');
  const points=[];
  for(const e of sketch.entities){
    if(e.visible===false || !sketch.layers.find(l=>l.id===e.layerId)?.visible)continue;
    if(e.type==='arc')points.push(...cadArcExtrema(e));
    else if(e.type==='circle')points.push({x:e.center.x-e.radius,y:e.center.y-e.radius},{x:e.center.x+e.radius,y:e.center.y+e.radius});
    else points.push(e.a,e.b);
    for(const dimension of e.dimensions||[]){
      const bounds=cadDimensionLayout(e,dimension).bounds;
      points.push({x:bounds.minX,y:bounds.minY},{x:bounds.maxX,y:bounds.maxY});
    }
  }
  if(!points.length)points.push({x:-50,y:-50},{x:50,y:50});
  const x0=Math.min(...points.map(p=>p.x))-padding,y0=Math.min(...points.map(p=>p.y))-padding;
  const width=Math.max(...points.map(p=>p.x))-x0+padding, height=Math.max(...points.map(p=>p.y))-y0+padding;
  const output=[];
  for(const e of sketch.entities){
    const layer=sketch.layers.find(l=>l.id===e.layerId);
    if(e.visible===false || !layer?.visible)continue;
    const color=layer.color;
    if(e.type==='line')output.push(`<line x1="${fmt(e.a.x)}" y1="${fmt(e.a.y)}" x2="${fmt(e.b.x)}" y2="${fmt(e.b.y)}" stroke="${color}"/>`);
    if(e.type==='rectangle')output.push(`<rect x="${fmt(Math.min(e.a.x,e.b.x))}" y="${fmt(Math.min(e.a.y,e.b.y))}" width="${fmt(Math.abs(e.a.x-e.b.x))}" height="${fmt(Math.abs(e.a.y-e.b.y))}" fill="none" stroke="${color}"/>`);
    if(e.type==='circle')output.push(`<circle cx="${fmt(e.center.x)}" cy="${fmt(e.center.y)}" r="${fmt(e.radius)}" fill="none" stroke="${color}"/>`);
    if(e.type==='arc')output.push(`<path d="${cadArcPath(e)}" fill="none" stroke="${color}"/>`);
    for(const dimension of e.dimensions||[]){
      const annotation=cadDimensionLayout(e,dimension);
      output.push(`<g data-cad-dimension="${dimension.kind}" stroke="${color}" stroke-width="0.35">`);
      for(const segment of annotation.lines)output.push(`<line x1="${fmt(segment.a.x)}" y1="${fmt(segment.a.y)}" x2="${fmt(segment.b.x)}" y2="${fmt(segment.b.y)}"/>`);
      output.push(`<text x="${fmt(annotation.text.x)}" y="${fmt(-annotation.text.y)}" transform="scale(1,-1)" fill="${color}" stroke="none" font-family="Consolas,monospace" font-size="${annotation.text.height}" text-anchor="middle" dominant-baseline="middle">${annotation.label}</text></g>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fmt(x0)} ${fmt(-y0-height)} ${fmt(width)} ${fmt(height)}"><title>OmniForge CAD — milímetros</title><g transform="scale(1,-1)" stroke-width="0.75" vector-effect="non-scaling-stroke">${output.join('')}</g></svg>\n`;
}

/** Explicit R12 subset: LINE, CIRCLE and ARC; rectangles become four lines.
 * DXF lacks reliable unit enforcement in R12; consumers must select mm.
 */
export function cadDxf(sketch) {
  validateCadSketch(sketch);
  if(hasCadDimensions(sketch))throw new Error('DXF não preserva cotas persistentes. Confirme a exportação somente da geometria ou use SVG.');
  const lines=[];
  const emit=(...pairs)=>{for(let i=0;i<pairs.length;i+=2)lines.push(String(pairs[i]),String(pairs[i+1]));};
  emit(0,'SECTION',2,'HEADER',9,'$ACADVER',1,'AC1009',9,'$MEASUREMENT',70,1,0,'ENDSEC');
  emit(0,'SECTION',2,'TABLES',0,'TABLE',2,'LAYER',70,sketch.layers.length);
  for(const layer of sketch.layers)emit(0,'LAYER',2,layer.id,70,layer.locked?4:0,62,layer.visible?7:-7,6,'CONTINUOUS');
  emit(0,'ENDTAB',0,'ENDSEC',0,'SECTION',2,'ENTITIES');
  const line=(a,b,layerId)=>emit(0,'LINE',8,layerId,10,fmt(a.x),20,fmt(a.y),30,0,11,fmt(b.x),21,fmt(b.y),31,0);
  for(const e of sketch.entities){
    if(e.visible===false)continue;
    if(e.type==='line')line(e.a,e.b,e.layerId);
    if(e.type==='circle')emit(0,'CIRCLE',8,e.layerId,10,fmt(e.center.x),20,fmt(e.center.y),30,0,40,fmt(e.radius));
    if(e.type==='arc')emit(0,'ARC',8,e.layerId,10,fmt(e.center.x),20,fmt(e.center.y),30,0,40,fmt(e.radius),50,e.startAngle,51,e.endAngle);
    if(e.type==='rectangle'){
      const a=e.a,b=e.b,p={x:a.x,y:b.y},q={x:b.x,y:a.y};
      line(a,p,e.layerId);line(p,b,e.layerId);line(b,q,e.layerId);line(q,a,e.layerId);
    }
  }
  emit(0,'ENDSEC',0,'EOF');
  return lines.join('\n')+'\n';
}
