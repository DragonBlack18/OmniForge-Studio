# Monaco 0.55.1 — alteração local de cancelamento

Componente: Microsoft Monaco Editor, MIT (licença adjacente).
Origem revisada: microsoft/vscode@864824b432e6fb153a3b4dfa1e0f96744ebcf6a4,
`src/vs/editor/contrib/wordHighlighter/browser/wordHighlighter.ts`,
blob `913408f8f5fa175e40869f1d4d2ae33a27666f32`.

https://github.com/microsoft/vscode/blob/864824b432e6fb153a3b4dfa1e0f96744ebcf6a4/src/vs/editor/contrib/wordHighlighter/browser/wordHighlighter.ts
https://github.com/microsoft/monaco-editor/issues/5135

O pacote fixado 0.55.1 agenda três promises Delayer sem tratar cancelamento.
A troca/fechamento rápido do modelo pode rejeitá-las antes da execução.
Foi retroportado o tratamento `.catch(onUnexpectedError)` nos três pontos
(cursor, foco e restauração de realce), como no código upstream revisado.
O handler nativo continua reportando falhas inesperadas. Nenhum filtro global
nem desligamento do realce foi instalado.

`scripts/lib/monaco-cancellation-patch.mjs` transforma somente esse arquivo
no Vite, verifica versão/importação/três pontos únicos e falha se o contrato
mudar. `dist/vendor-patches.json` registra hashes antes/depois no pacote final.
O arquivo original em node_modules e o lockfile não são modificados.
Ao atualizar Monaco, reavaliar/remover o backport com testes reais, em vez de
aplicar cegamente a outras versões. Copyright Microsoft e licença MIT
preservados na distribuição.
