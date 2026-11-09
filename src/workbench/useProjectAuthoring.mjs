import {useState} from 'react';
/** Coordinates existing document ownership with pinned native file capabilities. */
export function useProjectAuthoring({code,workspace,busy,execute,applyProject,confirmProjectSwitch,
  flushFlow,setFiles,setMode,setSideMode,notify}){
  const [request,setRequest]=useState(null);
  const revealCode=()=>{setMode('code');setSideMode('files');};
  const begin=(kind,path)=>{
    if(busy)return;
    try{
      if(kind==='new'){code.controller.newDocument();revealCode();return;}
      if(kind==='reopen'){execute(async()=>{await code.controller.reopenClosed();revealCode();});return;}
      if(kind==='close-saved'||kind==='close-others'){execute(async()=>notify((await code.controller.closeSaved({exceptActive:kind==='close-others'}))+' aba(s) salvas fechadas.'));return;}
      const source=path||code.controller.getSnapshot().documents.find(d=>d.key===code.controller.getSnapshot().active)?.path;
      if(['save-as','manage','info','duplicate','rename','move'].includes(kind)&&!source)throw Error('Selecione um arquivo.');
      if(['folder','manage','info','duplicate','rename','move'].includes(kind)&&!workspace)throw Error('Abra ou crie um projeto.');
      setRequest({kind,path:source||'',scope:code.controller.getSnapshot().scope});
    }catch(error){notify(error.message);}
  };
  const submit=async spec=>{
    const scope=code.controller.getSnapshot().scope;
    if(request&&request.scope!==scope)throw Error('O diálogo pertence a outro projeto. Reabra a operação.');
    const current=()=>{if(code.controller.getSnapshot().scope!==scope)throw Error('Projeto alterado durante a operação.');};
    const refresh=async()=>{current();const files=await window.omni.listFiles();current();setFiles(files);};
    if(spec.kind==='template'){
      const {fileTemplate}=await import('../../core/modules/ide/project-templates.mjs');current();
      const t=fileTemplate(spec.templateId);code.controller.newDocument({extension:t.extension,content:t.content});revealCode();notify('Modelo aberto em memória. Use Salvar como para criar o arquivo.');return true;
    }
    if(spec.kind==='choose-project'){
      const result=await window.omni.selectWorkspace();current();if(!result)return null;
      // Only the initial scratch-only session may attach without discarding.
      await applyProject(result);revealCode();return null;
    }
    if(spec.kind==='project'){
      if(workspace&&!await confirmProjectSwitch())return null;
      await flushFlow();if(!await code.controller.flush({allowUntitled:!workspace}))throw Error('Salve os documentos sem nome antes de trocar de projeto.');
      const result=await window.omni.createProjectFromTemplate(spec.name,spec.templateId);current();if(!result)return null;
      await applyProject(result);setFiles(result.files);revealCode();
      const entry=result.createdFiles.find(f=>f==='src/main.js')||result.createdFiles.find(f=>f==='main.py')||'README.md';
      await code.controller.open(entry);notify('Projeto criado: '+spec.name+' · nenhum código foi executado.');return true;
    }
    if(spec.kind==='save-as'){
      const result=await code.controller.saveAs(spec.path,spec.destination,{parents:spec.parents});current();
      if(result.stale)throw Error('Projeto alterado. Confira a gravação anterior.');
      await refresh();revealCode();notify('Arquivo criado: '+result.path+(result.copy?' · a aba original foi preservada.':''));return true;
    }
    if(spec.kind==='folder'){await window.omni.createAuthoredFolder(workspace,spec.destination);await refresh();notify('Pasta criada: '+spec.destination);return true;}
    if(spec.kind==='duplicate'){
      const result=await window.omni.duplicateAuthoredFile(workspace,spec.path,spec.destination,spec.revision);await refresh();await code.controller.open(result.path);revealCode();notify('Cópia criada: '+result.path);return true;
    }
    if(spec.kind==='rename'||spec.kind==='move'){
      const opened=code.controller.getSnapshot().documents.find(d=>d.path===spec.path);
      if(opened&&(opened.dirty||opened.draft||opened.saving))throw Error('Salve e resolva o rascunho desta aba antes de mover o arquivo.');
      if(opened&&!await code.controller.close(spec.path))throw Error('A aba recebeu novas alterações e permaneceu aberta.');
      current();
      try{
        const result=await window.omni.relocateAuthoredFile(workspace,spec.path,spec.destination,spec.revision);current();
        if(!result){if(opened)await code.controller.open(spec.path);return null;}
        await refresh();await code.controller.open(result.path);revealCode();notify('Arquivo movido: '+result.path+' · revise suas importações.');return true;
      }catch(error){current();if(opened)await code.controller.open(spec.path).catch(()=>{});throw error;}
    }
    throw Error('Operação de criação desconhecida.');
  };
  return {request,begin,submit,close:()=>setRequest(null)};
}
