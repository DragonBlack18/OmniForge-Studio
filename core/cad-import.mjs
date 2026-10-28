/**
 * OmniForge CAD DXF ASCII importer (original implementation).
 * Conservative 2D subset: LINE, CIRCLE and straight LWPOLYLINE.
 * Unsupported geometry is rejected as a whole; nothing is silently dropped.
 * No file I/O, project access or third-party CAD source code in this module.
 */
import { validateCadSketch } from './cad2d.mjs';

export const MAX_DXF_BYTES = 2_000_000;
const MAX_PAIRS = 120_000;
const MAX_ENTITIES = 2000;
const MAX_LAYERS = 32;
const SAFE_LAYER_ID = /^[A-Za-z0-9_-]{1,64}$/;
const NUMERIC = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?$/;
const SCALE = new Map([
  [1,{ label:'polegadas',factor:25.4 }],
  [2,{ label:'pés',factor:304.8 }],
  [4,{ label:'milímetros',factor:1 }],
  [5,{ label:'centímetros',factor:10 }],
  [6,{ label:'metros',factor:1000 }]
]);
const COLORS = {
  1:'#E57275', 2:'#D9BA65', 3:'#69BC8B', 4:'#78C5CA',
  5:'#749CDE', 6:'#BB85D6', 7:'#CBD7DF', 8:'#A8B0BB'
};
const ROUND = v=>Number(v.toFixed(4));

function number(value,label) {
  if(typeof value!=='string' || !NUMERIC.test(value.trim()))throw new Error(label+': valor numérico DXF inválido.');
  const valueNumber=Number(value.trim());
  if(!Number.isFinite(valueNumber))throw new Error(label+': valor fora dos limites.');
  return valueNumber;
}
function integer(value,label) {
  const n=number(value,label);
  if(!Number.isSafeInteger(n))throw new Error(label+': inteiro inválido.');
  return n;
}
function get(groups,code) {
  return groups.find(pair=>pair.code===code)?.value;
}
function optionalNumber(groups,code,fallback,label) {
  const raw=get(groups,code);
  return raw===undefined?fallback:number(raw,label);
}
function requireNumber(groups,code,label) {
  const raw=get(groups,code);
  if(raw===undefined)throw new Error(label+': grupo DXF '+code+' ausente.');
  return number(raw,label);
}
function assertFlat(groups,type) {
  for(const [code,expected] of [[30,0],[31,0],[38,0],[39,0],[210,0],[220,0],[230,1]]) {
    const n=optionalNumber(groups,code,expected,type);
    if(Math.abs(n-expected)>1e-9)throw new Error(type+': geometria fora do plano XY não suportada.');
  }
}
function validateLayerName(name) {
  if(typeof name!=='string' || !name.trim() || name.length>60 ||
      /[\u0000-\u001F\u007F]/.test(name))
    throw new Error('Nome de camada DXF inválido.');
  return name.trim();
}
function parsePairs(contents) {
  if(typeof contents!=='string' || !contents.trim() || Buffer.byteLength(contents,'utf8')>MAX_DXF_BYTES ||
      contents.includes('\0') || contents.startsWith('AutoCAD Binary DXF'))
    throw new Error('DXF deve ser texto ASCII/UTF-8 e ter no máximo 2 MB.');
  const lines=contents.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n');
  if(lines.at(-1)==='')lines.pop();
  if(lines.length%2!==0 || lines.length/2>MAX_PAIRS)throw new Error('DXF truncado ou excede o limite de grupos.');
  const pairs=[];
  for(let i=0;i<lines.length;i+=2) {
    const code=lines[i].trim();
    if(!/^\d{1,4}$/.test(code))throw new Error('Grupo DXF inválido na linha '+(i+1)+'.');
    pairs.push({code:Number(code),value:lines[i+1].trim()});
  }
  return pairs;
}

/** No implicit unit guessing. R12 without INSUNITS needs explicit user approval. */
export function parseCadDxf(contents,{assumeMillimeters=false}={}) {
  if(typeof assumeMillimeters!=='boolean')throw new Error('Confirmação de unidades inválida.');
  const pairs=parsePairs(contents);
  const definitions=new Map();
  const sourceEntities=[];
  const unsupported=new Set();
  let section=null, headerVariable=null, insunits=null, foundEntities=false, foundEof=false;
  for(let i=0;i<pairs.length;) {
    const item=pairs[i];
    if(item.code===0 && item.value==='SECTION') {
      if(section!==null || pairs[i+1]?.code!==2)throw new Error('Seção DXF inválida.');
      section=pairs[i+1].value.toUpperCase();
      if(section==='ENTITIES')foundEntities=true;
      headerVariable=null;i+=2;continue;
    }
    if(item.code===0 && item.value==='ENDSEC') {
      if(!section)throw new Error('ENDSEC fora de seção DXF.');
      section=null;headerVariable=null;i++;continue;
    }
    if(item.code===0 && item.value==='EOF') {
      if(section!==null)throw new Error('EOF DXF dentro de uma seção aberta.');
      if(i!==pairs.length-1)throw new Error('Conteúdo DXF inesperado após EOF.');
      foundEof=true;break;
    }
    if(section==='HEADER') {
      if(item.code===9)headerVariable=item.value;
      else if(headerVariable==='$INSUNITS' && item.code===70) {
        insunits=integer(item.value,'$INSUNITS');headerVariable=null;
      }
      i++;continue;
    }
    if((section==='TABLES' && item.code===0 && item.value==='LAYER') ||
       (section==='ENTITIES' && item.code===0)) {
      const type=item.value.toUpperCase();
      let j=i+1;
      while(j<pairs.length && pairs[j].code!==0)j++;
      const groups=pairs.slice(i+1,j);
      if(section==='TABLES') {
        const name=validateLayerName(get(groups,2));
        const color=optionalNumber(groups,62,7,'LAYER');
        const trueColor=get(groups,420);
        const flags=optionalNumber(groups,70,0,'LAYER');
        if(!Number.isSafeInteger(color) || !Number.isSafeInteger(flags))
          throw new Error('Cor/flags de camada DXF inválidos.');
        let hex=COLORS[Math.abs(color)]||'#6CBCEC';
        if(trueColor!==undefined) {
          const rgb=integer(trueColor,'Cor DXF');
          if(rgb<0 || rgb>0xffffff)throw new Error('Cor DXF inválida.');
          hex='#'+rgb.toString(16).padStart(6,'0').toUpperCase();
        }
        definitions.set(name.toLowerCase(),{name,color:hex,visible:color>=0,locked:Boolean(flags&4)});
      } else if(['LINE','CIRCLE','LWPOLYLINE'].includes(type)) {
        sourceEntities.push({type,groups});
        if(sourceEntities.length>MAX_ENTITIES)throw new Error('DXF excede 2000 entidades de origem.');
      } else {
        unsupported.add(type);
      }
      i=j;continue;
    }
    i++;
  }
  if(!foundEntities || !foundEof || section!==null)
    throw new Error('DXF sem seção ENTITIES completa ou sem EOF.');
  if(unsupported.size)
    throw new Error('DXF contém entidades não suportadas: '+[...unsupported].slice(0,8).join(', ')+'. A importação foi cancelada integralmente.');
  if(!sourceEntities.length)throw new Error('DXF sem linhas, círculos ou polilinhas compatíveis.');

  const unknownUnits=insunits===null || insunits===0;
  if(unknownUnits && !assumeMillimeters)
    throw new Error('DXF sem unidade explícita. Confirme a interpretação em milímetros.');
  const specified=unknownUnits?null:SCALE.get(insunits);
  if(!unknownUnits && !specified)
    throw new Error('Unidades DXF não suportadas ($INSUNITS='+insunits+').');
  const factor=specified?.factor??1;
  const layers=[];
  const layerIds=new Map();
  const declaredIds=new Set();
  function layerId(raw) {
    const name=validateLayerName(raw || '0'),key=name.toLowerCase();
    if(layerIds.has(key))return layerIds.get(key);
    if(layers.length>=MAX_LAYERS)throw new Error('DXF excede o máximo de 32 camadas.');
    let id=name==='0'?'principal':SAFE_LAYER_ID.test(name)?name:null;
    if(!id || declaredIds.has(id)) {
      let suffix=layers.length+1;
      do {id='dxf_'+String(suffix++).padStart(3,'0');}
      while(declaredIds.has(id));
    }
    const def=definitions.get(key);
    layers.push({
      id,name:name==='0'?'Principal':def?.name||name,
      color:def?.color||'#6CBCEC',
      visible:def?.visible??true,locked:def?.locked??false
    });
    declaredIds.add(id);layerIds.set(key,id);return id;
  }
  // Keep declared, even empty, layers; round-tripping OmniForge R12 DXF must
  // not erase the construction layer or its user visibility/lock metadata.
  for(const definition of definitions.values())layerId(definition.name);
  const entities=[];
  function point(x,y) {
    const px=ROUND(x*factor),py=ROUND(y*factor);
    if(!Number.isFinite(px)||!Number.isFinite(py)||
        Math.abs(px)>1_000_000||Math.abs(py)>1_000_000)
      throw new Error('Coordenada DXF excede ±1.000.000 mm.');
    return {x:px,y:py};
  }
  function emit(type,layer,geometry) {
    if(entities.length>=MAX_ENTITIES)throw new Error('DXF excede 2000 entidades após conversão.');
    entities.push({id:'imp_'+String(entities.length+1),type,layerId:layer,...geometry});
  }
  for(const source of sourceEntities) {
    const {type,groups}=source;
    assertFlat(groups,type);
    const layer=layerId(get(groups,8));
    if(type==='LINE') {
      const a=point(requireNumber(groups,10,'LINE'),requireNumber(groups,20,'LINE'));
      const b=point(requireNumber(groups,11,'LINE'),requireNumber(groups,21,'LINE'));
      emit('line',layer,{a,b});
    } else if(type==='CIRCLE') {
      const center=point(requireNumber(groups,10,'CIRCLE'),requireNumber(groups,20,'CIRCLE'));
      const radius=ROUND(requireNumber(groups,40,'CIRCLE')*factor);
      emit('circle',layer,{center,radius});
    } else {
      const flags=optionalNumber(groups,70,0,'LWPOLYLINE');
      const count=integer(String(requireNumber(groups,90,'LWPOLYLINE')),'LWPOLYLINE');
      if(!Number.isSafeInteger(flags)||count<2||count>MAX_ENTITIES||
         (flags & ~129)!==0)
        throw new Error('LWPOLYLINE contém flags ou contagem de vértices inválidas.');
      for(const pair of groups) {
        if([40,41,42,43].includes(pair.code) && Math.abs(number(pair.value,'LWPOLYLINE'))>1e-10)
          throw new Error('LWPOLYLINE com largura ou arco (bulge) não é suportada.');
      }
      const vertices=[];
      for(const pair of groups) {
        if(pair.code===10)vertices.push({x:number(pair.value,'Vértice X')});
        if(pair.code===20) {
          if(!vertices.length || vertices.at(-1).y!==undefined)
            throw new Error('Ordem dos vértices LWPOLYLINE inválida.');
          vertices.at(-1).y=number(pair.value,'Vértice Y');
        }
      }
      if(vertices.length!==count || vertices.some(v=>v.y===undefined))
        throw new Error('LWPOLYLINE com vértices incompletos.');
      const converted=vertices.map(v=>point(v.x,v.y));
      const closed=(flags&1)!==0;
      for(let i=1;i<converted.length;i++)
        emit('line',layer,{a:converted[i-1],b:converted[i]});
      if(closed)emit('line',layer,{a:converted.at(-1),b:converted[0]});
    }
  }
  const sketch={
    schemaVersion:1,name:'Desenho importado DXF',units:'mm',
    layers:layers.length?layers:[{id:'principal',name:'Principal',color:'#6CBCEC',visible:true,locked:false}],
    entities
  };
  // This is the same validation used by native save, export and the canvas.
  validateCadSketch(sketch);
  return {
    sketch,
    meta:{
      sourceFormat:'DXF ASCII',
      units:unknownUnits?'não especificadas':specified.label,
      assumedMillimeters:unknownUnits,
      scaleToMm:factor,
      sourceCount:sourceEntities.length,
      entityCount:entities.length,
      layerCount:sketch.layers.length
    }
  };
}
