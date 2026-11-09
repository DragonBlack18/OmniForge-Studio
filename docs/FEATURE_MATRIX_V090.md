# Matriz funcional v0.9.0

**36 capacidades novas: 10 de autoria/organização + 26 blocos executáveis.**
Não são contados separadamente atalhos, cores, testes, cada template de arquivo,
variações renomear/mover ou as quatro combinações de exemplo.

| Nº | Capacidade | Acesso / identificador | Evidência de teste |
|---|---|---|---|
| F01 | Documento novo sem projeto | Ctrl+N / Criar → Novo arquivo | `untitled-documents; E2E` |
| F02 | Salvar como / nova cópia do buffer | Documento → Salvar como | `untitled-documents; E2E` |
| F03 | Catálogo de 12 modelos de arquivo com prévia | Criar → Arquivo de modelo | `project-authoring; E2E` |
| F04 | Criação de projeto independente por kit | Criar → Novo projeto | `project-authoring; E2E` |
| F05 | Criação de hierarquia de pastas | Criar → Pastas aninhadas | `project-authoring; E2E` |
| F06 | Duplicação de arquivo salvo | Organizar / propriedades → Duplicar | `project-authoring; E2E` |
| F07 | Renomeação e movimentação com consentimento | Organizar / propriedades → Renomear/Mover | `project-authoring; authoring-ipc; E2E` |
| F08 | Inspeção de metadados e integridade de arquivo | Documento → Organizar / propriedades | `project-authoring; E2E` |
| F09 | Reabrir última aba fechada | Documento → Reabrir aba fechada | `untitled-documents; E2E` |
| F10 | Fechamento em lote somente de abas salvas | Documento → Fechar abas salvas / outras salvas | `untitled-documents; E2E` |
| D01 | Interpretar CSV | `codec.csvRead` · Intercâmbio | `data-suite.test.mjs`: resultado exato + pipeline/arquivo real |
| D02 | Gerar CSV | `codec.csvWrite` · Intercâmbio | `data-suite.test.mjs`: resultado exato + pipeline/arquivo real |
| D03 | Interpretar NDJSON | `codec.ndjsonRead` · Intercâmbio | `data-suite.test.mjs`: resultado exato + pipeline/arquivo real |
| D04 | Gerar NDJSON | `codec.ndjsonWrite` · Intercâmbio | `data-suite.test.mjs`: resultado exato + pipeline/arquivo real |
| D05 | Únicos por chave | `records.distinctBy` · Registros | `data-suite.test.mjs`: resultado exato + pipeline/arquivo real |
| D06 | Contagem por grupo | `records.countBy` · Registros | `data-suite.test.mjs`: resultado exato + pipeline/arquivo real |
| D07 | Estatísticas por grupo | `records.aggregateBy` · Registros | `data-suite.test.mjs`: resultado exato + pipeline/arquivo real |
| D08 | Relacionar tabelas | `records.joinBy` · Registros | `data-suite.test.mjs`: resultado exato + pipeline/arquivo real |
| D09 | Colunas para registros | `records.columnsToRows` · Registros | `data-suite.test.mjs`: resultado exato + pipeline/arquivo real |
| D10 | Registros para colunas | `records.rowsToColumns` · Registros | `data-suite.test.mjs`: resultado exato + pipeline/arquivo real |
| D11 | Achatar objeto | `object.flattenPaths` · Estruturas | `data-suite.test.mjs`: resultado exato + pipeline/arquivo real |
| D12 | Expandir caminhos | `object.expandPaths` · Estruturas | `data-suite.test.mjs`: resultado exato + pipeline/arquivo real |
| D13 | Objeto para pares | `object.entries` · Estruturas | `data-suite.test.mjs`: resultado exato + pipeline/arquivo real |
| D14 | Pares para objeto | `object.fromEntries` · Estruturas | `data-suite.test.mjs`: resultado exato + pipeline/arquivo real |
| D15 | Separar por valor | `records.partition` · Registros | `data-suite.test.mjs`: resultado exato + pipeline/arquivo real |
| D16 | Estatísticas descritivas | `math.statistics` · Análise | `data-suite.test.mjs`: resultado exato + pipeline/arquivo real |
| D17 | Converter intervalo | `math.mapRange` · Análise | `data-suite.test.mjs`: resultado exato + pipeline/arquivo real |
| D18 | Converter unidade | `engineering.convertUnit` · Engenharia | `data-suite.test.mjs`: resultado exato + pipeline/arquivo real |
| D19 | Normalizar espaços | `text.normalizeSpace` · Texto | `data-suite.test.mjs`: resultado exato + pipeline/arquivo real |
| D20 | Gerar identificador URL | `text.slug` · Texto | `data-suite.test.mjs`: resultado exato + pipeline/arquivo real |
| D21 | Codificar componente URL | `encoding.urlEncode` · Codificação | `data-suite.test.mjs`: resultado exato + pipeline/arquivo real |
| D22 | Decodificar componente URL | `encoding.urlDecode` · Codificação | `data-suite.test.mjs`: resultado exato + pipeline/arquivo real |
| D23 | Converter timestamp UTC | `date.epochConvert` · Datas | `data-suite.test.mjs`: resultado exato + pipeline/arquivo real |
| D24 | Diferença entre datas | `date.difference` · Datas | `data-suite.test.mjs`: resultado exato + pipeline/arquivo real |
| D25 | Converter tipos de campos | `records.coerceFields` · Registros | `data-suite.test.mjs`: resultado exato + pipeline/arquivo real |
| D26 | JSON com chaves ordenadas | `encoding.stableJson` · Codificação | `data-suite.test.mjs`: resultado exato + pipeline/arquivo real |

## Estado de aprovação

Todos os itens acima têm implementação e testes no código. Os resultados do CI,
plataformas, revisão e hashes aprovados são registrados no PR da versão; esta
matriz não atribui PASS a uma compilação ainda não executada. As oito capturas
do smoke cobrem criação, templates, propriedades, projeto, testes, CSV, NDJSON
e janela compacta; não são 36 screenshots de botões equivalentes.
