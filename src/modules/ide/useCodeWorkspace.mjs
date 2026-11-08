import {useEffect,useRef,useSyncExternalStore} from 'react';
import {createDocumentSession} from './document-session.mjs';

export function useCodeWorkspace() {
  const ref=useRef(null);
  if(!ref.current)ref.current=createDocumentSession({
    readFile:(...args)=>window.omni.readFile(...args),
    saveFile:(...args)=>window.omni.saveFile(...args),
    readEditorDraft:(...args)=>window.omni.readEditorDraft(...args),
    writeEditorDraft:(...args)=>window.omni.writeEditorDraft(...args),
    discardEditorDraft:(...args)=>window.omni.discardEditorDraft(...args)
  });
  const controller=ref.current;
  const snapshot=useSyncExternalStore(controller.subscribe,controller.getSnapshot);
  useEffect(()=>()=>controller.reset(''),[controller]);
  return {controller,snapshot,active:snapshot.documents.find(d=>d.key===snapshot.active)||null};
}
