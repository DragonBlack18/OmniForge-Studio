import React,{useCallback,useEffect,useLayoutEffect,useRef,useState,useMemo} from 'react';
import * as monaco from 'monaco-editor';
import CodeEditor from './CodeEditor.jsx';
import {getLanguage} from '../../workbench/editor-language.mjs';
import {editorOptionsForSize} from './editor-performance.mjs';
import {CODE_ACTIONS,navigationRows,problemRows} from './language-tools.mjs';
import {NavGlyph} from '../../shared/NavGlyph.jsx';
import './CodeWorkspace.css';

// These are the bundled language services, not an external LSP server or
// an installed Node/Python environment. Only explicitly opened models sync.
const ts=monaco.typescript||monaco.languages.typescript;
if(ts){
  const options={allowNonTsExtensions:true,allowJs:true,checkJs:true,noEmit:true,
    target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.NodeJs};
  ts.typescriptDefaults.setCompilerOptions(options);
  ts.javascriptDefaults.setCompilerOptions(options);
  ts.typescriptDefaults.setEagerModelSync(true);
  ts.javascriptDefaults.setEagerModelSync(true);
}
const EMPTY_PROBLEMS={rows:[],total:0,errors:0,warnings:0};

function ReviewDiff({document,draft,onClose}) {
  const host=useRef(null);
  useLayoutEffect(()=>{
    const editor=monaco.editor.createDiffEditor(host.current,{
      theme:'omniforge-studio',automaticLayout:true,readOnly:true,originalEditable:false,
      renderSideBySide:true,useInlineViewWhenSpaceIsLimited:true,minimap:{enabled:false},
      scrollBeyondLastLine:false,enableSplitViewResizing:true
    });
    const language=getLanguage(document.path);
    const original=monaco.editor.createModel(document.baseline,language);
    const modified=monaco.editor.createModel(draft?document.draft.content:document.content,language);
    editor.setModel({original,modified});
    return()=>{editor.dispose();original.dispose();modified.dispose();};
  },[document.key,document.baseline,document.content,draft]);
  return <section className="code-review" aria-label="Comparação de alterações" data-testid="code-review">
    <header><span><strong>Base lida/salva</strong> → {draft?'Rascunho recuperável':'Edição atual'} · {document.path}</span>
      <button type="button" onClick={onClose}>Voltar ao editor</button></header>
    <p>Comparação somente de leitura. Não grava no arquivo e não substitui a verificação de conflito ao salvar.</p>
    <div ref={host} className="code-review__diff"/>
  </section>;
}

export default function CodeWorkspace({controller,snapshot,busy,visible,focus,utilityOpen,onToggleExplorer,onNotice,onRequest}) {
  const document=snapshot.documents.find(d=>d.key===snapshot.active)||null;
  const baseOptions=editorOptionsForSize(document?.content.length||0);
  const editorOptions=useMemo(()=>({...baseOptions,readOnly:Boolean(document?.draft)||busy,padding:{top:10}}),[baseOptions,Boolean(document?.draft),busy]);
  const [runtimeEpoch,setRuntimeEpoch]=useState(0);
  const [position,setPosition]=useState({line:1,column:1});
  const [panel,setPanel]=useState('problems');
  const [panelOpen,setPanelOpen]=useState(true);
  const [problems,setProblems]=useState(EMPTY_PROBLEMS);
  const [outline,setOutline]=useState({rows:[],status:'empty'});
  const [review,setReview]=useState(null);
  const [closing,setClosing]=useState(null);
  const [closeError,setCloseError]=useState('');
  const editorRef=useRef(null),cursorSubscription=useRef(null),latest=useRef(null);
  latest.current={snapshot,document,visible,onNotice};
  const problemRefresh=useRef(null);
  const refreshProblems=useCallback(()=>{
    clearTimeout(problemRefresh.current);
    problemRefresh.current=setTimeout(()=>{
      const docs=latest.current.snapshot.documents;
      setProblems(problemRows(docs,uri=>monaco.editor.getModelMarkers({resource:monaco.Uri.parse(uri)})));
    },80);
  },[]);
  useEffect(()=>{
    const sub=monaco.editor.onDidChangeMarkers(refreshProblems);
    refreshProblems();
    return()=>{sub.dispose();clearTimeout(problemRefresh.current);};
  },[refreshProblems]);
  useEffect(()=>{refreshProblems();},[snapshot.documents.length,refreshProblems]);
  useEffect(()=>{setReview(null);setClosing(null);setCloseError('');},[snapshot.active,snapshot.scope]);
  useEffect(()=>{
    let cancelled=false;
    const d=document,editor=editorRef.current;
    if(!visible||!d||!editor||panel!=='outline'||!panelOpen){return;}
    const language=getLanguage(d.path);
    if(!['javascript','typescript'].includes(language)||!ts){setOutline({rows:[],status:'unsupported'});return;}
    setOutline(old=>({...old,status:'loading'}));
    const timer=setTimeout(async()=>{
      try{
        const model=editor.getModel();
        if(!model||model.isDisposed())return;
        const version=model.getVersionId();
        const workerFactory=await (language==='typescript'?ts.getTypeScriptWorker():ts.getJavaScriptWorker());
        const worker=await workerFactory(model.uri);
        const tree=await worker.getNavigationTree(model.uri.toString());
        if(cancelled||model.isDisposed()||model.getVersionId()!==version)return;
        setOutline({rows:navigationRows(tree,offset=>model.getPositionAt(offset)),status:'ready'});
      }catch(error){if(!cancelled)setOutline({rows:[],status:'failed'});}
    },220);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[document?.key,document?.edit,document?.version,panel,panelOpen,visible,runtimeEpoch]);
  const reveal=useCallback(position=>{
    const editor=editorRef.current;if(!editor)return;
    const pos={lineNumber:position.line,column:position.column};
    editor.revealPositionInCenter(pos);editor.setPosition(pos);editor.focus();
    setPosition(position);
  },[]);
  const mounted=useCallback(editor=>{
    const d=latest.current.document;if(!d)return;
    editorRef.current=editor;setRuntimeEpoch(value=>value+1);
    controller.retain(d.path,editor.getModel());
    if(d.view)editor.restoreViewState(d.view);
    cursorSubscription.current?.dispose();
    cursorSubscription.current=editor.onDidChangeCursorPosition(event=>setPosition({line:event.position.lineNumber,column:event.position.column}));
    const p=editor.getPosition();if(p)setPosition({line:p.lineNumber,column:p.column});
    const jump=latest.current.snapshot.jump;
    if(jump?.key===d.key)reveal(jump);
    refreshProblems();
  },[controller,reveal,refreshProblems]);
  const unmounted=useCallback((editor,path)=>{
    try{controller.setView(path,editor.saveViewState());}catch{}
    cursorSubscription.current?.dispose();cursorSubscription.current=null;
    if(editorRef.current===editor)editorRef.current=null;
  },[controller]);
  useEffect(()=>{
    if(snapshot.jump?.key===document?.key)reveal(snapshot.jump);
  },[snapshot.jump,document?.key,reveal]);
  useEffect(()=>()=>cursorSubscription.current?.dispose(),[]);
  useEffect(()=>{
    const opener=monaco.editor.registerEditorOpener({
      openCodeEditor(_source,resource,selection){
        const d=latest.current.snapshot.documents.find(item=>item.uri===resource.toString());
        if(!d || !latest.current.visible)return false;
        controller.activate(d.path,{line:selection?.startLineNumber||selection?.lineNumber||1,
          column:selection?.startColumn||selection?.column||1});
        return true;
      }
    });
    return()=>opener.dispose();
  },[controller]);
  const save=()=>onRequest(async()=>{
    if(!document)return;
    const result=await controller.save(document.path);
    onNotice(result.unchanged?'Arquivo atualizado: '+document.path:'Arquivo salvo; edições mais recentes ainda precisam ser gravadas.');
  });
  const saveAll=()=>onRequest(async()=>{
    const results=await controller.saveAll();
    onNotice(results.length+' arquivo(s) salvos. '+controller.getSnapshot().pending+' ainda com alterações.');
  });
  const action=async id=>{
    const editor=editorRef.current;if(!editor||!document||document.draft||busy)return;
    const command=editor.getAction(id);
    if(!command||!command.isSupported()){onNotice('Esta operação não está disponível para a linguagem do arquivo.');return;}
    try{editor.focus();await command.run();}catch(error){onNotice('Não foi possível aplicar a ferramenta: '+(error?.message||'erro local'));}
  };
  const requestClose=path=>{
    const doc=snapshot.documents.find(d=>d.path===path);
    if(doc?.dirty){setClosing(path);setCloseError('');}
    else onRequest(()=>controller.close(path));
  };
  const finishClose=choice=>onRequest(async()=>{
    try{
      const closed=await controller.close(closing,choice);
      if(closed){setClosing(null);setCloseError('');}
      else setCloseError('Há alterações posteriores ao salvamento. Revise antes de fechar.');
    }catch(error){setCloseError(error.message);}
  });
  useEffect(()=>{
    if(!visible)return;
    const keydown=event=>{
      if(!(event.ctrlKey||event.metaKey)||event.altKey||closing)return;
      if(event.key.toLowerCase()==='w'){
        event.preventDefault();event.stopPropagation();if(document&&!busy)requestClose(document.path);
      }else if(event.key==='Tab'){
        event.preventDefault();if(!busy)controller.cycle(event.shiftKey?-1:1);
      }
    };
    window.addEventListener('keydown',keydown,true);
    return()=>window.removeEventListener('keydown',keydown,true);
  },[visible,document,busy,closing,snapshot]);
  const jumpTo=(path,pos)=>{setReview(null);controller.activate(path,pos);};
  return <section className="code-workspace" data-testid="code-workspace">
    <div className="main-toolbar">
      <div className="toolbar-heading"><span className="eyebrow">CÓDIGO / PROJETO LOCAL</span><strong>{document?.path||'Nenhum arquivo selecionado'} {document?.dirty?'•':''}</strong></div>
      <div className="toolbar-actions">
        <button type="button" className="button button--subtle" aria-label={utilityOpen?'Ocultar explorador de arquivos':'Mostrar painel de ferramentas'} onClick={onToggleExplorer}><NavGlyph name="panel" size={15}/><span className="code-optional-label">Explorador</span></button>
        {document&&<span className="workspace-editor-position" data-testid="editor-position">Ln {position.line} · Col {position.column}</span>}
        <button className="button button--solid" disabled={busy||!document?.dirty||Boolean(document?.draft)} onClick={save}>Salvar arquivo</button>
        <button className="button button--outline" disabled={busy||!snapshot.dirty} onClick={saveAll}>Salvar todos</button>
      </div>
    </div>
    {snapshot.documents.length>0&&<div className="code-tabs" role="tablist" aria-label="Documentos abertos">
      {snapshot.documents.map((d,index)=><div className={'code-tab '+(d.key===snapshot.active?'is-active':'')} key={d.key}>
        <button role="tab" type="button" id={'code-tab-'+index} aria-selected={d.key===snapshot.active} aria-controls="code-document-panel"
          title={d.path} disabled={busy} data-testid="code-document-tab" onClick={()=>controller.activate(d.path)}
          onKeyDown={event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();
            const target=event.key==='Home'?snapshot.documents[0]:event.key==='End'?snapshot.documents.at(-1):snapshot.documents[(index+(event.key==='ArrowLeft'?-1:1)+snapshot.documents.length)%snapshot.documents.length];
            controller.activate(target.path);event.currentTarget.closest('[role=tablist]')?.querySelectorAll('[role=tab]')[snapshot.documents.indexOf(target)]?.focus();}}}>
          <NavGlyph name="code" size={13}/><span>{d.path.split('/').at(-1)}</span>{d.dirty&&<span aria-label="Alterações não salvas" className="code-tab__dirty">●</span>}
        </button>
        <button type="button" className="code-tab__close" aria-label={'Fechar '+d.path} disabled={busy} onClick={()=>requestClose(d.path)}><NavGlyph name="close" size={12}/></button>
      </div>)}
    </div>}
    {document&&<div className="code-commandbar">
      <span title={document.path}>{getLanguage(document.path)} · {snapshot.documents.length}/16 arquivos</span>
      <div>
        <button type="button" disabled={busy||Boolean(document.draft)} onClick={()=>setReview(review?null:'current')} aria-pressed={review==='current'}>Comparar alterações</button>
        <button type="button" onClick={()=>setPanelOpen(value=>!value)} aria-pressed={panelOpen}>Análise {problems.errors+problems.warnings>0?'('+ (problems.errors+problems.warnings)+')':''}</button>
        <details className="code-tools"><summary>Ferramentas</summary><div>
          {CODE_ACTIONS.map(item=><button type="button" key={item.id} disabled={Boolean(document.draft)} onClick={event=>{event.currentTarget.closest('details').open=false;action(item.id);}}><span>{item.label}</span><kbd>{item.shortcut}</kbd></button>)}
        </div></details>
      </div>
    </div>}
    {document?.draft&&<section className="editor-recovery" role="status" data-testid="editor-recovery">
      <div><strong>{document.draft.baseRevision===document.revision?'Rascunho de recuperação disponível':'Conflito: arquivo alterado externamente'}</strong>
        <p>Restaure, compare ou descarte a cópia. O arquivo original não é alterado automaticamente.</p></div>
      <div className="editor-recovery__actions">
        {document.draft.baseRevision===document.revision&&<button type="button" className="button button--solid" disabled={busy} onClick={()=>onRequest(async()=>{await controller.restore(document.path);onNotice('Rascunho restaurado somente no editor. Use Salvar arquivo para gravar no projeto.');})}>Restaurar no editor</button>}
        <button type="button" className="button button--outline" onClick={()=>setReview('draft')}>Comparar rascunho</button>
        <button type="button" className="button button--outline" onClick={()=>navigator.clipboard.writeText(document.draft.content).then(()=>onNotice('Texto do rascunho copiado.')).catch(()=>onNotice('Não foi possível copiar o rascunho.'))}>Copiar rascunho</button>
        <button type="button" className="button button--subtle" disabled={busy} onClick={()=>onRequest(async()=>{if(!window.confirm('Descartar definitivamente a cópia de recuperação? O arquivo original permanecerá intacto.'))return;await controller.discardDraft(document.path);onNotice('Cópia de recuperação descartada; arquivo original preservado.');})}>Descartar rascunho</button>
      </div>
    </section>}
    {document?.error&&<p className="editor-recovery__error" role="alert">{document.error}</p>}
    {document?.dirty&&document.protection==='saved'&&!document.draft&&<p className="editor-recovery__saved" data-testid="editor-draft-saved">Rascunho protegido localmente. Salve o arquivo para confirmar as alterações.</p>}
    <div className="code-document" id="code-document-panel" role="tabpanel" aria-label={document?.path||'Editor vazio'}>
      {document?<>
        <div className="editor-wrap code-live-editor" style={{visibility:review?'hidden':undefined}}>
          <CodeEditor key={snapshot.scope+':'+document.key} path={document.uri} keepCurrentModel saveViewState={false}
            language={getLanguage(document.path)} value={document.content} documentVersion={document.version}
            onMount={mounted} onUnmount={editor=>unmounted(editor,document.path)}
            onChange={value=>controller.edit(document.path,value??'')}
            options={editorOptions}/>
        </div>
        {review&&<ReviewDiff key={document.key+':'+review} document={document} draft={review==='draft'} onClose={()=>setReview(null)}/>}
      </>:<div className="empty-main"><NavGlyph name="code" size={30}/><h2>Editor de código</h2><p>Abra arquivos no explorador. Suas edições permanecem nas abas ao alternar ferramentas.</p><small>Ctrl+P · abrir arquivo / Ctrl+Tab · alternar abas</small></div>}
    </div>
    {document&&panelOpen&&!focus&&!review&&<section className="code-analysis" aria-label="Análise dos arquivos abertos" data-testid="code-analysis">
      <header><div role="tablist" aria-label="Análise de código">
        <button type="button" role="tab" aria-selected={panel==='problems'} onClick={()=>setPanel('problems')}>Problemas <span>{problems.errors} erros · {problems.warnings} avisos</span></button>
        <button type="button" role="tab" aria-selected={panel==='outline'} onClick={()=>setPanel('outline')}>Estrutura</button>
      </div><small>Serviços locais · arquivos abertos</small><button type="button" aria-label="Ocultar análise" onClick={()=>setPanelOpen(false)}><NavGlyph name="close" size={13}/></button></header>
      <div className="code-analysis__list" role="tabpanel">
        {panel==='problems'?<>
          {!problems.rows.length&&<p>Nenhum diagnóstico informado pelos serviços ativos. Python e outras linguagens sem servidor não recebem análise semântica nesta versão.</p>}
          {problems.rows.map((p,index)=><button type="button" key={p.path+':'+index} data-testid="code-problem" onClick={()=>jumpTo(p.path,p)}>
            <span className={p.severity===8?'code-error':'code-warning'}>{p.severity===8?'Erro':p.severity===4?'Aviso':'Info'}</span>
            <span className="code-analysis__message">{p.message}</span><small>{p.path}:{p.line}:{p.column} · {p.source}{p.code?' '+p.code:''}</small>
          </button>)}
          {problems.total>problems.rows.length&&<p>Exibindo {problems.rows.length} de {problems.total} diagnósticos.</p>}
        </>:<>
          {outline.status==='unsupported'&&<p>Estrutura semântica disponível para JavaScript e TypeScript. Não há parser Python/LSP nesta entrega.</p>}
          {outline.status==='failed'&&<p role="alert">Não foi possível obter a estrutura do serviço de linguagem.</p>}
          {outline.status==='loading'&&<p>Atualizando símbolos locais…</p>}
          {outline.status==='ready'&&!outline.rows.length&&<p>Nenhum símbolo encontrado.</p>}
          {outline.rows.map(row=><button type="button" key={row.id} data-testid="code-symbol" onClick={()=>reveal(row)} style={{paddingLeft:12+row.depth*14}}>
            <span className="code-symbol-kind">{row.kind}</span><span className="code-analysis__message">{row.name}</span><small>Linha {row.line}</small>
          </button>)}
        </>}
      </div>
    </section>}
    {closing&&<div className="code-close-overlay" onKeyDown={event=>{
      if(event.key==='Escape'&&!busy){event.preventDefault();event.stopPropagation();setClosing(null);}
      if(event.key==='Tab'){
        const buttons=[...event.currentTarget.querySelectorAll('button:not(:disabled)')];
        const index=buttons.indexOf(event.target);
        if(buttons.length&&((event.shiftKey&&index<=0)||(!event.shiftKey&&index===buttons.length-1))){
          event.preventDefault();buttons[event.shiftKey?buttons.length-1:0].focus();
        }
      }
    }}><section role="dialog" aria-modal="true" aria-label="Fechar documento com alterações">
      <h3>Fechar {closing}?</h3><p>Este arquivo tem alterações não salvas. Os outros documentos continuarão abertos.</p>
      {closeError&&<p role="alert">{closeError}</p>}
      <div><button type="button" disabled={busy} onClick={()=>finishClose('save')}>Salvar e fechar</button>
        <button type="button" disabled={busy} onClick={()=>finishClose('discard')}>Descartar alterações</button>
        <button type="button" disabled={busy} autoFocus onClick={()=>setClosing(null)}>Cancelar</button></div>
    </section></div>}
  </section>;
}
