import {useCallback,useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {createLayoutStore,editLayout,layoutScope,layoutMode,resolveLayout} from './layout-model.mjs';
export function useWorkbenchLayout(projectId,mode) {
  const [store]=useState(()=>{let storage;try{storage=window.localStorage;}catch{}return createLayoutStore(storage);});
  const scope=layoutScope(projectId),tool=layoutMode(mode),identity=scope+':'+tool;
  const read=useCallback(()=>store.getSnapshot(scope),[store,scope]);
  const snapshot=useSyncExternalStore(store.subscribe,read,read);
  const [preview,setPreview]=useState(null),[focused,setFocused]=useState(null);
  const [available,setAvailable]=useState(()=>window.innerWidth);
  const containerRef=useRef(null),identityRef=useRef(identity);identityRef.current=identity;
  useEffect(()=>{
    const target=containerRef.current;if(!target)return;
    const observer=new ResizeObserver(entries=>{const w=entries[0]?.contentRect?.width;if(w>0)setAvailable(w);});
    observer.observe(target);return()=>observer.disconnect();
  },[]);
  const preferences=snapshot.layout;
  const displayed=preview?.identity===identity?editLayout(preferences,tool,preview.field,preview.value):preferences;
  const focus=focused===identity;
  const effective=resolveLayout(displayed,tool,available,focus);
  const set=useCallback((field,value)=>{
    if(identityRef.current!==identity)return;
    const old=field.startsWith('navigation')?store.getSnapshot(scope).layout[field]:store.getSnapshot(scope).layout[tool]?.[field];
    store.edit(scope,tool,field,typeof value==='function'?value(old):value);setPreview(null);
  },[store,scope,tool,identity]);
  const setForMode=(target,field,value)=>{
    if(identityRef.current!==identity)return;
    const old=store.getSnapshot(scope).layout[target]?.[field];
    store.edit(scope,target,field,typeof value==='function'?value(old):value);setPreview(null);
  };
  useEffect(()=>{setFocused(null);setPreview(null);},[identity]);
  const resize=field=>({
    onPreview:value=>{if(identityRef.current===identity)setPreview(value===null?null:{identity,field,value});},
    onCommit:value=>set(field,value)
  });
  return {containerRef,scope,preferences,effective,focus,status:snapshot.status,
    set,setForMode,resize,toggleFocus:()=>{setPreview(null);setFocused(old=>old===identity?null:identity);},
    exitFocus:()=>setFocused(null),
    preset:value=>{setPreview(null);setFocused(null);store.preset(scope,tool,value);},
    reset:()=>{setPreview(null);setFocused(null);store.reset(scope);}};
}
