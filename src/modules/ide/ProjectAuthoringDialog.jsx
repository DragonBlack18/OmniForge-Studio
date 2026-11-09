import React,{useEffect,useRef,useState} from 'react';
import {FILE_TEMPLATES,PROJECT_TEMPLATES,fileTemplate,projectTemplate} from '../../../core/modules/ide/project-templates.mjs';
import {NavGlyph} from '../../shared/NavGlyph.jsx';
import './ProjectAuthoringDialog.css';
const TITLES={template:'Novo arquivo de modelo','save-as':'Salvar como',folder:'Criar pastas',project:'Novo projeto',manage:'Organizar arquivo',info:'Propriedades do arquivo',duplicate:'Duplicar arquivo',rename:'Renomear arquivo',move:'Mover arquivo'};
export default function ProjectAuthoringDialog({request,workspace,documents,busy,onRequest,onSubmit,onClose}){
  const [kind,setKind]=useState(request.kind),[template,setTemplate]=useState(request.kind==='project'?'node-cli':'javascript');
  const doc=documents.find(d=>d.path===request.path);
  const [destination,setDestination]=useState(request.kind==='save-as'?(doc?.untitled?'novo-arquivo.'+doc.label.split('.').at(-1):request.path.replace(/(\.[^./]+)?$/, '-copia$1')):request.path);
  const [name,setName]=useState('meu-projeto'),[parents,setParents]=useState(true),[error,setError]=useState(''),[info,setInfo]=useState(null);
  const dialogRef=useRef(null);
  useEffect(()=>{const before=document.activeElement;const id=requestAnimationFrame(()=>dialogRef.current?.querySelector('input,select,button')?.focus());return()=>{cancelAnimationFrame(id);before?.isConnected&&before.focus?.();};},[]);
  useEffect(()=>{let live=true;if(['manage','info','duplicate','rename','move'].includes(kind)){
    window.omni.authoredFileInfo(workspace,request.path).then(value=>{if(live){setInfo(value);setError('');}}).catch(e=>{if(live)setError(e.message);});
  }return()=>{live=false;};},[workspace,request.path,kind]);
  const choose=k=>{setKind(k);setDestination(k==='duplicate'?request.path.replace(/(\.[^./]+)?$/,'-copia$1'):request.path);};
  const perform=async event=>{event?.preventDefault();setError('');await onRequest(async()=>{
    try{const result=await onSubmit({kind,path:request.path,destination:destination.trim(),name:name.trim(),templateId:template,parents,revision:info?.revision});if(result)onClose();}
    catch(cause){setError(cause.message||'Operação recusada.');}
  });};
  const pickRoot=()=>onRequest(async()=>{try{await onSubmit({kind:'choose-project'});}catch(e){setError(e.message);}});
  const isInfo=['manage','info'].includes(kind),isProject=kind==='project',isTemplate=kind==='template';
  const selected=isProject?projectTemplate(template):isTemplate?fileTemplate(template):null;
  return <div className="authoring-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}>
    <section ref={dialogRef} className="authoring-dialog" role="dialog" aria-modal="true" aria-label={TITLES[kind]} data-testid="authoring-dialog"
      onKeyDown={e=>{if(e.key==='Escape'&&!busy){e.stopPropagation();onClose();}if(e.key==='Tab'){const controls=[...dialogRef.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')];const first=controls[0],last=controls.at(-1);if(e.shiftKey&&e.target===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&e.target===last){e.preventDefault();first?.focus();}}}}>
      <header><span><NavGlyph name={isProject?'folder':'code'} size={18}/><strong>{TITLES[kind]}</strong></span><button type="button" aria-label="Fechar criação" disabled={busy} onClick={onClose}><NavGlyph name="close" size={16}/></button></header>
      <form noValidate onSubmit={perform} className="authoring-form">
        <div className="authoring-fields">
          {(isProject||isTemplate)&&<label>Modelo<select aria-label="Modelo de criação" value={template} disabled={busy} onChange={e=>setTemplate(e.target.value)}>{(isProject?PROJECT_TEMPLATES:FILE_TEMPLATES).map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label>}
          {isProject&&<><label>Nome da pasta do projeto<input aria-label="Nome do projeto novo" value={name} maxLength={100} required onChange={e=>setName(e.target.value)} disabled={busy}/></label><p>{selected.description}</p><p>A pasta pai será escolhida no diálogo do Windows. Uma pasta existente com esse nome não será substituída.</p></>}
          {!isProject&&!isTemplate&&!isInfo&&<><label>Caminho relativo{kind==='save-as'?' do novo arquivo':''}<input aria-label="Destino do arquivo" required maxLength={260} value={destination} onChange={e=>setDestination(e.target.value)} disabled={busy} placeholder={kind==='folder'?'src/utilitarios':'src/novo-arquivo.js'}/></label>
            {kind==='save-as'&&<label className="authoring-check"><input type="checkbox" checked={parents} disabled={busy} onChange={e=>setParents(e.target.checked)}/>Criar pastas intermediárias</label>}
            {kind==='folder'&&<p>Pastas intermediárias ausentes serão criadas. Nenhum arquivo será alterado.</p>}
            {['rename','move'].includes(kind)&&<p>O conteúdo será preservado. Referências e importações em outros arquivos precisam ser revisadas por você.</p>}
            {kind==='duplicate'&&<p>Copia a versão salva em disco. Para copiar uma edição não salva, use Salvar como na aba correspondente.</p>}
          </>}
          {kind==='save-as'&&!workspace&&<div className="authoring-warning"><p>Seu documento está somente na memória. Escolha uma pasta de projeto para definir onde será salvo.</p><button type="button" disabled={busy} onClick={pickRoot}>Escolher pasta do projeto</button></div>}
          {isInfo&&info&&<dl>{[['Caminho',info.path],['Tamanho',info.bytes+' bytes'],['Caracteres',info.characters],['Linhas',info.lines],['Quebra de linha',info.eol],['Codificação',info.encoding],['Modificado',info.modifiedAt],['SHA-256',info.revision]].map(([k,v])=><React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl>}
          {isInfo&&<div className="authoring-file-actions"><button type="button" disabled={busy||!info} onClick={()=>choose('rename')}>Renomear</button><button type="button" disabled={busy||!info} onClick={()=>choose('move')}>Mover</button><button type="button" disabled={busy||!info} onClick={()=>choose('duplicate')}>Duplicar</button><button type="button" onClick={()=>navigator.clipboard.writeText(request.path).catch(e=>setError(e.message))}>Copiar caminho relativo</button></div>}
          {!isProject&&!isTemplate&&request.path&&!doc?.untitled&&<p className="authoring-origin" title={request.path}>Origem: {request.path}</p>}
          {isTemplate&&<p>O modelo abre como documento sem título. Nada é escrito até você escolher Salvar como.</p>}
          {error&&<p role="alert" className="authoring-error">{error}</p>}
        </div>
        {(isProject||isTemplate)&&<aside className="authoring-preview" aria-label="Prévia do modelo">
          <strong>{isProject?'ARQUIVOS QUE SERÃO CRIADOS':'CONTEÚDO INICIAL'}</strong>
          <pre>{isProject?Object.keys(selected.files).join('\n'):selected.content||'(arquivo vazio)'}</pre>
          {isProject&&<small>Sem downloads, instalação de pacotes ou execução automática. Os projetos gerados funcionam independentemente do OmniForge.</small>}
        </aside>}
        <footer><span>{busy?'Executando operação…':isProject?'Criação local':workspace?'Somente no projeto ativo':'Documento ainda não salvo'}</span><button type="button" disabled={busy} onClick={onClose}>{isInfo?'Fechar':'Cancelar'}</button>
          {!isInfo&&<button type="submit" disabled={busy||(!isProject&&!isTemplate&&!workspace)||(['rename','move','duplicate'].includes(kind)&&!info)}>{isProject?'Criar projeto':isTemplate?'Abrir modelo':kind==='folder'?'Criar pastas':kind==='save-as'?'Criar arquivo':kind==='duplicate'?'Duplicar':'Confirmar caminho'}</button>}
        </footer>
      </form>
    </section>
  </div>;
}
