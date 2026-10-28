import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleFileEntries } from '../src/utils/file-tree.mjs';

const entries = [
  {path:'src',kind:'directory',depth:0},
  {path:'src/main.jsx',kind:'file',depth:1},
  {path:'src/components',kind:'directory',depth:1},
  {path:'src/components/Panel.jsx',kind:'file',depth:2},
  {path:'src/components/Nested',kind:'directory',depth:2},
  {path:'src/components/Nested/util.js',kind:'file',depth:3},
  {path:'README.md',kind:'file',depth:0}
];
test('árvore expandida mantém diretórios e arquivos na ordem original',()=>{
  assert.deepEqual(visibleFileEntries(entries),entries);
});
test('recolher um diretório oculta os descendentes, mas não o próprio diretório',()=>{
  const shown=visibleFileEntries(entries,{collapsedPaths:new Set(['src/components'])});
  assert.deepEqual(shown.map(x=>x.path),['src','src/main.jsx','src/components','README.md']);
  assert.equal(entries.length,7);
});
test('recolhimento recursivo não oculta arquivos de outros diretórios',()=>{
  const shown=visibleFileEntries(entries,{collapsedPaths:new Set(['src'])});
  assert.deepEqual(shown.map(x=>x.path),['src','README.md']);
});
test('busca por nome ou pasta inclui arquivos mesmo se a árvore está recolhida',()=>{
  const shown=visibleFileEntries(entries,{query:'panel',collapsedPaths:new Set(['src'])});
  assert.deepEqual(shown.map(x=>x.path),['src/components/Panel.jsx']);
  assert.deepEqual(visibleFileEntries(entries,{query:'components/'}).map(x=>x.path),
    ['src/components/Panel.jsx','src/components/Nested/util.js']);
});
test('busca diferencia letras apenas quando necessário e ignora espaços externos',()=>{
  assert.deepEqual(visibleFileEntries(entries,{query:'  README.MD '}).map(x=>x.path),['README.md']);
  assert.deepEqual(visibleFileEntries(entries,{query:'arquivo-inexistente'}),[]);
});
test('índice inválido ou entradas malformadas não escapam para interface',()=>{
  assert.throws(()=>visibleFileEntries(null),/inválido/);
  assert.deepEqual(visibleFileEntries([null,{kind:'file',path:null}]),[]);
});
