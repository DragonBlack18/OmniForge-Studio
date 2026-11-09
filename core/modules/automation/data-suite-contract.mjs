import {DATA_SUITE_CATALOG} from './data-suite-catalog.mjs';
export const RESERVED=new Set(['__proto__','prototype','constructor']);
export function safeKey(key){if(typeof key!=='string'||!key||key.length>160||/[\x00-\x1f\x7f]/.test(key)||RESERVED.has(key))throw Error('Chave inválida ou reservada.');return key;}
export function fieldPath(path){if(typeof path!=='string'||path.length>240)throw Error('Campo inválido.');const parts=path.split('.');if(parts.length>16)throw Error('Campo muito profundo.');parts.forEach(safeKey);return parts;}
export function getField(obj,path){let at=obj;for(const p of fieldPath(path)){if(!at||typeof at!=='object'||!Object.hasOwn(at,p))throw Error('Campo ausente: '+path);at=at[p];}return at;}
export function finiteNumber(n){if(typeof n!=='number'||!Number.isFinite(n))throw Error('É necessário um número finito, sem conversão implícita.');return n;}
export function configNumber(n){if(typeof n!=='string'||!n.trim()||!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i.test(n)||!Number.isFinite(Number(n)))throw Error('Configuração numérica inválida.');return Number(n);}
export function conversionSchema(text){let s;try{s=JSON.parse(text);}catch{throw Error('Esquema JSON inválido.');}if(!s||typeof s!=='object'||Array.isArray(s)||!Object.keys(s).length||Object.keys(s).length>64)throw Error('Informe de 1 a 64 campos no esquema.');for(const [k,v]of Object.entries(s)){safeKey(k);if(!['number','string','boolean'].includes(v))throw Error('Tipo de conversão não suportado.');}return s;}
export const UNITS=Object.freeze({mm:['length',.001,0],cm:['length',.01,0],m:['length',1,0],in:['length',.0254,0],ft:['length',.3048,0],g:['mass',.001,0],kg:['mass',1,0],lb:['mass',.45359237,0],Pa:['pressure',1,0],kPa:['pressure',1000,0],bar:['pressure',100000,0],psi:['pressure',6894.757293168,0],C:['temperature',1,273.15],F:['temperature',5/9,273.15-32*5/9],K:['temperature',1,0]});
export function validateDataSuiteNode(node){
  const definition=Object.hasOwn(DATA_SUITE_CATALOG,node?.type)?DATA_SUITE_CATALOG[node.type]:null;if(!definition)return;
  if(!node.config||typeof node.config!=='object'||Array.isArray(node.config)||new TextEncoder().encode(JSON.stringify(node.config)).length>32000)throw Error('Configuração inválida ou maior que 32 KB.');
  for(const f of definition.fields){const value=node.config[f.key];if(typeof value!=='string')throw Error('Configuração deve ser texto: '+f.key);if(f.kind==='select'&&!f.options.includes(value))throw Error('Opção inválida: '+f.key);if(f.kind==='json'){try{JSON.parse(value);}catch{throw Error('JSON de configuração inválido.');}}}
  for(const f of ['path','valuePath','leftKey','rightKey'])if(definition.fields.some(field=>field.key===f))fieldPath(node.config[f]);
  if(node.type==='math.mapRange'){for(const k of ['inputMin','inputMax','outputMin','outputMax'])configNumber(node.config[k]);if(Number(node.config.inputMin)===Number(node.config.inputMax))throw Error('Intervalo de origem degenerado.');}
  if(node.type==='engineering.convertUnit'&&UNITS[node.config.from][0]!==UNITS[node.config.to][0])throw Error('Unidades incompatíveis.');
  if(node.type==='records.coerceFields')conversionSchema(node.config.schema);
}
