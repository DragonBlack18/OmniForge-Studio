# OmniForge Studio v0.7.9 — autoria de fluxos e diagnóstico

## Escopo entregue

Evolução da v0.7.8, sem reverter o CAD Toolkit nem duplicar navegação.

- Navegador global único com filtro textual sem acentos, expansão do grupo ativo e rótulos acessíveis. O filtro é limpo ao navegar/recolher.
- Edição de fluxo com desfazer/refazer (60 entradas, histórico passado limitado a 12 MB), duplicação desconectada, exclusão que inclui conexões incidentes e organização horizontal por dependência.
- Arraste e digitação agrupados em transações; mudanças de seleção/medição não marcam o documento como alterado. Undo do template é possível.
- Nome real do documento preservado no JSON; rótulo deixa de ser substituído por “Fluxo principal” em todo salvamento.
- Prevenção de conexões para entrada ocupada, portas inválidas, bloco ausente, auto-conexão e ciclo. Não substituir conexões antigas silenciosamente.
- Inspetor em três abas: Propriedades, Estrutura e Diagnóstico. Pesquisa de nós por nome/tipo/ID, foco no canvas e navegação direta do erro para o bloco. Sem outro menu global.
- Indicadores discretos de problema e estado PASS/FAIL/SKIP no bloco. Os resultados são limpos após uma edição para não apresentar uma execução anterior como prova do fluxo atual.
- Edição bloqueada durante operações nativas/execução; o motor continua supervisionado, sequencial e cancelável. A proteção de revisão e a concorrência de salvamento são preservadas.
- Oito novos blocos declarativos e três modelos executáveis, sem instalação de bibliotecas ou permissões adicionais.

## Blocos adicionados

| ID | Operação | Contrato |
|---|---|---|
| data.project | Selecionar propriedades | Objeto ou lista de objetos; até 64 campos simples. |
| data.mapFields | Mapear registros | Array; até 32 destinos mapeados a caminhos JSON permitidos. |
| data.groupBy | Agrupar registros | Array; grupos em lista, chaves simples tipadas, sem dicionário vulnerável a prototype pollution. |
| data.sumBy | Somar campo da lista | Cada valor precisa ser número finito; texto numérico não é convertido silenciosamente. |
| data.chunk | Dividir em lotes | Até 10.000 itens; lotes de 1–1.000 itens. Não é loop de execução nem paralelismo implícito. |
| logic.requireType | Validar tipo | object, array, string, number, boolean ou null; erro interrompe as etapas posteriores. |
| text.substring | Extrair trecho | Índices em pontos de código Unicode, não bytes UTF-8. |
| math.clamp | Limitar valor | Entrada e limites finitos; mínimo não pode exceder máximo. |

Todos os resultados continuam limitados a 2 MB. Os novos campos são validados antes de executar, e a operação pura valida novamente seu contrato. Não há eval, linguagem de expressão, shell ou pedido de rede adicional.

Modelos novos: **Preparar registros**, **Agrupar por categoria**, **Totalizar e limitar**. São dados de exemplo explícitos para edição, executados pelo motor normal; as saídas são arquivos reais em `.omniforge/output` quando Executar é utilizado. Simular mantém o contrato anterior de não gravar saída.

## Arquitetura e invariantes

`flow-session-store.mjs` é um modelo testável sem DOM/React. O hook `useFlowSession` conecta-o a `useSyncExternalStore`. O documento vive acima do canvas, mantendo edição/histórico na troca de ferramenta. Os helpers oficiais `applyNodeChanges`, `applyEdgeChanges` e `addEdge` continuam dentro do módulo React Flow lazy; não foi reimplementado o mecanismo visual da biblioteca.

A gravação tem token de época do documento e conteúdo exato enviado. Um retorno de save antigo não altera a revisão de outro workspace. Editar após a captura do save mantém o estado sujo. Desfazer até o último conteúdo gravado limpa corretamente esse estado.

`connections.mjs` contém a política de ligação e o algoritmo determinístico de layout. Organizar só muda posições, nunca configuração, portas ou arquivos. Ciclos não são “corrigidos” removendo conexões automaticamente.

`validateFlow` mantém `errors`, `warnings` e `order` para compatibilidade e acrescenta `diagnostics` com severidade, código, nodeId/edgeId. Valida limites antes de percorrer o grafo, rejeita posições não finitas e bloqueia duas exportações CAD para o mesmo destino. Regras externas (permissão de extensão, API de projeto, rede local) continuam no backend.

## Pesquisa aplicada e decisões

1. React Flow — Validation: https://reactflow.dev/examples/interaction/validation
   `isValidConnection` permite impedir uma ligação antes de alterar o documento. A aplicação revalida a operação no callback, sem depender apenas da indicação visual.
2. React Flow — Preventing cycles: https://reactflow.dev/examples/interaction/prevent-cycles
   A ligação source→target só é admitida se target não alcançar source. Implementação própria, iterativa, com limites; sem copiar exemplos comerciais Pro.
3. XYFlow source — https://github.com/xyflow/xyflow/blob/main/packages/react/src/utils/changes.ts
   Inspecionada a semântica de mudanças de posição, seleção e remoção; preservamos os utilitários da biblioteca já usada.
4. Node-RED — Search: https://nodered.org/docs/user-guide/editor/workspace/search
   Pesquisa revela o nó dentro do editor. Aplicado na aba Estrutura, limitada a ID/tipo/rótulo; valores potencialmente sensíveis não são indexados como busca global.
5. Node-RED — Nodes: https://nodered.org/docs/user-guide/editor/workspace/nodes
   Estados de execução e erros próximos ao nó, com propriedades contextuais. Aplicado sem inserir longas mensagens em todos os blocos.
6. n8n — Error handling: https://docs.n8n.io/flow-logic/error-handling/
   Falhas devem ser observáveis e associadas à etapa. Não introduzimos retry automático de operações que possam gravar/enviar novamente, nem afirmamos oferecer os error workflows do n8n.

Os conceitos foram adaptados ao tema grafite/vermelho e ao navegador único existente. Nenhum repositório externo foi incorporado e nenhuma funcionalidade paga foi copiada.

## Verificação

- Suíte Node completa local: 309 testes aprovados antes do CI, incluindo execuções reais em diretórios temporários.
- Casos dedicados: ciclo, entrada ocupada, portas ausentes, layout imutável, delete/undo com conexões, agrupamento de drag/digitação, quotas, save concorrente, troca de workspace e entradas malformadas.
- Novos blocos: outputs exatos, Unicode, campos reservados, tipos inválidos, overflow e interrupção antes da escrita seguinte.
- Electron Windows: conexões feitas com mouse, diagnóstico/foco, duplicar/excluir/desfazer/refazer, organizar, busca, execução dos modelos e JSON persistido; capturas 1440 e 1280.
- Mantidos gates de CAD Toolkit, CAD recovery/DXF, Monaco, Git, tarefas, agendamentos, extensões, workbench, lazy flow, bundle e Setup/Portable.
- Publicação/merge condicionados ao resultado do HEAD exato, não só ao build.

## Limites explícitos

Não há garantia de que qualquer lógica arbitrária seja válida. Dados externos, permissões, entrada com tipo errado e falhas de processo/disco/rede continuam possíveis: a aplicação precisa recusá-los ou mostrá-los, não reportar PASS falso.

Histórico desta versão é de sessão, não recuperação de fluxo após crash. Não adiciona loops, paralelismo, depurador passo a passo, CAD 3D, plugins arbitrários ou conectores externos sem aprovação. Os executáveis continuam sem assinatura digital e a plataforma é experimental.
