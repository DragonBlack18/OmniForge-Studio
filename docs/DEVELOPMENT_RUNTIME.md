# Executar e testar — Node.js e Python

O módulo executa arquivos **já salvos** do workspace com o Node.js ou o
Python instalados no computador. Não instala dependências, não compila
TypeScript e não substitui um terminal interativo ou um depurador.

## Uso

1. Abra a pasta do projeto e salve o código no editor.
2. Abra **Executar e testar**, em Desenvolvimento.
3. Atualize a lista após modificar arquivos no disco e selecione o arquivo.
4. Escolha Executar arquivo, Verificar sintaxe ou Executar testes.
5. Para executar, informe argumentos separados por linha. Espaços não
   separam argumentos; não há interpretação de comandos de shell.
6. Revise a confirmação nativa, que identifica arquivo, revisão, ambiente
   e argumentos. Cancelar é a opção padrão.
7. Acompanhe saída e código de término. O cabeçalho identifica o arquivo e
   a ação da saída exibida, mesmo após selecionar outro arquivo. Interromper
   solicita o encerramento do processo e da sua árvore normal de subprocessos.

| Ambiente | Executar arquivo | Verificar sintaxe | Executar testes |
|---|---|---|---|
| Node.js | `.js`, `.cjs`, `.mjs` com argumentos | `node --check` | `node --test` no arquivo selecionado |
| Python | `.py` com argumentos | AST pela biblioteca padrão; não executa o módulo | `unittest` no arquivo selecionado; zero testes é falha |

O formato ESM/CommonJS segue o Node.js e o `package.json` do projeto.
Arquivos TypeScript e scripts de build continuam nos scripts npm existentes.
O teste Node verifica a execução pelo test runner nativo; a interpretação
de um arquivo sem casos declarados segue o comportamento desse runner.

## Ambientes locais

- Node.js é localizado por caminho absoluto no PATH do aplicativo.
- Python procura primeiro `.venv` e `venv` no workspace, depois o PATH.
- O caminho de invocação de um ambiente virtual é preservado: resolver
  previamente o symlink do executável poderia perder o ambiente virtual.
- Diretórios de ambiente virtual que são symlinks e aliases de loja do
  Windows não são tratados como um ambiente confirmado.
- A descoberta consulta o filesystem, sem executar interpretadores para
  descobrir versões. Um executável encontrado ainda pode falhar ao iniciar;
  esse erro aparece no resultado real.
- Instalação ou alteração do PATH pode exigir reinício do aplicativo.

## Contrato e isolamento

O renderer envia somente `{path, revision, action, args}` pela allowlist IPC.
O workspace vem do processo principal, e o interpretador é resolvido pelo
core. Não há parâmetros de shell, executável, ambiente ou diretório de
trabalho fornecidos pelo renderer.

O arquivo deve ser UTF-8, regular, de até 1 MB e permanecer dentro do
workspace sem atravessar symlinks. O hash SHA-256 da versão salva é
conferido antes da confirmação e novamente antes da execução. Mudança
do interpretador/caminho canônico após consentimento exige nova aprovação.
Essas verificações não eliminam todas as condições de corrida com um
processo hostil alterando simultaneamente o filesystem.

O processo usa `shell: false`, argumentos separados e ambiente mínimo.
`NODE_OPTIONS`, `PYTHONPATH`, `PYTHONHOME` e variáveis arbitrárias do
aplicativo não são herdadas. Saída é decodificada incrementalmente como
UTF-8. O runner não grava argumentos, saída ou histórico automaticamente.

**Execução supervisionada não é sandbox.** Scripts aprovados têm as
permissões da conta do usuário, podem ler arquivos, escrever e acessar
rede. Filtrar variáveis de ambiente não impede que um script leia seus
próprios arquivos de configuração. Não há cota de memória/CPU nem rollback
dos efeitos já realizados. Processos que se desassociam deliberadamente
da árvore e encerramento abrupto do sistema requerem contenção adicional.

Os gates do host impedem que automação, tarefas npm, mutações conflitantes
e execução de desenvolvimento disputem o workspace. O fechamento normal
e a perda do renderer solicitam cancelamento. A tentativa pendente também
é invalidada: uma confirmação que termine depois do cancelamento não
inicia um novo processo.

## Limites explícitos

- Uma execução por vez; duração máxima de 120 segundos.
- Saída máxima de 96 KB; a captura exibida conserva os últimos 48 mil
  caracteres. Excesso de saída encerra a execução com estado próprio.
- Descoberta de até 300 arquivos, até 4 mil entradas e profundidade 8;
  pastas ocultas, geradas, dependências e ambientes virtuais são excluídos.
- Até 64 argumentos, 2 KB por argumento e 16 KB no conjunto.
- Entrada padrão fechada: programas que exigem perguntas interativas
  precisam de um terminal externo.
- Servidores persistentes, breakpoints/DAP, Python LSP e instalação de
  dependências não fazem parte desta implementação.

## Verificação

`node --test --test-timeout=30000 tests/development-runtime.test.mjs tests/development-ipc.test.mjs`

Os testes usam processos reais de Node/Python, código e projetos temporários:
execução com argumentos, artefatos gravados, stdout/stderr, sintaxe válida e
inválida, testes que passam/falham, suite Python vazia, filtros do ambiente,
UTF-8 em chunks, concorrência, revisão stale, cancelamento, descendentes,
timeout, saída excessiva e erro de executável. O adaptador verifica negação
de consentimento, aprovação exata, mudança de workspace, mutex do host e
cancelamento durante preparação ou confirmação nativa.

`node scripts/smoke-development.mjs`

O smoke abre o Electron e usa UI, preload, IPC e interpretadores reais.
Ele substitui somente diálogos nativos pelo processo de teste, usa um
workspace e perfil temporários e produz screenshots/resultado em
`smoke-artifacts`. Exige build pronto, Node/Python instalados e ambiente
gráfico compatível. Criar o script não equivale a executá-lo: consulte o
resultado real da execução/CI da revisão testada.
