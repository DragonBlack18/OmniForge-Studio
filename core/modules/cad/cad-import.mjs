/**
 * OmniForge CAD DXF ASCII boundary with dxf-parser for semantic decoding.
 * Conservative 2D subset: LINE, CIRCLE, ARC and LWPOLYLINE (including bulges).
 * Unsupported geometry is rejected as a whole; nothing is silently dropped.
 * Structural, unit and size checks run before the reusable parser. No file I/O.
 */
import DxfParser from 'dxf-parser';
import { validateCadSketch, MAX_CAD_DOCUMENT_BYTES } from './cad2d.mjs';
import {cadArcFromBulge,normalizeCadAngle} from './cad-arcs.mjs';
import {DXF_IDENTITY,composeDxfTransform,dxfInsertTransform,mapDxfPoint,mapDxfCircle} from './cad-dxf-transform.mjs';

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
const SUPPORTED=new Set(['LINE','CIRCLE','ARC','LWPOLYLINE','INSERT']);
const RESERVED=new Set(['__proto__','prototype','constructor']);

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
    for(const pair of groups.filter(item=>item.code===code))
      if(Math.abs(number(pair.value,type)-expected)>1e-9)throw new Error(type+': geometria fora do plano XY não suportada.');
  }
}
function validateLayerName(name) {
  if(typeof name!=='string' || !name.trim() || name.length>60 ||
      /[\u0000-\u001F\u007F]/.test(name)||RESERVED.has(name.toLowerCase()))
    throw new Error('Nome de camada DXF inválido.');
  return name.trim();
}
function blockName(name){
  if(typeof name!=='string'||!name.trim()||name.length>128||/[\u0000-\u001f\u007f]/.test(name)||RESERVED.has(name.toLowerCase()))
    throw new Error('Nome de bloco DXF inválido.');
  return name;
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
  // A normal-looking INSERT can carry XCLIP in its extension dictionary.
  // Expanding it without the OBJECTS clipping semantics would expose geometry
  // outside the source boundary. Refuse the entire file, including unused
  // clipping metadata, until this boundary explicitly supports those filters.
  if(pairs.some(({code,value})=>(code===0&&value.toUpperCase()==='SPATIAL_FILTER')||
      (code===3&&value.toUpperCase()==='ACAD_FILTER')||
      (code===100&&value.toUpperCase()==='ACDBSPATIALFILTER')))
    throw new Error('DXF com recorte de bloco XCLIP/SPATIAL_FILTER não é suportado. A importação foi cancelada integralmente.');
  const definitions=new Map();
  const blocks=new Map();
  const sourceEntities=[];
  const unsupported=new Set();
  let section=null, headerVariable=null, insunits=null, foundEntities=false, foundEof=false,currentBlock=null,blockEntityCount=0;
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
      if(currentBlock)throw new Error('Bloco DXF sem ENDBLK.');
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
       (['ENTITIES','BLOCKS'].includes(section) && item.code===0)) {
      const type=item.value.toUpperCase();
      let j=i+1;
      while(j<pairs.length && pairs[j].code!==0)j++;
      const groups=pairs.slice(i+1,j);
      if(section==='BLOCKS'){
        if(type==='BLOCK'){
          if(currentBlock)throw new Error('Blocos DXF aninhados sem ENDBLK.');
          const name=blockName(get(groups,2)),key=name.toLowerCase();
          if(blocks.has(key)||blocks.size>=MAX_ENTITIES)throw new Error('Bloco DXF duplicado ou limite de blocos excedido.');
          currentBlock={name,groups,entities:[]};blocks.set(key,currentBlock);
        }else if(type==='ENDBLK'){
          if(!currentBlock)throw new Error('ENDBLK sem definição de bloco.');
          currentBlock=null;
        }else{
          if(!currentBlock)throw new Error('Entidade fora de definição de bloco DXF.');
          currentBlock.entities.push({type,groups});
          if(++blockEntityCount>MAX_ENTITIES)throw new Error('DXF excede 2000 entidades nas definições de bloco.');
        }
      }else if(section==='TABLES') {
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
        definitions.set(name.toLowerCase(),{name,color:hex,visible:color>=0&&(flags&1)===0,locked:Boolean(flags&4)});
      } else if(SUPPORTED.has(type)) {
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
  if(!sourceEntities.length)throw new Error('DXF sem linhas, círculos, arcos ou polilinhas compatíveis.');

  const unknownUnits=insunits===null || insunits===0;
  if(unknownUnits && !assumeMillimeters)
    throw new Error('DXF sem unidade explícita. Confirme a interpretação em milímetros.');
  const specified=unknownUnits?null:SCALE.get(insunits);
  if(!unknownUnits && !specified)
    throw new Error('Unidades DXF não suportadas ($INSUNITS='+insunits+').');
  const factor=specified?.factor??1;
  let parsed;
  try {parsed=new DxfParser().parseSync(contents);}
  catch(error){throw new Error('Estrutura DXF não pôde ser decodificada: '+String(error?.message||error).slice(0,160));}
  if(!parsed||!Array.isArray(parsed.entities)||parsed.entities.length!==sourceEntities.length)
    throw new Error('Decodificação DXF divergente; importação cancelada integralmente.');
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
  let expandedBlockCount=0;
  function point(x,y) {
    const px=ROUND(x),py=ROUND(y);
    if(!Number.isFinite(px)||!Number.isFinite(py)||
        Math.abs(px)>1_000_000||Math.abs(py)>1_000_000)
      throw new Error('Coordenada DXF excede ±1.000.000 mm.');
    return {x:px,y:py};
  }
  function emit(type,layer,geometry,context,source) {
    if(entities.length>=MAX_ENTITIES)throw new Error('DXF excede 2000 entidades após conversão.');
    const mapped=type==='line'?{a:mapDxfPoint(geometry.a,context.matrix,factor),b:mapDxfPoint(geometry.b,context.matrix,factor)}:
      mapDxfCircle(geometry,context.matrix,factor);
    if(type==='line'){mapped.a=point(mapped.a.x,mapped.a.y);mapped.b=point(mapped.b.x,mapped.b.y);}
    else{mapped.center=point(mapped.center.x,mapped.center.y);mapped.radius=ROUND(mapped.radius);}
    const provenance={format:'DXF',entityType:source.type,blockPath:context.blockPath,insertPath:context.insertPath};
    const handle=get(source.groups,5);
    if(handle!==undefined)provenance.handle=handle;
    entities.push({id:'imp_'+String(entities.length+1),type,layerId:layer,...mapped,
      ...(context.visible===false?{visible:false}:{}),source:provenance,
      ...(context.blockPath.length?{name:(context.blockPath.at(-1)+' · '+source.type).slice(0,80)}:{})});
  }
  function convert(source,decoded,parent){
    const {type,groups}=source;
    if(!SUPPORTED.has(type))throw new Error('Bloco DXF contém entidade não suportada: '+type+'. A importação foi cancelada integralmente.');
    if(decoded?.type!==type)throw new Error('Ordem das entidades DXF divergente; importação cancelada integralmente.');
    assertFlat(groups,type);
    if(optionalNumber(groups,67,0,type)!==0)throw new Error('Entidades em paper space não são suportadas neste desenho XY.');
    const visibility=optionalNumber(groups,60,0,type);
    if(![0,1].includes(visibility))throw new Error('Visibilidade DXF inválida.');
    const context={...parent,visible:parent.visible!==false&&visibility===0};
    const sourceLayer=get(groups,8)||'0';
    const layer=sourceLayer==='0'&&context.layerId?context.layerId:layerId(sourceLayer);
    if(type==='INSERT'){
      const name=blockName(get(groups,2)),key=name.toLowerCase(),block=blocks.get(key);
      if(!block)throw new Error('INSERT referencia bloco DXF inexistente: '+name+'.');
      if(context.blockPath.length>=8||context.blockPath.some(value=>value.toLowerCase()===key))
        throw new Error('INSERT com referência circular ou profundidade superior a 8.');
      const flags=optionalNumber(block.groups,70,0,'BLOCK');
      if(!Number.isSafeInteger(flags)||flags!==0||get(block.groups,1)||name.startsWith('*'))
        throw new Error('INSERT de bloco anônimo, dinâmico, com atributos ou XREF não é suportado.');
      if(optionalNumber(groups,66,0,'INSERT')!==0||optionalNumber(groups,70,1,'INSERT')!==1||optionalNumber(groups,71,1,'INSERT')!==1)
        throw new Error('INSERT com atributos ou matriz de linhas/colunas não é suportado.');
      assertFlat(block.groups,'BLOCK');
      if(block.entities.some(item=>!SUPPORTED.has(item.type)))throw new Error('Bloco DXF contém entidades não suportadas. A importação foi cancelada integralmente.');
      const decodedBlock=parsed.blocks?.[block.name];
      if(!decodedBlock||!Array.isArray(decodedBlock.entities)||decodedBlock.entities.length!==block.entities.length||!block.entities.length)
        throw new Error('INSERT de bloco vazio ou com decodificação divergente.');
      const local=dxfInsertTransform({position:{x:requireNumber(groups,10,'INSERT'),y:requireNumber(groups,20,'INSERT')},
        base:{x:optionalNumber(block.groups,10,0,'BLOCK'),y:optionalNumber(block.groups,20,0,'BLOCK')},
        sx:optionalNumber(groups,41,1,'INSERT'),sy:optionalNumber(groups,42,1,'INSERT'),rotation:optionalNumber(groups,50,0,'INSERT')});
      if(++expandedBlockCount>MAX_ENTITIES)throw new Error('DXF excede 2000 instâncias de bloco.');
      const nested={matrix:composeDxfTransform(context.matrix,local),layerId:layer,visible:context.visible,
        blockPath:[...context.blockPath,name],insertPath:[...context.insertPath,'insert_'+expandedBlockCount]};
      for(const [index,child]of block.entities.entries())convert(child,decodedBlock.entities[index],nested);
    }else if(type==='LINE') {
      for(const code of [10,20,11,21])requireNumber(groups,code,'LINE');
      if(decoded.vertices?.length!==2)throw new Error('LINE com vértices incompletos.');
      const a=decoded.vertices[0],b=decoded.vertices[1];
      emit('line',layer,{a,b},context,source);
    } else if(type==='CIRCLE'||type==='ARC') {
      for(const code of [10,20,40])requireNumber(groups,code,type);
      const center=decoded.center,radius=decoded.radius;
      if(type==='ARC'){
        const startAngle=normalizeCadAngle(requireNumber(groups,50,'ARC'));
        const endAngle=normalizeCadAngle(requireNumber(groups,51,'ARC'));
        emit('arc',layer,{center,radius,startAngle,endAngle},context,source);
      }else emit('circle',layer,{center,radius},context,source);
    } else {
      const flags=optionalNumber(groups,70,0,'LWPOLYLINE');
      const count=integer(String(requireNumber(groups,90,'LWPOLYLINE')),'LWPOLYLINE');
      if(!Number.isSafeInteger(flags)||count<2||count>MAX_ENTITIES||
         (flags & ~129)!==0)
        throw new Error('LWPOLYLINE contém flags ou contagem de vértices inválidas.');
      for(const pair of groups) {
        if([40,41,43].includes(pair.code) && Math.abs(number(pair.value,'LWPOLYLINE'))>1e-10)
          throw new Error('LWPOLYLINE com largura não é suportada.');
        if(pair.code===42)number(pair.value,'Bulge da polilinha');
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
      if(!Array.isArray(decoded.vertices)||decoded.vertices.length!==count)
        throw new Error('Decodificação de vértices LWPOLYLINE divergente.');
      const converted=decoded.vertices.map(v=>({x:v.x,y:v.y}));
      const closed=(flags&1)!==0;
      const segment=(from,to,index)=>{
        const bulge=decoded.vertices[index].bulge||0;
        if(Math.abs(bulge)>1e-10)emit('arc',layer,cadArcFromBulge(from,to,bulge),context,source);
        else emit('line',layer,{a:from,b:to},context,source);
      };
      for(let i=1;i<converted.length;i++)segment(converted[i-1],converted[i],i-1);
      // Some valid closed polylines repeat their first vertex at the end.
      // Do not emit a degenerate duplicate closing segment in that case.
      if(closed && (converted.at(-1).x!==converted[0].x ||
                    converted.at(-1).y!==converted[0].y))
        segment(converted.at(-1),converted[0],converted.length-1);
    }
  }
  const rootContext={matrix:DXF_IDENTITY,blockPath:[],insertPath:[],visible:true,layerId:null};
  for(const [sourceIndex,source]of sourceEntities.entries())convert(source,parsed.entities[sourceIndex],rootContext);
  const sketch={
    schemaVersion:1,name:'Desenho importado DXF',units:'mm',
    layers:layers.length?layers:[{id:'principal',name:'Principal',color:'#6CBCEC',visible:true,locked:false}],
    entities
  };
  // This is the same validation used by native save, export and the canvas.
  validateCadSketch(sketch);
  if(Buffer.byteLength(JSON.stringify(sketch,null,2)+'\n')>MAX_CAD_DOCUMENT_BYTES)
    throw new Error('DXF expandido excede 1,5 MB no documento CAD. A importação foi cancelada integralmente.');
  return {
    sketch,
    meta:{
      sourceFormat:'DXF ASCII',
      units:unknownUnits?'não especificadas':specified.label,
      assumedMillimeters:unknownUnits,
      scaleToMm:factor,
      sourceCount:sourceEntities.length,
      entityCount:entities.length,
      layerCount:sketch.layers.length,
      expandedBlockCount,
      warnings:expandedBlockCount?['Blocos estáticos convertidos em entidades independentes. A proveniência fica no desenho OmniForge; o DXF exportado contém a geometria desagrupada.']:[]
    }
  };
}
