# OmniForge v0.8.2 — IDE multidocumento e ferramentas semânticas locais

## Capacidade entregue no código

1. Até 16 documentos abertos por sessão/projeto, com texto, revisão,
   baseline, modelo Monaco, posição e histórico nativo independentes.
   Trocar abas ou visitar CAD/Automações não descarta buffers.
2. Salvar arquivo e Salvar todos são explícitos. Salvar todos é sequencial,
   para no primeiro erro e informa a contagem parcial: não é transação
   atômica entre arquivos. Conflitos externos preservam ambas as versões.
3. Fechar arquivo alterado exige Salvar e fechar, Descartar ou Cancelar.
   Modelos são descartados ao fechar/resetar a sessão. Abas ainda não são
   reabertas automaticamente depois de sair do processo.
4. Checkpoints separados por arquivo e workspace, por IPC existente,
   debounce de 700 ms, CAS e filas independentes. Eles não são escritos
   no arquivo original. Este mecanismo de código existente armazena JSON
   local **sem cifra**; não confundir com a cifra dos fluxos de automação.
5. Painel Problemas usa os marcadores reais do Monaco dos modelos abertos;
   pode navegar para arquivo/linha/coluna. Lista limitada a 200 resultados.
6. Estrutura usa getNavigationTree do worker oficial TypeScript/JavaScript;
   nada de análise de código por regex. Resultado atrasado é ignorado.
7. Definição/referências/renomeação/formatação/pesquisa usam ações reais do
   editor. Operações sem provedor são informadas como indisponíveis, não
   simuladas. Abrir definição só navega entre modelos explicitamente abertos.
8. Comparação Monaco lado a lado entre baseline lida/salva e buffer atual,
   ou baseline e rascunho conflitante; ambos os lados são somente leitura.
   Não afirma que baseline ainda corresponde ao disco após mudança externa.

## Limites de linguagem

JavaScript/TypeScript usam os serviços embutidos em Monaco 0.55.1. Modelos
abertos são sincronizados em URIs virtuais por sessão; não são caminhos
absolutos pessoais e não concedem leitura do filesystem. Não há descoberta
automática de tsconfig, @types, pacotes npm, todo o workspace ou servidores
LSP externos. Não é o ambiente de execução Node nem um compilador de entrega.

Python possui edição/destaque/undo/rascunhos, não análise semântica, execução
nem depuração nesta versão. Zero marcadores não significa que um arquivo
Python ou outra linguagem sem servidor esteja validado.

## Fronteira e compatibilidade

- `document-session.mjs`: estado testável sem React, Monaco, DOM ou Node.
- `useCodeWorkspace.mjs`: assinatura React do store e adaptador IPC existente.
- `CodeWorkspace.jsx`: abas, comparação, diagnóstico e ferramentas, lazy.
- `language-tools.mjs`: normalização limitada dos resultados públicos.
- AppShell deixa de manter um segundo buffer/revisão do arquivo ativo.
- Monaco é dono do texto ao digitar; versões explícitas continuam necessárias
  para restauração, preservando a correção contra ecos atrasados da v0.8.1.
- Sem dependências novas, novas permissões, shell ou execução de código.
- JSON de projetos/CAD/fluxos e layout v0.8.1 permanecem compatíveis.
- Abertura recusa mais de 16 abas ou mais de 8 MiB de texto agregado. Texto
  colado pelo usuário nunca é truncado para caber no limite; limites de
  gravação e checkpoint do backend continuam aplicados e erros são visíveis.
- Projeto novo invalida respostas de sessões anteriores. A troca pela UI
  espera os checkpoints; se um arquivo não puder ser protegido, solicita
  salvamento/resolução em vez de abandonar seu texto silenciosamente.

## Referências efetivamente usadas

Monaco 0.55.1 é o componente open source utilizado, já presente no produto:
https://github.com/microsoft/monaco-editor/tree/v0.55.1
https://github.com/microsoft/monaco-editor/blob/v0.55.1/LICENSE.txt
https://github.com/microsoft/monaco-editor/blob/main/CHANGELOG.md

Nesta versão, as namespaces de serviços (`typescript`, `json` etc.) estão
na raiz do módulo Monaco; o adapter mantém fallback para APIs anteriores.
Não foram copiados interfaces privadas nem motores de terceiros para dentro
do store. FlexLayout foi avaliado como candidato, não distribuído aqui.

## Aceite

- Testes Node de troca de projeto, abertura concorrente, limites, CAS,
  save+edição, conflitos, fechamento, flush de múltiplos arquivos, corrupção,
  navegação e descarte de modelos.
- Teste de integração com filesystem e backend reais.
- Electron Windows: diagnóstico TS2322, F12 entre arquivos abertos, árvore
  semântica, undo real entre abas, texto integral nos rascunhos, comparação,
  Salvar todos, cancelamento/descarte de uma aba e conflito externo.
- Cinco capturas da mesma revisão em 1440x900 e 1280x800. Somente exemplos
  temporários de engenharia; não capturar projetos pessoais.
- Regressões v0.8.1/v0.8.0, instalação NSIS/Portable, fuses e hashes.

Não integrar nem rotular como release aprovada com qualquer gate falhando.
Certificação estável, assinatura, auditoria de licenças/vulnerabilidades,
LSP/DAP completo, terminal, Node-RED, serviço e CAD 3D continuam pendentes.

## Cancelamento de navegação e realce (verificação v0.8.2)

O E2E real encontrou `Canceled` ao trocar o modelo com uma requisição de
realce pendente. A navegação agora reconhece o comando antes de trocar a aba,
revalida projeto/origem/destino no próximo ciclo, e ignora solicitações
obsoletas. Isso sozinho não corrige a promise do realce interno do Monaco.

Foi aplicado um backport MIT restrito de três handlers do WordHighlighter
upstream, sem desativar o realce ou suprimir erros globalmente. Origem,
versão, alcance e hashes estão em `third-party-notices/monaco-word-highlight-backport.md`
e `dist/vendor-patches.json`. Os testes recusam mudança do contrato do pacote.
O E2E continua exigindo zero exceções do renderer e texto integral nas abas.
