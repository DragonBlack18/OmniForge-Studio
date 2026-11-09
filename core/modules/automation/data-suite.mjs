/** Worker-only transformations: bounded JSON, no eval, shell, network or filesystem. */
import Papa from '../../vendor/papaparse.cjs';
import {safeKey,fieldPath,getField,finiteNumber,configNumber,conversionSchema,UNITS,validateDataSuiteNode} from './data-suite-contract.mjs';
import {DATA_SUITE_CATALOG} from './data-suite-catalog.mjs';
const MAX_BYTES=2_000_000,MAX_ROWS=10000,MAX_COLUMNS=64;
function fail(msg){throw Error(msg);}
function array(v){if(!Array.isArray(v)||v.length>MAX_ROWS)fail('Informe uma lista de até 10.000 itens.');return v;}
function object(v){if(v===null||typeof v!=='object'||Array.isArray(v))fail('Informe um objeto JSON.');return v;}
function text(v){if(typeof v!=='string'||Buffer.byteLength(v)>MAX_BYTES)fail('Informe texto de até 2 MB.');return v;}
export function assertSuiteJSON(value){
  let count=0;const seen=new Set();
  function walk(v,depth){if(++count>150000||depth>32)fail('JSON excede o limite de estrutura.');if(v===null||typeof v==='string'||typeof v==='boolean')return;if(typeof v==='number'){finiteNumber(v);return;}if(typeof v!=='object'||seen.has(v))fail('JSON inválido ou cíclico.');if(!Array.isArray(v)&&![Object.prototype,null].includes(Object.getPrototypeOf(v)))fail('Objeto não é JSON simples.');seen.add(v);for(const k of Object.keys(v)){safeKey(k);walk(v[k],depth+1);}seen.delete(v);}
  walk(value,0);if(Buffer.byteLength(JSON.stringify(value))>MAX_BYTES)fail('JSON excede 2 MB.');return value;
}
function keyToken(v){if(v!==null&&!['number','string','boolean'].includes(typeof v))fail('A chave precisa ser simples.');if(typeof v==='number')finiteNumber(v);return JSON.stringify(v);}
function table(v){const records=array(v);if(!records.length)return {keys:[],rows:records};const keys=Object.keys(object(records[0]));if(!keys.length||keys.length>MAX_COLUMNS)fail('Tabela deve possuir de 1 a 64 colunas.');keys.forEach(safeKey);const signature=[...keys].sort().join('\0');for(const row of records){if(Object.keys(object(row)).sort().join('\0')!==signature)fail('Todos os registros devem possuir as mesmas colunas.');}return {keys,rows:records};}
function iso(v){text(v);if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(v))fail('Use ISO UTC explícito, por exemplo 2026-01-01T00:00:00Z.');const millis=Date.parse(v);if(!Number.isFinite(millis))fail('Data inválida.');const normalized=v.replace(/(?:\.(\d{1,3}))?Z$/,(_,fraction)=>'.'+(fraction||'').padEnd(3,'0')+'Z');if(new Date(millis).toISOString()!==normalized)fail('Data de calendário inválida.');return millis;}
function canonical(v){if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';return JSON.stringify(v);}
const implementations={
  'codec.csvRead':(v,c)=>{
    const result=Papa.parse(text(v),{delimiter:c.delimiter==='tab'?'\t':c.delimiter,header:false,dynamicTyping:false,skipEmptyLines:'greedy',preview:MAX_ROWS+2});
    if(result.errors.length)fail('CSV inválido: '+result.errors[0].code);
    if(result.meta.truncated||result.data.length>MAX_ROWS+1)fail('CSV excede 10.000 registros.');
    const [header,...rows]=result.data;if(!header?.length||header.length>MAX_COLUMNS)fail('CSV exige cabeçalho de até 64 colunas.');
    header.forEach(safeKey);if(new Set(header).size!==header.length)fail('Cabeçalho CSV duplicado.');
    return rows.map((row,i)=>{if(row.length!==header.length)fail('Quantidade de colunas divergente na linha '+(i+2)+'.');return Object.fromEntries(header.map((key,j)=>[key,row[j]]));});
  },
  'codec.csvWrite':(v,c)=>{
    const {keys,rows}=table(v);if(!keys.length)return '';
    for(const row of rows)for(const k of keys)if(row[k]!==null&&!['string','number','boolean'].includes(typeof row[k]))fail('CSV aceita somente valores simples.');
    return Papa.unparse({fields:keys,data:rows.map(row=>keys.map(k=>row[k]))},{delimiter:c.delimiter==='tab'?'\t':c.delimiter,newline:'\r\n',escapeFormulae:c.formulaProtection==='yes'});
  },
  'codec.ndjsonRead':v=>{const lines=text(v).split(/\r?\n/).filter(s=>s.trim());if(lines.length>MAX_ROWS)fail('NDJSON excede 10.000 linhas.');return lines.map((s,i)=>{try{return JSON.parse(s);}catch{fail('JSON inválido na linha não vazia '+(i+1)+'.');}});},
  'codec.ndjsonWrite':v=>array(v).map(item=>JSON.stringify(item)).join('\n')+(v.length?'\n':''),
  'records.distinctBy':(v,c)=>{const seen=new Set();return array(v).filter(row=>{const token=keyToken(getField(row,c.path));if(seen.has(token))return false;seen.add(token);return true;});},
  'records.countBy':(v,c)=>{const groups=new Map();for(const row of array(v)){const key=getField(row,c.path),token=keyToken(key);if(!groups.has(token))groups.set(token,{key,count:0});groups.get(token).count++;}return [...groups.values()];},
  'records.aggregateBy':(v,c)=>{const groups=new Map();for(const row of array(v)){const key=getField(row,c.path),token=keyToken(key),n=finiteNumber(getField(row,c.valuePath));if(!groups.has(token))groups.set(token,{key,count:0,sum:0,min:n,max:n});const g=groups.get(token);g.count++;g.sum=finiteNumber(g.sum+n);g.min=Math.min(g.min,n);g.max=Math.max(g.max,n);}return [...groups.values()].map(g=>({...g,average:g.sum/g.count}));},
  'records.joinBy':(v,c)=>{const left=array(object(v).left),right=array(v.right),index=new Map();for(const row of right){object(row);const token=keyToken(getField(row,c.rightKey));if(index.has(token))fail('A tabela direita contém chave duplicada.');index.set(token,row);}const result=[];for(const row of left){object(row);const token=keyToken(getField(row,c.leftKey)),match=index.get(token);if(match||c.mode==='left')result.push({left:row,right:match??null});}return result;},
  'records.columnsToRows':v=>{const columns=object(v),keys=Object.keys(columns);if(!keys.length)return [];if(keys.length>MAX_COLUMNS)fail('Limite de 64 colunas.');const length=array(columns[keys[0]]).length;for(const k of keys){safeKey(k);if(array(columns[k]).length!==length)fail('Colunas têm tamanhos diferentes.');}return Array.from({length},(_,i)=>Object.fromEntries(keys.map(k=>[k,columns[k][i]])));},
  'records.rowsToColumns':v=>{const {keys,rows}=table(v);return Object.fromEntries(keys.map(k=>[k,rows.map(row=>row[k])]));},
  'object.flattenPaths':v=>{object(v);const entries=[];function walk(value,prefix,depth){if(depth>16)fail('Objeto muito profundo.');const keys=Object.keys(value);for(const k of keys){safeKey(k);if(k.includes('.'))fail('Chave com ponto é ambígua.');const full=prefix?prefix+'.'+k:k,child=value[k];if(child&&typeof child==='object'&&!Array.isArray(child)&&Object.keys(child).length)walk(child,full,depth+1);else entries.push([full,child]);}}walk(v,'',0);return Object.fromEntries(entries);},
  'object.expandPaths':v=>{const entries=Object.entries(object(v)),out={};const names=new Set(Object.keys(v));for(const name of names){const parts=fieldPath(name);for(let i=1;i<parts.length;i++)if(names.has(parts.slice(0,i).join('.')))fail('Prefixos de caminhos conflitantes.');}for(const [path,value]of entries){const parts=fieldPath(path);let at=out;for(const k of parts.slice(0,-1)){if(Object.hasOwn(at,k)){if(at[k]===null||typeof at[k]!=='object'||Array.isArray(at[k]))fail('Prefixos de caminhos conflitantes.');}else at[k]={};at=at[k];}const key=parts.at(-1);if(Object.hasOwn(at,key))fail('Caminhos conflitantes.');at[key]=value;}const sorted=Object.keys(v).sort();for(let i=1;i<sorted.length;i++)if(sorted[i].startsWith(sorted[i-1]+'.'))fail('Prefixos de caminhos conflitantes.');return out;},
  'object.entries':v=>Object.entries(object(v)),
  'object.fromEntries':v=>{const out={};for(const pair of array(v)){if(!Array.isArray(pair)||pair.length!==2)fail('Cada item deve ser um par [chave,valor].');const key=safeKey(pair[0]);if(Object.hasOwn(out,key))fail('Chave duplicada.');out[key]=pair[1];}return out;},
  'records.partition':(v,c)=>{const expected=canonical(JSON.parse(c.value)),matching=[],other=[];for(const row of array(v))(canonical(getField(row,c.path))===expected?matching:other).push(row);return {matching,other};},
  'math.statistics':v=>{const a=array(v).map(finiteNumber);if(!a.length)fail('Lista vazia.');let mean=0,m2=0,sum=0;for(let i=0;i<a.length;i++){sum=finiteNumber(sum+a[i]);const delta=a[i]-mean;mean+=delta/(i+1);m2+=delta*(a[i]-mean);}const sorted=a.slice().sort((a,b)=>a-b),n=a.length,median=n%2?sorted[(n-1)/2]:sorted[n/2-1]/2+sorted[n/2]/2;return {count:n,sum,mean,median,min:sorted[0],max:sorted.at(-1),variance:Math.max(0,m2/n),standardDeviation:Math.sqrt(Math.max(0,m2/n))};},
  'math.mapRange':(v,c)=>{const [a,b,x,y]=['inputMin','inputMax','outputMin','outputMax'].map(k=>configNumber(c[k]));return finiteNumber(x+(finiteNumber(v)-a)/(b-a)*(y-x));},
  'engineering.convertUnit':(v,c)=>{const a=UNITS[c.from],b=UNITS[c.to],base=finiteNumber(v)*a[1]+a[2];if(a[0]==='temperature'&&base< -1e-9)fail('Temperatura abaixo do zero absoluto.');return finiteNumber((base-b[2])/b[1]);},
  'text.normalizeSpace':v=>text(v).trim().replace(/\s+/gu,' '),
  'text.slug':v=>{const s=text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');if(!s)fail('O texto não contém letras ou números ASCII utilizáveis.');return s;},
  'encoding.urlEncode':v=>encodeURIComponent(text(v)),
  'encoding.urlDecode':v=>{try{return decodeURIComponent(text(v));}catch{fail('Componente URL inválido.');}},
  'date.epochConvert':(v,c)=>{if(c.direction==='toEpoch')return iso(v);if(!Number.isSafeInteger(finiteNumber(v))||v< -62167219200000||v>253402300799999)fail('Timestamp fora do intervalo de anos 0000 a 9999.');return new Date(v).toISOString();},
  'date.difference':(v,c)=>(iso(object(v).end)-iso(v.start))/({milliseconds:1,seconds:1000,minutes:60000,hours:3600000,days:86400000}[c.unit]),
  'records.coerceFields':(v,c)=>{const schema=conversionSchema(c.schema);return array(v).map(row=>{const out={...object(row)};for(const [k,type]of Object.entries(schema)){if(!Object.hasOwn(row,k))fail('Campo ausente: '+k);const value=row[k];if(type==='number'){out[k]=typeof value==='number'?finiteNumber(value):configNumber(value);}else if(type==='boolean'){if(typeof value==='boolean')out[k]=value;else if(value==='true'||value==='false')out[k]=value==='true';else fail('Booleano exige true ou false explícito.');}else{if(value!==null&&!['string','number','boolean'].includes(typeof value))fail('Conversão para texto requer valor simples.');out[k]=String(value);}}return out;});},
  'encoding.stableJson':v=>canonical(v)
};
export const DATA_SUITE_EXECUTORS=Object.freeze(implementations);
export async function executeDataSuite(type,input,config){
  if(!Object.hasOwn(DATA_SUITE_CATALOG,type)||!Object.hasOwn(implementations,type))throw Error('Bloco de dados desconhecido.');
  validateDataSuiteNode({type,config});assertSuiteJSON(input);
  const output=implementations[type](input,config);assertSuiteJSON(output);return output;
}
