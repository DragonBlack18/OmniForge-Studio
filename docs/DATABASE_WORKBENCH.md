# Banco SQLite — rascunhos locais e cópias explícitas

O módulo **Banco SQLite** executa SQLite nativo pelo `node:sqlite` do Node 24.22.1 incluído no Electron 45.1.0. Não exige servidor, pacote nativo adicional, download de WASM, credenciais nem conexão de rede. A primeira versão trabalha com um banco por vez, em uma cópia integral na memória.

## Usar no projeto

1. Abra uma pasta de projeto e entre em **Desenvolvimento → Banco SQLite**.
2. Use **Novo banco** para criar um banco vazio em memória, ou escolha um arquivo `.sqlite`, `.sqlite3` ou `.db` do projeto. A seleção é explícita; o aplicativo não abre bancos automaticamente ao iniciar.
3. Escreva SQL. **Consultar** (também `Ctrl+Enter`) aceita uma instrução somente de leitura. **Aplicar alterações** pede confirmação nativa e executa o script inteiro em uma transação.
4. Revise o esquema, consulte uma tabela e confira o resultado. Erros e interrupções preservam a última imagem aceita da sessão.
5. Informe um caminho relativo e use **Salvar cópia**. A pasta deve existir e o nome deve ser novo. A confirmação identifica projeto, destino, revisão e tamanho. A cópia usa criação exclusiva; nenhum arquivo existente é substituído.

Exemplo de um script real, aplicado sem `BEGIN`/`COMMIT`:

```sql
CREATE TABLE tarefas (
  id INTEGER PRIMARY KEY,
  titulo TEXT NOT NULL,
  concluida INTEGER NOT NULL DEFAULT 0 CHECK (concluida IN (0, 1))
);
INSERT INTO tarefas(titulo) VALUES ('Preparar projeto');
CREATE INDEX tarefas_concluida ON tarefas(concluida);
```

Para inserir valores separados do SQL, escreva `INSERT INTO tarefas(titulo) VALUES (:titulo);` e informe `{"titulo":"Revisar entrega"}` em **Parâmetros vinculados**. Arrays correspondem aos marcadores posicionais `?`. São aceitos texto, número finito seguro e `null`; booleanos e objetos aninhados devem ser convertidos explicitamente pelo autor. Com parâmetros, somente uma instrução é aceita. Scripts com várias instruções deixam o campo de parâmetros vazio. Valores vinculados nunca são concatenados ao SQL.

O esquema mostra tabelas, views, índices, triggers, colunas, tipos, chave primária e `NOT NULL`. **Consultar tabela** produz uma consulta com identificador citado corretamente sem substituir o conteúdo do editor. **Copiar JSON** copia somente o resultado exibido, incluindo os tipos e os indicadores de truncamento.

A cópia de resultado usa um endpoint nativo restrito à sessão e ao workspace atuais, com texto de até 2 MiB. Não exige liberar a permissão de clipboard do Chromium; a política geral do renderer permanece inalterada.

## Persistência e concorrência

A origem é lida uma vez; a sessão não é uma conexão viva ao arquivo. O SHA-256 da origem identifica aquele snapshot, não oferece compare-and-swap nem bloqueio contra outros aplicativos. Nunca salvamos sobre a origem. Mudanças externas posteriores não entram no rascunho, e uma cópia salva representa a versão aceita dentro do OmniForge.

Feche outras conexões antes de abrir uma origem. A abertura verifica tamanho, identidade, alterações observáveis durante a leitura, cabeçalho e integridade SQLite. Bancos com cabeçalho WAL ou com qualquer arquivo `-wal`, `-shm` ou `-journal` presente são recusados, mesmo que o auxiliar pareça antigo ou vazio. O aplicativo não remove auxiliares, não altera o modo de journal da origem e não faz checkpoint. Gere uma cópia offline consolidada em modo DELETE no aplicativo de origem. Copiar apenas o arquivo principal de um banco vivo não é uma estratégia de backup consistente.

**Salvar cópia** usa `wx`/`O_EXCL`, sincroniza o descritor e recusa colisões (inclusive diferenças de maiúsculas observadas), links e destinos protegidos. Falhas não marcam a sessão como salva. O processo conserva o rascunho para permitir nova tentativa. A cópia não é uma promessa de segurança contra um processo local malicioso que troque diretórios simultaneamente; não há mecanismo portátil de `openat` com trava de árvore neste módulo.

Navegar entre módulos preserva editor SQL, parâmetros, resultado e sessão. Recarregar o renderer mantém a última imagem aceita no processo principal e reanexa o projeto ativo; o texto não aplicado do editor SQL e o resultado visível são transitórios. Mudar de projeto limpa o editor SQL e requer resolver primeiro alterações aplicadas pendentes. Fechar uma sessão suja ou o aplicativo requer consentimento para descartar. Não existe recuperação desse banco em memória após encerramento abrupto de todo o aplicativo, falha de energia ou reinício do sistema.

## Processo, transações e cancelamento

O host guarda a última imagem serializada aceita. Cada operação cria um processo descartável com `DatabaseSync(':memory:')`, desserializa a imagem e executa SQLite. No Electron, o transporte é `utilityProcess.fork`; os testes Node usam `child_process.fork` com o mesmo arquivo de worker e motor.

Uma alteração bem-sucedida devolve uma nova imagem e um esquema atualizado. O host só os aceita se sessão e revisão ainda corresponderem à solicitação. Qualquer erro descarta a imagem do processo, incluindo alterações que precedam a falha no mesmo script. O cancelamento e o prazo eliminam o processo separado; eles não dependem de um callback JavaScript rodar enquanto SQLite ocupa o thread nativo. A imagem anterior permanece disponível, inclusive alterações anteriores ainda não salvas.

As operações têm mutex no host e no serviço. Confirmações copiam a solicitação validada antes de aguardar o usuário, depois revalidam projeto, sessão e revisão. O renderer não recebe bytes do banco, acesso genérico ao filesystem, SQL privilegiado nem um canal IPC arbitrário.

Depois que uma gravação exclusiva começa, ela não é interrompida pelo cancelamento de consulta. A liberação da sessão é adiada até a gravação terminar. Falha na atualização da lista de arquivos não oculta uma sessão nativa já aberta: o bootstrap recupera estado e catálogo independentemente e reconcilia eventos que chegaram durante a leitura.

## Limites e escopo atual

| Item | Limite / comportamento |
|---|---|
| Banco | 32 MiB por imagem; uma sessão em memória |
| SQL | 64 KiB por operação |
| Parâmetros | Até 256 valores e 64 KiB totais |
| Consulta | Uma instrução, até 1.000 linhas e 1 MiB de saída |
| Colunas | Até 256 por consulta |
| Prévia de texto | 4 KiB por célula, com tamanho original |
| BLOB | 128 bytes em hexadecimal, com tamanho original |
| INTEGER | Decimal em string tipada para preservar os 64 bits |
| Prazo | 10 segundos por processo, incluindo preparação |
| Esquema visível | Até 200 objetos; 4.096 colunas totais e orçamento de 512 KiB; limites sinalizados |
| Descoberta | Até 150 bancos, 5.000 entradas, seis níveis; ignora pastas geradas e privadas |

O autorizer nativo recusa `ATTACH`, `DETACH`, `PRAGMA` do usuário, transações e savepoints do usuário, extensões e criação de tabelas temporárias/virtuais. `VACUUM` também não executa dentro da transação controlada. Não há funções de filesystem registradas. `allowExtension` fica desabilitado, `defensive` habilitado, `trusted_schema` desligado, chaves estrangeiras habilitadas e temporários em memória. O modo de consulta também ativa `query_only`. Limites de SQLite restringem tamanho de valores, colunas, profundidade, argumentos, variáveis e código de execução.

Não fazem parte desta versão: bancos criptografados, conexões WAL vivas, múltiplas conexões, edição direta da origem, PostgreSQL/MySQL, migrations automáticas, agendamento de consultas, importação CSV ou edição por célula. DDL e DML reais estão disponíveis no editor SQL, incluindo relações, índices e triggers compatíveis com a política acima.

## Verificação

- `tests/sqlite-engine.test.mjs`: motor real, DDL/DML, joins, parâmetros literais, inteiro64/BLOB/NULL, leitura protegida, scripts/triggers, rollback, metadados e resultados limitados, views adversariais durante introspecção.
- `tests/sqlite-session.test.mjs`: processos reais, cancelamento e timeout, revisão, imagem anterior, origem preservada, criação exclusiva, WAL/auxiliares, links, descoberta e caminhos.
- `tests/sqlite-ipc.test.mjs`: recusa/aceite nativos, cópia do pedido durante consentimento, mutex, perda do renderer, troca de projeto, cópia e fechamento sujo. Fixtures controlam diálogo, eventos e clipboard; SQLite e filesystem são reais. O smoke abaixo verifica o clipboard efetivo do Electron.
- `tests/sqlite-bootstrap.test.mjs`: falhas independentes de catálogo/estado, recuperação de rascunho por evento, ordenação e workspace correto.
- `scripts/smoke-database.mjs`: controles reais no Electron, utility process, criação/esquema/consulta, clipboard nativo, parâmetros, rollback, cancelamento, reanexação após reload do renderer, arquivo exportado e reaberto, origem byte a byte, consentimentos e layouts 1040/1280/1440.
- `scripts/lib/packaged-database-checks.mjs`: helper autocontido para o gate do executável instalado. Exercita `node:sqlite` e subprocesso dentro do pacote, não apenas o Node do ambiente de build.

## Referências oficiais

- [Node 24.22.1 — SQLite](https://nodejs.org/download/release/v24.22.1/docs/api/sqlite.html): `DatabaseSync`, `serialize`, `deserialize`, `limits`, `setAuthorizer` e tipos.
- [Electron — utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process): processo supervisionado e mensagens.
- [SQLite — transações](https://sqlite.org/lang_transaction.html): atomicidade e transações.
- [SQLite — backup online](https://sqlite.org/backup.html): limitações de cópias de bancos vivos. Este módulo oferece exportação de snapshot isolado, não backup online da origem.
- [SQLite — PRAGMA](https://sqlite.org/pragma.html): `query_only`, `trusted_schema`, `foreign_keys` e limites de páginas.

O catálogo distingue a integração efetiva `node:sqlite` de `better-sqlite3`, que continua uma alternativa pesquisada e não é uma dependência incorporada.
