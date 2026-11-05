import {useRef,useSyncExternalStore} from 'react';
import {createFlowSession} from './flow-session-store.mjs';
export {toUiNodes,toFlowDocument,hasPersistentNodeChange,hasPersistentEdgeChange} from './flow-session-store.mjs';

/** Kept alive by the shell; history never depends on the visual runtime. */
export function useFlowSession(initialFlow){
  const ref=useRef(null);
  if(!ref.current)ref.current=createFlowSession(initialFlow);
  const store=ref.current;
  const state=useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot);
  // captureSaveToken / markSaved are owned by the document store.
  return {...state,...store};
}
