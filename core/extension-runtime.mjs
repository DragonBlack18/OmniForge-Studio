/**
 * OmniForge Extension SDK v1.
 * Declarative, data-only automation packages. No eval(), dynamic import,
 * executable JavaScript, filesystem access or network access in a manifest.
 * Extension-specific effects are delegated to the existing bounded host API.
 */
import { writeOutputJson } from './workspace.mjs';

export const EXTENSION_SCHEMA = 1;
export const EXTENSION_FILE_MAX_BYTES = 131072;
export const EXTENSION_VALUE_MAX_BYTES = 131072;
export const EXTENSION_PERMISSIONS = Object.freeze([
  'workflow.transform', 'workspace.output.write'
]);
const MANIFEST_ID = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*){1,5}$/;
const ACTION_ID = /^[a-z][a-z0-9-]{0,35}$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const KEY = /^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/;
const FILE = /^[a-zA-Z0-9_-]{1,100}\.json$/i;
const TOKEN = /\{\{([a-zA-Z_][\w-]*(?:\.[a-zA-Z_][\w-]*){0,11})\}\}/g;
const FORBIDDEN = new Set(['__proto__','prototype','constructor']);
const OPS = Object.freeze([
  'pick','wrap','number.scale','number.round','text.trim','text.upper',
  'text.lower','text.template','array.length','json.stringify'
]);
const bytes = value => Buffer.byteLength(JSON.stringify(value)??'','utf8');
function assertKeys(value, allowed, label) {
  if(!value || typeof value!=='object' || Array.isArray(value))
    throw new Error(label+' deve ser um objeto.');
  for(const k of Object.keys(value))
    if(!allowed.includes(k))throw new Error(label+': campo não reconhecido: '+k);
}
function label(value,max,labelName) {
  if(typeof value!=='string' || !value.trim() || value.length>max ||
     /[\u0000-\u001f\u007f]/.test(value))throw new Error(labelName+' inválido.');
  return value;
}
function safeKey(key,what) {
  if(typeof key!=='string' || !KEY.test(key) || FORBIDDEN.has(key))
    throw new Error(what+': identificador inválido.');
  return key;
}
function safePath(path) {
  if(typeof path!=='string' || path.length>180)
    throw new Error('Caminho de dados inválido.');
  for(const segment of path.split('.'))safeKey(segment,'Caminho de dados');
  if(path.split('.').length>12)throw new Error('Caminho possui muitos níveis.');
  return path;
}
function assertStep(step) {
  assertKeys(step,['op','path','key','factor','digits','template'],'Etapa');
  if(!OPS.includes(step.op))throw new Error('Operação de extensão indisponível: '+step.op);
  const keysByOp = {
    pick:['op','path'],wrap:['op','key'],
    'number.scale':['op','factor'],'number.round':['op','digits'],
    'text.trim':['op'],'text.upper':['op'],'text.lower':['op'],
    'text.template':['op','template'],'array.length':['op'],
    'json.stringify':['op']
  };
  assertKeys(step,keysByOp[step.op],'Etapa '+step.op);
  if(step.op==='pick')safePath(step.path);
  if(step.op==='wrap')safeKey(step.key,'Campo de resultado');
  if(step.op==='number.scale' &&
    (typeof step.factor!=='number' || !Number.isFinite(step.factor) || Math.abs(step.factor)>1e8))
    throw new Error('Fator numérico da extensão inválido.');
  if(step.op==='number.round' && (!Number.isInteger(step.digits)||step.digits<0||step.digits>6))
    throw new Error('Precisão numérica inválida.');
  if(step.op==='text.template') {
    if(typeof step.template!=='string' || !step.template.length || step.template.length>2048 ||
      /[\u0000-\u0008]/.test(step.template))
      throw new Error('Modelo de texto inválido.');
    // Detect malformed/unsupported substitutions rather than substituting silently.
    const without = step.template.replace(TOKEN,(_,path)=>{safePath(path);return '';});
    if(without.includes('{{') || without.includes('}}'))
      throw new Error('Variável de texto inválida. Use {{campo.subcampo}}.');
  }
}
export function validateExtensionManifest(manifest) {
  assertKeys(manifest,[
    'schemaVersion','id','version','name','description','permissions','actions'
  ],'Manifesto de extensão');
  if(manifest.schemaVersion!==EXTENSION_SCHEMA || typeof manifest.id!=='string' ||
     !MANIFEST_ID.test(manifest.id) || !VERSION.test(manifest.version))
    throw new Error('Manifesto: contrato, identificador ou versão incompatível.');
  label(manifest.name,72,'Nome da extensão');
  label(manifest.description,300,'Descrição da extensão');
  if(!Array.isArray(manifest.permissions)||!manifest.permissions.length ||
     manifest.permissions.length>EXTENSION_PERMISSIONS.length ||
     new Set(manifest.permissions).size!==manifest.permissions.length ||
     manifest.permissions.some(p=>!EXTENSION_PERMISSIONS.includes(p)) ||
     !manifest.permissions.includes('workflow.transform'))
    throw new Error('Permissões de extensão inválidas.');
  if(!Array.isArray(manifest.actions) || !manifest.actions.length || manifest.actions.length>16)
    throw new Error('A extensão precisa declarar de 1 a 16 ações.');
  const actionIds=new Set();
  for(const action of manifest.actions) {
    assertKeys(action,['id','name','description','steps','outputFile'],'Ação');
    if(typeof action.id!=='string'||!ACTION_ID.test(action.id)||actionIds.has(action.id))
      throw new Error('ID de ação duplicado ou inválido.');
    actionIds.add(action.id);
    label(action.name,72,'Nome da ação');
    label(action.description,300,'Descrição da ação');
    if(!Array.isArray(action.steps)||!action.steps.length||action.steps.length>24)
      throw new Error('Ação requer entre 1 e 24 etapas.');
    for(const step of action.steps)assertStep(step);
    if(action.outputFile!==undefined &&
       (!FILE.test(action.outputFile) || !manifest.permissions.includes('workspace.output.write')))
      throw new Error('Ação de escrita exige nome JSON seguro e permissão explícita.');
  }
  if(bytes(manifest)>EXTENSION_FILE_MAX_BYTES)
    throw new Error('Manifesto excede 128 KB.');
  return manifest;
}
function getPath(value,path) {
  let current=value;
  for(const name of path.split('.')) {
    if(current===null || typeof current!=='object' ||
       !Object.hasOwn(current,name))
      throw new Error('Campo obrigatório ausente: '+path);
    current=current[name];
  }
  return current;
}
function expectNumber(value) {
  if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>1e12)
    throw new Error('A operação exige um número finito.');
  return value;
}
function expectText(value) {
  if(typeof value!=='string' || Buffer.byteLength(value,'utf8')>EXTENSION_VALUE_MAX_BYTES)
    throw new Error('A operação exige uma string de até 128 KB.');
  return value;
}
function ensureJsonValue(value) {
  if(value===undefined || typeof value==='function' || typeof value==='symbol' ||
     bytes(value)>EXTENSION_VALUE_MAX_BYTES)
    throw new Error('Dado de extensão incompatível ou maior que 128 KB.');
  try {return JSON.parse(JSON.stringify(value));}
  catch {throw new Error('Dado de extensão não é JSON válido.');}
}
export function executeExtensionSteps(action,input) {
  if(!action || !Array.isArray(action.steps))throw new Error('Ação de extensão inválida.');
  const original=ensureJsonValue(input);
  let current=original;
  for(const step of action.steps) {
    assertStep(step);
    if(step.op==='pick')current=getPath(current,step.path);
    else if(step.op==='wrap')current={[step.key]:current};
    else if(step.op==='number.scale') {
      const result=expectNumber(current)*step.factor;
      if(!Number.isFinite(result)||Math.abs(result)>1e12)
        throw new Error('Resultado numérico fora dos limites.');
      current=Number(result.toPrecision(12));
    } else if(step.op==='number.round')
      current=Number(expectNumber(current).toFixed(step.digits));
    else if(step.op==='text.trim')current=expectText(current).trim();
    else if(step.op==='text.upper')current=expectText(current).toLocaleUpperCase('pt-BR');
    else if(step.op==='text.lower')current=expectText(current).toLocaleLowerCase('pt-BR');
    else if(step.op==='text.template')
      current=step.template.replace(TOKEN,(_,path)=>{
        const value=getPath(original,path);
        if(value===null)return 'null';
        if(typeof value==='object')return JSON.stringify(value);
        return String(value);
      });
    else if(step.op==='array.length') {
      if(!Array.isArray(current))throw new Error('A operação exige uma lista JSON.');
      current=current.length;
    } else if(step.op==='json.stringify') current=JSON.stringify(current);
    current=ensureJsonValue(current);
  }
  return current;
}
export function resolveExtensionAction(config,extensions) {
  if(!config||typeof config.extensionId!=='string'||
     typeof config.actionId!=='string'||!Array.isArray(extensions)||
     extensions.length>40)
    throw new Error('Configuração de extensão inválida.');
  const entry=extensions.find(e=>e?.manifest?.id===config.extensionId);
  if(!entry||entry.enabled!==true)
    throw new Error('Extensão desativada ou não instalada: '+config.extensionId);
  validateExtensionManifest(entry.manifest);
  const action=entry.manifest.actions.find(a=>a.id===config.actionId);
  if(!action)throw new Error('Ação de extensão não encontrada.');
  const grants=entry.grants;
  if(!Array.isArray(grants) || !grants.includes('workflow.transform'))
    throw new Error('A extensão não tem permissão de transformação neste workspace.');
  if(action.outputFile && !grants.includes('workspace.output.write'))
    throw new Error('Permissão para gravar saída não autorizada neste workspace.');
  return {entry,action};
}
export async function runExtensionAction(config,input,{extensions=[],workspace,dryRun=true}={}) {
  const {action}=resolveExtensionAction(config,extensions);
  const output=executeExtensionSteps(action,input);
  const artifact=action.outputFile
    ? await writeOutputJson(workspace,action.outputFile,output,{dryRun})
    : null;
  return {output,artifact};
}
