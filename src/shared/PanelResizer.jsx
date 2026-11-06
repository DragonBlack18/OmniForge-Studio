import React,{useEffect,useRef} from 'react';
/** One accessible separator, with coalesced previews and one persistent commit per gesture. */
export default function PanelResizer({label,controls,value,min,max,defaultValue,direction=1,onPreview,onCommit,className=''}) {
  const gesture=useRef(null),frame=useRef(0),callbacks=useRef({onPreview,onCommit});
  callbacks.current={onPreview,onCommit};
  useEffect(()=>()=>{if(frame.current)cancelAnimationFrame(frame.current);gesture.current=null;},[]);
  const clamp=n=>Math.max(min,Math.min(max,Math.round(n)));
  function stop(event,commit) {
    const current=gesture.current;if(!current)return;
    if(event?.pointerId!==undefined&&event.pointerId!==current.pointerId)return;
    if(frame.current)cancelAnimationFrame(frame.current);frame.current=0;gesture.current=null;
    if(commit)callbacks.current.onCommit(current.next);
    else callbacks.current.onPreview(null);
    if(event?.currentTarget?.hasPointerCapture?.(current.pointerId))event.currentTarget.releasePointerCapture(current.pointerId);
  }
  return <div className={`panel-resizer ${className}`} role="separator" tabIndex={0}
    aria-label={label} aria-controls={controls} aria-orientation="vertical"
    aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.round(value)} aria-valuetext={`${Math.round(value)} pixels`}
    title={`${label} · setas para ajustar · Home/End · duplo clique para restaurar`}
    onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.currentTarget.focus();
      gesture.current={x:event.clientX,initial:value,next:value,pointerId:event.pointerId};event.currentTarget.setPointerCapture(event.pointerId);}}
    onPointerMove={event=>{const g=gesture.current;if(!g||g.pointerId!==event.pointerId)return;
      g.next=clamp(g.initial+direction*(event.clientX-g.x));
      if(!frame.current)frame.current=requestAnimationFrame(()=>{frame.current=0;if(gesture.current)callbacks.current.onPreview(gesture.current.next);});}}
    onPointerUp={event=>stop(event,true)} onPointerCancel={event=>stop(event,false)}
    onLostPointerCapture={event=>stop(event,false)}
    onDoubleClick={()=>onCommit(defaultValue)}
    onKeyDown={event=>{
      if(event.key==='Escape'&&gesture.current){event.preventDefault();event.stopPropagation();stop(event,false);return;}
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||gesture.current)return;
      event.preventDefault();event.stopPropagation();
      const step=event.shiftKey?30:10;
      onCommit(event.key==='Home'?min:event.key==='End'?max:clamp(value+(event.key==='ArrowRight'?step:-step)*direction));
    }}/>
}
