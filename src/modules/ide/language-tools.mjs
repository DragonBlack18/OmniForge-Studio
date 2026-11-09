/** Pure adapters for public Monaco APIs; do not parse source with regexes. */
export const CODE_ACTIONS = Object.freeze([
  {id:'editor.action.formatDocument',label:'Formatar documento',shortcut:'Shift+Alt+F'},
  {id:'editor.action.rename',label:'Renomear símbolo',shortcut:'F2'},
  {id:'editor.action.revealDefinition',label:'Ir para definição',shortcut:'F12'},
  {id:'editor.action.referenceSearch.trigger',label:'Localizar referências',shortcut:'Shift+F12'},
  {id:'editor.action.quickOutline',label:'Ir para símbolo',shortcut:'Ctrl+Shift+O'},
  {id:'actions.find',label:'Localizar no arquivo',shortcut:'Ctrl+F'},
  {id:'editor.action.startFindReplaceAction',label:'Substituir no arquivo',shortcut:'Ctrl+H'},
  {id:'editor.action.commentLine',label:'Comentar seleção',shortcut:'Ctrl+/'},
  {id:'editor.foldAll',label:'Recolher regiões',shortcut:''},
  {id:'editor.unfoldAll',label:'Expandir regiões',shortcut:''}
].map(Object.freeze));

export function navigationRows(tree, positionAt, limit=240) {
  if (typeof positionAt !== 'function') throw new TypeError('Conversor de posições inválido.');
  const rows=[];
  const visit=(items,depth)=>{
    if(!Array.isArray(items)||depth>8)return;
    for(const item of items){
      if(rows.length>=limit)return;
      if(!item||typeof item.text!=='string')continue;
      const span=item.nameSpan||item.spans?.[0];
      if(span && Number.isSafeInteger(span.start)&&span.start>=0){
        const pos=positionAt(span.start);
        if(Number.isSafeInteger(pos?.lineNumber)&&pos.lineNumber>0&&Number.isSafeInteger(pos?.column)&&pos.column>0)
          rows.push({id:rows.length+':'+span.start,name:item.text.slice(0,180),kind:String(item.kind||'símbolo').slice(0,40),depth,
            line:pos.lineNumber,column:pos.column});
      }
      visit(item.childItems,depth+1);
    }
  };
  visit(tree?.childItems,0);return rows;
}

export function problemRows(documents, markersFor, limit=200) {
  const rows=[];
  for(const doc of documents){
    for(const m of markersFor(doc.uri)||[]){
      if(![1,2,4,8].includes(m.severity)||typeof m.message!=='string'||!Number.isSafeInteger(m.startLineNumber)||m.startLineNumber<1)continue;
      rows.push({key:doc.key,path:doc.path,severity:m.severity,message:m.message.slice(0,1200),
        line:m.startLineNumber,column:Math.max(1,Number.isSafeInteger(m.startColumn)?m.startColumn:1),
        code:typeof m.code==='string'||typeof m.code==='number'?String(m.code).slice(0,80):'',
        source:typeof m.source==='string'?m.source.slice(0,50):'Monaco'});
      if(rows.length>=2000)break;
    }
    if(rows.length>=2000)break;
  }
  rows.sort((a,b)=>b.severity-a.severity||a.path.localeCompare(b.path)||a.line-b.line||a.column-b.column);
  return {total:rows.length,errors:rows.filter(r=>r.severity===8).length,warnings:rows.filter(r=>r.severity===4).length,
    rows:rows.slice(0,Math.max(1,Math.min(200,limit)))};
}
