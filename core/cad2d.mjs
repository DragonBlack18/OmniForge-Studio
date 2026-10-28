/** OmniForge CAD Sketch v1 — original, deterministic 2D geometry model.
 * Coordinates are real millimetres with Y increasing upwards. No DXF/CAD code
 * from other applications is included. This is not a parametric solid kernel.
 */

const MAX_COORD = 1_000_000;
const MAX_ENTITIES = 2000;
const MAX_LAYERS = 32;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const KINDS = new Set(['line', 'circle', 'rectangle']);
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
    { id: 'principal', name: 'Principal', color: '#6CBCEC', visible: true, locked: false },
    { id: 'construcao', name: 'Construção', color: '#9AA7B8', visible: true, locked: false }
  ], entities: [] };
}

/** All serialized data is checked on both input and output boundaries. */
export function validateCadSketch(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.schemaVersion !== 1 || raw.units !== 'mm' ||
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
    entities.add(entity.id);
    if (entity.type === 'circle') {
      point(entity.center, 'Centro');
      if (typeof entity.radius !== 'number' || !Number.isFinite(entity.radius) || entity.radius < 0.0001 || entity.radius > MAX_COORD) throw new Error('Raio CAD inválido.');
      if (Math.abs(entity.center.x) + entity.radius > MAX_COORD || Math.abs(entity.center.y) + entity.radius > MAX_COORD) throw new Error('Círculo ultrapassa limites do desenho.');
    } else {
      const a = point(entity.a, 'Ponto A'), b = point(entity.b, 'Ponto B');
      if (same(a,b)) throw new Error('Entidade CAD não pode ter tamanho nulo.');
      if (entity.type === 'rectangle' && (Math.abs(a.x-b.x) < 1e-6 || Math.abs(a.y-b.y) < 1e-6)) throw new Error('Retângulo precisa de largura e altura.');
    }
  }
  return raw;
}

export function makeCadEntity(type, first, second, layerId = 'principal', id = crypto.randomUUID()) {
  if (!KINDS.has(type) || !ID.test(layerId) || !ID.test(id)) throw new Error('Tipo, camada ou ID CAD inválido.');
  const a = point(first, 'Ponto inicial'), b = point(second, 'Ponto final');
  let entity;
  if (type === 'circle') {
    const radius = round(Math.hypot(b.x-a.x, b.y-a.y));
    entity = { id, type, layerId, center:a, radius };
  } else entity = { id, type, layerId, a, b };
  // validate through a complete trusted document, not a second schema.
  validateCadSketch({ ...initialCadSketch(), layers:[{id:layerId,name:layerId,color:'#6CBCEC',visible:true,locked:false}], entities:[entity] });
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
  if (sketch.layers.find(l=>l.id === entity.layerId)?.locked) throw new Error('Camada bloqueada para edição.');
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
  if(sketch.layers.find(l=>l.id===previous.layerId)?.locked)
    throw new Error('Camada bloqueada para edição.');
  const next=clone(sketch);
  next.entities[index]=clone(replacement);
  validateCadSketch(next);
  return next;
}

/** Simple native layer management; no entities can become dangling. */
export function addCadLayer(sketch, { id, name, color = '#6CBCEC' }) {
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
export function cadBounds(sketch, { visibleOnly=true } = {}) {
  validateCadSketch(sketch);
  const pts=[];
  for(const e of sketch.entities) {
    if(visibleOnly && !sketch.layers.find(l=>l.id===e.layerId)?.visible)continue;
    if(e.type==='circle')pts.push(
      {x:e.center.x-e.radius,y:e.center.y-e.radius},
      {x:e.center.x+e.radius,y:e.center.y+e.radius}
    );
    else pts.push(e.a,e.b);
  }
  if(!pts.length)return null;
  return {
    minX:Math.min(...pts.map(p=>p.x)),maxX:Math.max(...pts.map(p=>p.x)),
    minY:Math.min(...pts.map(p=>p.y)),maxY:Math.max(...pts.map(p=>p.y))
  };
}

export function cadEntityMetrics(entity) {
  if (entity.type === 'circle') return { length:round(2*Math.PI*entity.radius), area:round(Math.PI*entity.radius**2) };
  const dx=entity.b.x-entity.a.x,dy=entity.b.y-entity.a.y;
  if (entity.type === 'rectangle') return { length:round(2*(Math.abs(dx)+Math.abs(dy))),area:round(Math.abs(dx*dy)) };
  return { length:round(Math.hypot(dx,dy)),area:0 };
}

export function cadStats(sketch) {
  validateCadSketch(sketch);
  const visible = sketch.entities.filter(e => sketch.layers.find(l=>l.id===e.layerId)?.visible);
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
    if (!layer?.visible) continue;
    if (e.type === 'circle') candidates.push(e.center);
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
    if(!sketch.layers.find(l=>l.id===e.layerId)?.visible)continue;
    if(e.type==='circle')points.push({x:e.center.x-e.radius,y:e.center.y-e.radius},{x:e.center.x+e.radius,y:e.center.y+e.radius});
    else points.push(e.a,e.b);
  }
  if(!points.length)points.push({x:-50,y:-50},{x:50,y:50});
  const x0=Math.min(...points.map(p=>p.x))-padding,y0=Math.min(...points.map(p=>p.y))-padding;
  const width=Math.max(...points.map(p=>p.x))-x0+padding, height=Math.max(...points.map(p=>p.y))-y0+padding;
  const output=[];
  for(const e of sketch.entities){
    const layer=sketch.layers.find(l=>l.id===e.layerId);
    if(!layer?.visible)continue;
    const color=layer.color;
    if(e.type==='line')output.push(`<line x1="${fmt(e.a.x)}" y1="${fmt(e.a.y)}" x2="${fmt(e.b.x)}" y2="${fmt(e.b.y)}" stroke="${color}"/>`);
    if(e.type==='rectangle')output.push(`<rect x="${fmt(Math.min(e.a.x,e.b.x))}" y="${fmt(Math.min(e.a.y,e.b.y))}" width="${fmt(Math.abs(e.a.x-e.b.x))}" height="${fmt(Math.abs(e.a.y-e.b.y))}" fill="none" stroke="${color}"/>`);
    if(e.type==='circle')output.push(`<circle cx="${fmt(e.center.x)}" cy="${fmt(e.center.y)}" r="${fmt(e.radius)}" fill="none" stroke="${color}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fmt(x0)} ${fmt(-y0-height)} ${fmt(width)} ${fmt(height)}"><title>OmniForge CAD — milímetros</title><g transform="scale(1,-1)" stroke-width="0.75" vector-effect="non-scaling-stroke">${output.join('')}</g></svg>\n`;
}

/** Explicit R12 subset: LINE and CIRCLE only; rectangles become four lines.
 * DXF lacks reliable unit enforcement in R12; consumers must select mm.
 */
export function cadDxf(sketch) {
  validateCadSketch(sketch);
  const lines=[];
  const emit=(...pairs)=>{for(let i=0;i<pairs.length;i+=2)lines.push(String(pairs[i]),String(pairs[i+1]));};
  emit(0,'SECTION',2,'HEADER',9,'$ACADVER',1,'AC1009',9,'$MEASUREMENT',70,1,0,'ENDSEC');
  emit(0,'SECTION',2,'TABLES',0,'TABLE',2,'LAYER',70,sketch.layers.length);
  for(const layer of sketch.layers)emit(0,'LAYER',2,layer.id,70,0,62,layer.visible?7:-7,6,'CONTINUOUS');
  emit(0,'ENDTAB',0,'ENDSEC',0,'SECTION',2,'ENTITIES');
  const line=(a,b,layerId)=>emit(0,'LINE',8,layerId,10,fmt(a.x),20,fmt(a.y),30,0,11,fmt(b.x),21,fmt(b.y),31,0);
  for(const e of sketch.entities){
    if(e.type==='line')line(e.a,e.b,e.layerId);
    if(e.type==='circle')emit(0,'CIRCLE',8,e.layerId,10,fmt(e.center.x),20,fmt(e.center.y),30,0,40,fmt(e.radius));
    if(e.type==='rectangle'){
      const a=e.a,b=e.b,p={x:a.x,y:b.y},q={x:b.x,y:a.y};
      line(a,p,e.layerId);line(p,b,e.layerId);line(b,q,e.layerId);line(q,a,e.layerId);
    }
  }
  emit(0,'ENDSEC',0,'EOF');
  return lines.join('\n')+'\n';
}
