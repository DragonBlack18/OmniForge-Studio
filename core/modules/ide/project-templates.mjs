/** Original local starter data. Merely reading these templates never runs their code. */
import data from './project-template-data.json' with {type:'json'};
export const FILE_TEMPLATES=Object.freeze(data.files.map(Object.freeze));
export const PROJECT_TEMPLATES=Object.freeze(data.projects.map(item=>Object.freeze({...item,files:Object.freeze(item.files)})));
export function fileTemplate(id){
  const found=FILE_TEMPLATES.find(item=>item.id===id);
  if(!found)throw new Error('Modelo de arquivo desconhecido.');return found;
}
export function projectTemplate(id){
  const found=PROJECT_TEMPLATES.find(item=>item.id===id);
  if(!found)throw new Error('Modelo de projeto desconhecido.');return found;
}
