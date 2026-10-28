// Browser-safe manifests and validation; runtime actions execute only in the trusted core.

const MAX_CONFIG = 32_000;
const MAX_RESULT = 2_000_000;
const byteCount = value => new TextEncoder().encode(value).length;
const SAFE_PATH = /^[a-zA-Z_$][\w$]*(\.[a-zA-Z_$][\w$]*){0,12}$/;
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);

function err(message) { throw new Error(message); }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function readPath(value, field) {
  if (!SAFE_PATH.test(field) || field.split('.').some(p => FORBIDDEN.has(p))) err('Caminho JSON inválido ou reservado.');
  let current = value;
  for (const key of field.split('.')) {
    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, key)) return { found: false };
    current = current[key];
  }
  return { found: true, value: current };
}
function requiredPath(value, field) {
  const result = readPath(value, field);
  if (!result.found) err(`Campo JSON ausente: ${field}`);
  return result.value;
}
function readJSON(text) {
  if (typeof text !== 'string' || byteCount(text) > MAX_CONFIG) err('JSON de configuração excede 32KB.');
  try { return JSON.parse(text); } catch { err('JSON de configuração inválido.'); }
}
function finite(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) err('Operação requer número finito.');
  return value;
}
function boundedInt(value, lo, hi, name) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < lo || n > hi) err(`${name} deve ficar entre ${lo} e ${hi}.`);
  return n;
}
function array(value) {
  if (!Array.isArray(value) || value.length > 10000) err('Operação requer array com até 10.000 elementos.');
  return value;
}
function text(value) {
  if (typeof value !== 'string' || value.length > MAX_RESULT) err('Operação requer texto com até 2MB.');
  return value;
}
function comparison(input, config) {
  const record = readPath(input, config.path);
  const comparator = config.operator;
  const expected = comparator === 'exists' ? undefined : readJSON(config.value);
  if (comparator === 'exists') return record.found;
  if (!record.found) return false;
  const actual = record.value;
  switch(comparator) {
    case 'eq': return JSON.stringify(actual) === JSON.stringify(expected);
    case 'ne': return JSON.stringify(actual) !== JSON.stringify(expected);
    case 'gt': return finite(actual) > finite(expected);
    case 'gte': return finite(actual) >= finite(expected);
    case 'lt': return finite(actual) < finite(expected);
    case 'lte': return finite(actual) <= finite(expected);
    case 'contains': return typeof actual === 'string' ? actual.includes(text(expected)) : Array.isArray(actual) ? actual.some(x => JSON.stringify(x) === JSON.stringify(expected)) : false;
    default: return err('Operador não reconhecido.');
  }
}
function assertOutput(value) {
  if (value === undefined || (typeof value === 'number' && !Number.isFinite(value))) err('Resultado inválido.');
  if (byteCount(JSON.stringify(value)) > MAX_RESULT) err('Resultado do bloco excede 2 MB.');
  return value;
}
const defs = [
  // Logic and branching
  ['logic.pass', 'Lógica', 'Continuar', 'Mantém os dados sem alterações.', [], v => v],
  ['logic.assert', 'Lógica', 'Verificar condição', 'Falha o fluxo caso a condição não seja verdadeira.', [['path','Campo','text','venda.id'], ['operator','Operador','select','eq','eq','ne','gt','gte','lt','lte','exists','contains'],['value','Comparar com (JSON)','json','1001']], (v,c) => comparison(v,c) ? v : err('Condição não atendida.')],
  ['logic.if', 'Lógica', 'Se / Senão', 'Direciona um fluxo para as portas SIM ou NÃO.', [['path','Campo','text','venda.id'],['operator','Operador','select','eq','eq','ne','gt','gte','lt','lte','exists','contains'],['value','Comparar com (JSON)','json','1001']], (v,c) => comparison(v,c)],
  ['logic.default', 'Lógica', 'Valor padrão', 'Substitui valores nulos por um JSON configurado.', [['value','Padrão (JSON)','json','{}']], (v,c) => v == null ? readJSON(c.value) : v],
  ['logic.combine', 'Lógica', 'Combinar caminhos', 'Une duas portas e permite retorno de ramificações.', [], () => err('Combine é avaliado pelo motor.')],
  // Objects
  ['data.constant', 'Dados', 'Definir JSON', 'Substitui a entrada por um JSON fixo.', [['value','JSON','json','{}']],(_v,c)=>readJSON(c.value)],
  ['data.set', 'Dados', 'Definir campo', 'Altera um campo de um objeto JSON sem mutar a entrada.', [['path','Campo','text','status'],['value','Valor JSON','json','"ok"']],(v,c)=>{if(!object(v))err('Entrada precisa ser objeto.');const copy=structuredClone(v),parts=c.path.split('.'); let cur=copy;for(const part of parts.slice(0,-1)){if(!object(cur[part]))err('Campos pais precisam ser objetos.');cur=cur[part];} cur[parts.at(-1)]=readJSON(c.value);return copy;}],
  ['data.remove', 'Dados', 'Remover campo', 'Remove um campo de um objeto JSON.', [['path','Campo','text','segredo']],(v,c)=>{if(!object(v))err('Entrada precisa ser objeto.');const copy=structuredClone(v),parts=c.path.split('.');let cur=copy;for(const part of parts.slice(0,-1)){if(!object(cur[part]))err('Caminho inexistente.');cur=cur[part];}delete cur[parts.at(-1)];return copy;}],
  ['data.keys', 'Dados', 'Chaves do objeto', 'Retorna as chaves de um objeto.', [],v=>object(v)?Object.keys(v):err('Entrada precisa ser objeto.')],
  ['data.values', 'Dados', 'Valores do objeto', 'Retorna os valores de um objeto.', [],v=>object(v)?Object.values(v):err('Entrada precisa ser objeto.')],
  ['data.count', 'Dados', 'Contar itens', 'Conta itens do array ou propriedades do objeto.', [],v=>Array.isArray(v)?v.length:object(v)?Object.keys(v).length:err('Entrada precisa ser array ou objeto.')],
  ['data.first', 'Dados', 'Primeiro item', 'Extrai o primeiro item de um array.', [],v=>array(v)[0]??null],
  ['data.last', 'Dados', 'Último item', 'Extrai o último item de um array.', [],v=>array(v).at(-1)??null],
  ['data.reverse', 'Dados', 'Inverter itens', 'Inverte a ordem de um array.', [],v=>array(v).toReversed()],
  ['data.unique', 'Dados', 'Itens únicos', 'Remove valores repetidos usando comparação JSON.', [],v=>{const seen=new Set();return array(v).filter(item=>{const k=JSON.stringify(item);if(seen.has(k))return false;seen.add(k);return true;});}],
  ['data.slice', 'Dados', 'Fatiar lista', 'Extrai uma faixa de itens.', [['start','Início','text','0'],['count','Quantidade','text','10']],(v,c)=>array(v).slice(boundedInt(c.start,0,10000,'Início'),boundedInt(c.start,0,10000,'Início')+boundedInt(c.count,0,10000,'Quantidade'))],
  ['data.sort', 'Dados', 'Ordenar lista', 'Ordena valores simples ou por propriedade.', [['path','Campo (vazio para o valor)','text',''],['direction','Ordem','select','asc','asc','desc']],(v,c)=>{const items=array(v).slice();const pick=x=>c.path?requiredPath(x,c.path):x;items.sort((a,b)=>{const u=pick(a),w=pick(b); if(typeof u!==typeof w)err('Tipos inconsistentes.'); if(typeof u!=='number'&&typeof u!=='string')err('Ordenação exige números ou textos.');return(c.direction==='desc'?-1:1)*(u<w?-1:u>w?1:0)});return items;}],
  ['data.pluck', 'Dados', 'Extrair campo por item', 'Lê um caminho de cada item de um array.', [['path','Campo','text','id']],(v,c)=>array(v).map(x=>requiredPath(x,c.path))],
  ['data.filter', 'Dados', 'Filtrar lista', 'Mantém os itens que atendem uma condição.', [['path','Campo','text','ativo'],['operator','Operador','select','eq','eq','ne','gt','gte','lt','lte','exists','contains'],['value','Comparar com (JSON)','json','true']],(v,c)=>array(v).filter(item=>comparison(item,c))],
  ['data.flatten', 'Dados', 'Achatar lista', 'Achata um nível de sublistas.', [],v=>array(v).flat(1)],
  ['data.merge', 'Dados', 'Mesclar objetos', 'Mescla dois objetos JSON de maneira superficial.', [['value','Objeto adicional (JSON)','json','{}']],(v,c)=>{const extra=readJSON(c.value);if(!object(v)||!object(extra))err('Ambos precisam ser objetos.');return {...v,...extra};}],
  // Text
  ['text.upper', 'Texto', 'Maiúsculas', 'Converte texto em letras maiúsculas.', [],v=>text(v).toUpperCase()],
  ['text.lower', 'Texto', 'Minúsculas', 'Converte texto em letras minúsculas.', [],v=>text(v).toLowerCase()],
  ['text.trim', 'Texto', 'Limpar espaços', 'Remove espaços no início e fim.', [],v=>text(v).trim()],
  ['text.replace', 'Texto', 'Substituir trecho', 'Substitui ocorrências literais, sem regex.', [['search','Procurar','text','antigo'],['replacement','Trocar por','text','novo']],(v,c)=>{if(!c.search)err('Trecho de busca obrigatório.');return text(v).replaceAll(c.search,c.replacement);}],
  ['text.split', 'Texto', 'Dividir texto', 'Divide texto por separador literal.', [['separator','Separador','text',',']],(v,c)=>{if(!c.separator)err('Separador obrigatório.');return text(v).split(c.separator);}],
  ['text.join', 'Texto', 'Juntar texto', 'Une uma lista de textos.', [['separator','Separador','text',',']],(v,c)=>array(v).map(text).join(c.separator)],
  ['text.contains', 'Texto', 'Contém texto', 'Verifica ocorrência literal.', [['search','Procurar','text','texto']],(v,c)=>text(v).includes(c.search)],
  ['text.length', 'Texto', 'Tamanho do texto', 'Conta caracteres Unicode.', [],v=>[...text(v)].length],
  ['text.template', 'Texto', 'Preencher modelo', 'Substitui marcadores {{campo}} por valores sem avaliar código.', [['template','Modelo','text','Pedido {{venda.id}}']],(v,c)=>c.template.replace(/\{\{([\w$.]+)\}\}/g,(_,key)=>{const item=requiredPath(v,key);return typeof item==='string'?item:JSON.stringify(item)})],
  // Math
  ['math.add', 'Matemática', 'Somar', 'Adiciona uma constante ao número.', [['value','Número','text','1']],(v,c)=>finite(v)+Number(c.value)],
  ['math.subtract', 'Matemática', 'Subtrair', 'Subtrai uma constante.', [['value','Número','text','1']],(v,c)=>finite(v)-Number(c.value)],
  ['math.multiply', 'Matemática', 'Multiplicar', 'Multiplica um número.', [['value','Número','text','2']],(v,c)=>finite(v)*Number(c.value)],
  ['math.divide', 'Matemática', 'Dividir', 'Divide um número (divisor não pode ser zero).', [['value','Divisor','text','2']],(v,c)=>{const d=Number(c.value);if(d===0)err('Divisão por zero.');return finite(v)/d;}],
  ['math.round', 'Matemática', 'Arredondar', 'Arredonda para um número de casas decimais.', [['digits','Casas decimais','text','2']],(v,c)=>Number(finite(v).toFixed(boundedInt(c.digits,0,12,'Casas decimais')))],
  ['math.abs', 'Matemática', 'Módulo', 'Retorna o valor absoluto.', [],v=>Math.abs(finite(v))],
  ['math.sum', 'Matemática', 'Somar lista', 'Soma todos os números de uma lista.', [],v=>array(v).reduce((a,b)=>a+finite(b),0)],
  ['math.average', 'Matemática', 'Média da lista', 'Calcula média aritmética de números.', [],v=>{const a=array(v);if(!a.length)err('Lista vazia.');return a.reduce((s,x)=>s+finite(x),0)/a.length;}],
  ['math.min', 'Matemática', 'Mínimo da lista', 'Menor número de um array.', [],v=>{const a=array(v).map(finite);if(!a.length)err('Lista vazia.');return Math.min(...a);}],
  ['math.max', 'Matemática', 'Máximo da lista', 'Maior número de um array.', [],v=>{const a=array(v).map(finite);if(!a.length)err('Lista vazia.');return Math.max(...a);}],
  // Encoding and dates
  ['encoding.hash', 'Codificação', 'SHA-256', 'Gera hash SHA-256 de um texto, sem enviar dados.', [],async v=>{const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text(v)));return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');}],
  ['encoding.base64', 'Codificação', 'Codificar Base64', 'Codifica um texto em Base64.', [],v=>Buffer.from(text(v),'utf8').toString('base64')],
  ['encoding.fromBase64', 'Codificação', 'Decodificar Base64', 'Converte Base64 válido em UTF-8.', [],v=>{const s=text(v);if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))err('Base64 inválido.');return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.from(s,'base64'));}],
  ['encoding.toJson', 'Codificação', 'Serializar JSON', 'Transforma dados JSON em texto.', [],v=>JSON.stringify(v)],
  ['encoding.fromJson', 'Codificação', 'Interpretar JSON', 'Converte texto JSON em dados.', [],v=>{try{return JSON.parse(text(v));}catch{err('Texto não é JSON válido.')}}],
  ['encoding.uuid', 'Codificação', 'Gerar UUID', 'Gera identificador v4 aleatório para uso local.', [],()=>crypto.randomUUID()],
  ['date.now', 'Datas', 'Hora atual UTC', 'Gera timestamp ISO 8601 UTC da execução.', [],()=>new Date().toISOString()],
  ['date.addDays', 'Datas', 'Adicionar dias', 'Adiciona dias a uma data ISO de entrada.', [['days','Dias','text','1']],(v,c)=>{const ms=Date.parse(text(v));if(!Number.isFinite(ms))err('Data ISO inválida.');const extra=boundedInt(c.days,-36500,36500,'Dias')*86400000;const t=ms+extra;if(!Number.isFinite(t))err('Data fora do intervalo.');return new Date(t).toISOString();}],
  ['date.year', 'Datas', 'Extrair ano', 'Retorna o ano de um timestamp ISO.', [],v=>{const d=new Date(text(v));if(Number.isNaN(d.valueOf()))err('Data inválida.');return d.getUTCFullYear();}]
];

function createField([key,label,kind,defaultValue,...options]) {
  return kind==='select'?{key,label,kind,default:defaultValue,options}:{key,label,kind,default:defaultValue};
}
export const PURE_CATALOG = Object.freeze(Object.fromEntries(defs.map(([type,category,label,description,fields])=>[
  type, {category,label,description,inputs:[{id:'in',type:'json',required:true}],outputs:[{id:'out',type:'json'}],fields:fields.map(createField)}
])));
// Manual handling in the executor: distinct ports and merge semantics.
PURE_CATALOG['logic.if'].outputs = [{id:'yes',type:'json'},{id:'no',type:'json'}];
PURE_CATALOG['logic.combine'].inputs = [{id:'a',type:'json',required:true},{id:'b',type:'json',required:true}];

export function validatePureNode(node) {
  const definition=PURE_CATALOG[node.type];
  if(!definition)return;
  if(byteCount(JSON.stringify(node.config)) > MAX_CONFIG)err('Configuração do bloco excede 32KB.');
  for (const f of definition.fields) {
    const value=node.config[f.key];
    if(typeof value !== 'string')err(`Configuração ${f.key} deve ser texto.`);
    if(f.kind==='select'&&!f.options.includes(value))err(`Opção inválida: ${f.key}.`);
    if(f.kind==='json')readJSON(value);
  }
  for(const field of ['path']) if(definition.fields.some(f=>f.key===field) && node.config[field]) readPath({}, node.config[field]);
  if(node.type==='text.replace'&&!node.config.search)err('Busca de texto obrigatória.');
  if(node.type==='text.split'&&!node.config.separator)err('Separador obrigatório.');
  if(node.type==='logic.if'||node.type==='logic.assert'||node.type==='data.filter') {
    if(node.config.operator==='exists')return;
    readJSON(node.config.value);
  }
  if(node.type.startsWith('math.') && ['math.add','math.subtract','math.multiply','math.divide'].includes(node.type)) {
    if(node.config.value.trim()===''||!Number.isFinite(Number(node.config.value)))err('Número de configuração inválido.');
    if(node.type==='math.divide'&&Number(node.config.value)===0)err('Divisor não pode ser zero.');
  }
  if(node.type==='math.round')boundedInt(node.config.digits,0,12,'Casas decimais');
  if(node.type==='data.slice') {boundedInt(node.config.start,0,10000,'Início');boundedInt(node.config.count,0,10000,'Quantidade');}
  if(node.type==='date.addDays')boundedInt(node.config.days,-36500,36500,'Dias');
}
export async function executePureNode(type,input,config) {
  const definition=defs.find(d=>d[0]===type);
  if(!definition)err('Executor de transformação indisponível.');
  return assertOutput(await definition[5](input,config));
}
export function pureNodeCount() { return defs.length; }
