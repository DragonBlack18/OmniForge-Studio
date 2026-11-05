import React,{useSyncExternalStore} from 'react';
export function CadPointerOverlay({store,zoom}){
  const point=useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot);
  return <g pointerEvents="none"><circle cx={point.x} cy={-point.y} r={4/zoom} stroke="#C8515E" fill="none" strokeWidth={1.2} vectorEffect="non-scaling-stroke"/></g>;
}
export function CadCoordinates({store}){
  const point=useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot);
  return <span>X {Number(point.x.toFixed(2))} · Y {Number(point.y.toFixed(2))} mm · {point.kind==='object'?'OBJETO':point.kind==='grid'?'GRADE':'LIVRE'}</span>;
}
