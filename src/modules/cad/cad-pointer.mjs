/** Bounded pointer stream: only cursor subscribers redraw on idle mouse motion. */
export function createCadPointer(schedule=callback=>requestAnimationFrame(callback),cancel=id=>cancelAnimationFrame(id)){
  let snapshot={x:0,y:0,kind:'grid'},pending=snapshot,frame=null,disposed=false;
  const listeners=new Set();
  return Object.freeze({
    getSnapshot:()=>snapshot,
    subscribe:fn=>{listeners.add(fn);return ()=>listeners.delete(fn);},
    update:value=>{
      if(disposed)return;
      pending=value;
      if(frame!==null)return;
      frame=schedule(()=>{frame=null;if(disposed)return;snapshot=pending;for(const fn of listeners)fn();});
    },
    dispose:()=>{disposed=true;if(frame!==null)cancel(frame);frame=null;listeners.clear();}
  });
}
