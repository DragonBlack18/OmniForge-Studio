/** Presentation-only preferences. No paths, document content or native capabilities. */
export const LAYOUT_KEY = 'of.workbench.layout.v1';
export const PROFILE_LIMIT = 32;
export const STORAGE_LIMIT = 48 * 1024;
export const WIDTHS = Object.freeze({
  navigation: Object.freeze({min:160,max:280,default:184}),
  context: Object.freeze({min:180,max:360,default:224}),
  inspector: Object.freeze({min:248,max:440,default:278}),
  cadInspector: Object.freeze({min:272,max:420,default:310})
});
export const EDITOR_MODES = Object.freeze(['canvas','code','cad']);
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
export const layoutScope = id => typeof id==='string' && UUID.test(id) ? id.toLowerCase() : 'global';
export const layoutMode = mode => EDITOR_MODES.includes(mode) ? mode : 'other';
export function defaultLayout() {
  return {navigationWidth:184,navigationCollapsed:false,
    canvas:{contextWidth:224,inspectorWidth:278,contextOpen:true,inspectorOpen:true},
    code:{contextWidth:224,contextOpen:true},cad:{inspectorWidth:310,inspectorOpen:true}};
}
const plain = value => value && typeof value==='object' && !Array.isArray(value) && Object.getPrototypeOf(value)===Object.prototype;
const boolean = (value,fallback) => typeof value==='boolean' ? value : fallback;
const width = (value,kind,fallback) => typeof value==='number' && Number.isFinite(value)
  ? Math.min(WIDTHS[kind].max,Math.max(WIDTHS[kind].min,Math.round(value))) : fallback;
export function normalizeLayout(input) {
  const d=defaultLayout(); if(!plain(input))return d;
  d.navigationWidth=width(input.navigationWidth,'navigation',d.navigationWidth);
  d.navigationCollapsed=boolean(input.navigationCollapsed,d.navigationCollapsed);
  for(const mode of EDITOR_MODES) {
    if(!plain(input[mode]))continue;
    for(const field of Object.keys(d[mode])) {
      d[mode][field]=field.endsWith('Open') ? boolean(input[mode][field],d[mode][field])
        : width(input[mode][field],mode==='cad'?'cadInspector':field==='contextWidth'?'context':'inspector',d[mode][field]);
    }
  }
  return d;
}
export function editLayout(input,mode,field,value) {
  const next=normalizeLayout(input);
  if(field==='navigationWidth'||field==='navigationCollapsed')next[field]=value;
  else if(EDITOR_MODES.includes(mode) && Object.hasOwn(next[mode],field))next[mode][field]=value;
  else throw new TypeError('Preferência de layout desconhecida.');
  return normalizeLayout(next);
}
export function presetLayout(input,mode,preset) {
  if(!['balanced','wide','inspect'].includes(preset))throw new TypeError('Disposição desconhecida.');
  const next=normalizeLayout(input),d=defaultLayout();
  next.navigationCollapsed=preset==='wide'; next.navigationWidth=d.navigationWidth;
  if(EDITOR_MODES.includes(mode)) {
    next[mode]={...d[mode]};
    if('contextOpen' in next[mode])next[mode].contextOpen=preset!=='wide';
    if(preset==='inspect'&&'inspectorWidth' in next[mode])next[mode].inspectorWidth=360;
  }
  return next;
}
/** Fit to available pixels without modifying the user's preferred dimensions. */
export function resolveLayout(input,mode,availableWidth,focus=false) {
  const p=normalizeLayout(input),m=layoutMode(mode),s=p[m]||{};
  const available=Number.isFinite(availableWidth)?Math.max(0,availableWidth):1280;
  let nav=focus?0:p.navigationCollapsed?48:p.navigationWidth;
  let context=!focus&&s.contextOpen?s.contextWidth:0;
  let inspector=!focus&&s.inspectorOpen?s.inspectorWidth:0;
  const centerMin=m==='cad'?524:m==='code'?480:400;
  const occupied=()=>nav+(nav>48?6:0)+context+(context?6:0)+inspector+(inspector?6:0);
  const budget=Math.max(0,available-centerMin);
  // Shrink only presentation dimensions, then collapse navigation as a last resort.
  if(occupied()>budget&&nav>48)nav=Math.max(160,nav-(occupied()-budget));
  if(occupied()>budget&&context)context=Math.max(180,context-(occupied()-budget));
  if(occupied()>budget&&inspector)inspector=Math.max(m==='cad'?272:248,inspector-(occupied()-budget));
  if(occupied()>budget&&nav>48)nav=48;
  if(occupied()>budget&&context)context=0;
  if(occupied()>budget&&inspector)inspector=0;
  return {navigationWidth:nav,contextWidth:context,inspectorWidth:inspector,
    navigationCollapsed:nav===48,contextVisible:context>0,inspectorVisible:inspector>0,
    centerWidth:Math.max(0,available-occupied()),
    adapted:!focus&&(nav!==(p.navigationCollapsed?48:p.navigationWidth)||context!==(s.contextOpen?s.contextWidth:0)||inspector!==(s.inspectorOpen?s.inspectorWidth:0))};
}
function freeze(value){Object.freeze(value);for(const item of Object.values(value))if(item&&typeof item==='object')freeze(item);return value;}
function readLegacy(storage) {
  const p=defaultLayout();
  try {
    const flag=key=>{const v=storage?.getItem(key);return v==='1'?true:v==='0'?false:null;};
    p.navigationCollapsed=flag('of.navCollapsed')??false;
    p.canvas.contextOpen=p.code.contextOpen=flag('of.utilityOpen')??true;
    p.canvas.inspectorOpen=flag('of.inspectorOpen')??true;
    const old=storage?.getItem('of.cad.inspectorWidth.v1');
    if(old!==null&&old!==undefined)p.cad.inspectorWidth=width(Number(old),'cadInspector',310);
  } catch { /* legacy state is optional */ }
  return normalizeLayout(p);
}
/** Bounded LRU store. Reads are side-effect free; only explicit user edits persist. */
export function createLayoutStore(storage) {
  const listeners=new Set(),cache=new Map(),defaults=freeze(readLegacy(storage));
  let profiles=new Map(),status=storage?'saved':'unavailable',blocked=false;
  try {
    const raw=storage?.getItem(LAYOUT_KEY);
    if(raw!==null&&raw!==undefined) {
      if(raw.length>STORAGE_LIMIT)throw Error('oversize');
      const data=JSON.parse(raw);
      if(!plain(data)||data.version!==1||!Array.isArray(data.profiles)||data.profiles.length>PROFILE_LIMIT)throw Error('schema');
      for(const row of data.profiles) {
        if(!plain(row)||typeof row.scope!=='string'||layoutScope(row.scope)!==row.scope||profiles.has(row.scope)||!plain(row.layout))throw Error('profile');
        profiles.set(row.scope,freeze(normalizeLayout(row.layout)));
      }
    }
  } catch { profiles=new Map();status='invalid';blocked=true; }
  function emit(){cache.clear();for(const fn of listeners)fn();}
  function persist() {
    if(blocked)return; // Never destroy malformed/unknown preferences implicitly.
    try {
      if(!storage)throw Error('storage unavailable');
      const value=JSON.stringify({version:1,profiles:[...profiles].map(([scope,layout])=>({scope,layout}))});
      if(value.length>STORAGE_LIMIT)throw Error('quota');
      storage.setItem(LAYOUT_KEY,value);status='saved';
    } catch {status='unavailable';}
  }
  function set(id,layout) {
    const scope=layoutScope(id),next=freeze(normalizeLayout(layout));
    if(JSON.stringify(profiles.get(scope)||defaults)===JSON.stringify(next))return false;
    profiles.delete(scope);profiles.set(scope,next);
    while(profiles.size>PROFILE_LIMIT)profiles.delete(profiles.keys().next().value);
    persist();emit();return true;
  }
  return Object.freeze({
    subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
    getSnapshot(id){const scope=layoutScope(id);if(!cache.has(scope))cache.set(scope,Object.freeze({scope,layout:profiles.get(scope)||defaults,status}));return cache.get(scope);},
    edit(id,mode,field,value){return set(id,editLayout(this.getSnapshot(id).layout,mode,field,value));},
    preset(id,mode,preset){return set(id,presetLayout(this.getSnapshot(id).layout,mode,preset));},
    reset(id){ // Explicit reset repairs incompatible preferences; documents are never involved.
      if(blocked){profiles=new Map();blocked=false;}
      const scope=layoutScope(id);profiles.delete(scope);profiles.set(scope,freeze(defaultLayout()));
      while(profiles.size>PROFILE_LIMIT)profiles.delete(profiles.keys().next().value);
      persist();emit();
    }
  });
}
