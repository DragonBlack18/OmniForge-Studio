import React, {useEffect, useRef, useSyncExternalStore} from 'react';
import {getConfirmation,subscribeConfirmation,finishConfirmation} from './confirm-action.mjs';
import './ConfirmationDialog.css';
export default function ConfirmationDialog() {
  const request = useSyncExternalStore(subscribeConfirmation,getConfirmation);
  const dialog = useRef(null);
  useEffect(() => {
    if (!request) return;
    const previous = document.activeElement;
    const element = dialog.current;
    element.showModal();
    element.querySelector('[data-cancel]')?.focus();
    return () => { element.close(); if (previous?.isConnected) previous.focus(); };
  },[request]);
  if (!request) return null;
  const finish = value => finishConfirmation(request.id,value);
  return <dialog ref={dialog} className="workbench-confirm" data-testid="workbench-confirm-dialog"
    onKeyDown={event=>event.stopPropagation()}
    aria-labelledby="workbench-confirm-title" aria-describedby="workbench-confirm-message"
    onCancel={event => {event.preventDefault();finish(false);}}>
    <h2 id="workbench-confirm-title">{request.title}</h2>
    <p id="workbench-confirm-message">{request.message}</p>
    <div className="workbench-confirm__actions">
      <button type="button" className="button button--subtle" data-cancel onClick={() => finish(false)}>Cancelar</button>
      <button type="button" className="button button--solid" data-testid="workbench-confirm-accept" onClick={() => finish(true)}>{request.confirmLabel}</button>
    </div>
  </dialog>;
}
