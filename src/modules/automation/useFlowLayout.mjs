import {useEffect,useRef,useSyncExternalStore} from 'react';
import {createFlowLayoutController} from './flow-layout-controller.mjs';

/** ELK is loaded only when the user arranges a flow, entirely in a Web Worker. */
export function useFlowLayout({session,locked=false,active=true,onComplete,onError}) {
  const latest=useRef({session,locked,active,onComplete,onError});
  latest.current={session,locked,active,onComplete,onError};
  const controllerRef=useRef(null);
  if(!controllerRef.current)controllerRef.current=createFlowLayoutController({
    session,
    createWorker:()=>new Worker(new URL('./flow-layout.worker.mjs',import.meta.url),{type:'module'}),
    onComplete:result=>latest.current.onComplete?.(result),
    onError:error=>latest.current.onError?.(error)
  });
  const controller=controllerRef.current;
  const state=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot);
  useEffect(()=>{if(locked||!active)controller.cancel();},[controller,locked,active]);
  useEffect(()=>()=>controller.cancel(),[controller]);
  return {...state,cancel:controller.cancel,arrange:()=>{
    if(latest.current.locked||!latest.current.active)return Promise.resolve({applied:false,reason:'blocked'});
    return controller.arrange();
  }};
}
