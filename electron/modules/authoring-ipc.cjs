'use strict';
/** All paths are workspace-relative; only the native picker can choose a new parent. */
function installAuthoringIpc({register,core,serial,getWorkspace,getWindow,dialog,catalogRoot,activateProject}) {
  const pin=claimed=>{const current=getWorkspace();if(typeof claimed!=='string'||claimed!==current)throw Error('Projeto alterado. Operação de arquivo bloqueada.');return current;};
  register('createAuthoredFile',(claimed,relative,content,parents)=>serial(()=>core.createAuthoredFile(pin(claimed),relative,content,parents)));
  register('createAuthoredFolder',(claimed,relative)=>serial(()=>core.createAuthoredFolder(pin(claimed),relative)));
  register('authoredFileInfo',(claimed,relative)=>core.authoredFileInfo(pin(claimed),relative));
  register('duplicateAuthoredFile',(claimed,source,destination,revision)=>serial(()=>core.duplicateAuthoredFile(pin(claimed),source,destination,revision)));
  register('relocateAuthoredFile',(claimed,source,destination,revision)=>serial(async()=>{
    const root=pin(claimed);
    await core.authoringPath(source);await core.authoringPath(destination);
    if(typeof revision!=='string'||!/^[a-f0-9]{64}$/.test(revision))throw Error('Revisão obrigatória.');
    const answer=await dialog.showMessageBox(getWindow(),{type:'question',title:'Mover arquivo do projeto',
      message:'Confirmar a mudança de caminho?',detail:source+' → '+destination+'\n\nNenhum destino existente será substituído. Referências/importações em outros arquivos não são atualizadas automaticamente.',
      buttons:['Cancelar','Mover arquivo'],defaultId:0,cancelId:0,noLink:true});
    if(answer.response!==1)return null;
    pin(claimed);return core.relocateAuthoredFile(root,source,destination,revision);
  }));
  register('createProjectFromTemplate',(name,templateId)=>serial(async()=>{
    const chosen=await dialog.showOpenDialog(getWindow(),{title:'Escolher pasta que receberá o novo projeto',properties:['openDirectory']});
    if(chosen.canceled||chosen.filePaths.length!==1)return null;
    const result=await core.createProjectScaffold(chosen.filePaths[0],name,templateId);
    const project=await core.registerProject(catalogRoot,result.workspace);
    return {...await activateProject(project),createdFiles:result.files,templateId};
  }));
}
module.exports={installAuthoringIpc};
