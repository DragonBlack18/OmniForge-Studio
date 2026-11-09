# Contrato de interação do OmniForge

Complementa `DESIGN.md`, `docs/SECURITY.md` e os contratos de cada módulo. UI em pt-BR; escopo desktop. Mantém uma navegação global, estado de edição entre módulos e ações explícitas para salvar ou executar.

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Table Selection | CapabilityCenter, sessões de documento e esquema SQLite | Modelo de seleção de cada domínio | Linha única identificada; nenhuma seleção total implícita | smoke:capabilities; smoke:code-workspace; smoke:database |
| Select/Listbox | Controle HTML nativo | Sistema operacional e rótulo no JSX | native; popup do sistema aceito | Teclado e filtros nos smokes |
| Date | Agendador existente | Contrato do LocalScheduleEngine | Campos declarados pelo agendador; sem calendário novo | smoke:schedules |
| Form | Validação do domínio + operação exclusiva | Schemas/core e formulários existentes | noValidate, erro local, valores preservados; foco no primeiro campo inválido | Testes core; smokes de desenvolvimento, cotas CAD, SQLite e criação |
| Scrollbar | src/studio.css | Tokens --of-scroll-thumb / --of-scroll-track | Geometria por superfície | Capturas e rolagem em 1040/1280/1440 |
| Toast | AppShell statusbar | notify + role=status | Status persistente; erros locais na operação | smoke:capabilities; smoke:development |
| CRUD | Serviços nativos e sessões por módulo | Revisão SHA-256 ou revisão monotônica da sessão SQLite, com workspace fixado | Criar, editar, salvar, copiar, mover, remover cópia | smoke:project-suite; smoke:cad-dimensions; smoke:database; recovery |

## Confirmação e foco

`src/shared/confirm-action.mjs` aceita apenas uma solicitação por vez. `ConfirmationDialog` usa o modal HTML nativo, contém foco, inicia em Cancelar, aceita Escape e devolve foco ao acionador quando ele ainda existe. Confirmações antigas do browser são migradas para este proprietário. Operações nativas sensíveis continuam usando `dialog.showMessageBox` no processo principal.

Solicitar consentimento antes de adquirir um bloqueio de edição quando a ação modifica uma sessão que depende desse mesmo bloqueio. Revalidar a identidade/revisão do documento após o consentimento. Nunca aplicar um resultado de worker a outro documento ou a um grafo editado durante o cálculo.

## Estados e resultados

Ao atualizar listas, ignorar resultados de workspace antigo. Impedir submissões simultâneas com mutex real; estado React sozinho não é bloqueio. Exibir carregamento, ausência de resultados, indisponibilidade de runtime, erro e conclusão real. Saída de scripts distingue execução, verificação de sintaxe e testes. Uma saída concluída com código diferente de zero representa falha.

Formulários usam validação própria; errors não eliminam os valores fornecidos. Operações com revisão divergente preservam o arquivo e oferecem atualização explícita. Catálogo e recursos planejados são somente informativos: não baixam ou executam projetos automaticamente.

## Sessões nativas v0.11.0

O terminal possui uma sessão ativa. Sua abertura exige consentimento nativo;
depois disso os comandos digitados são executados pelo shell real. A sessão
permanece consumindo saída ao navegar, com retenção limitada e ACK. Não
bloqueia salvar arquivos nem executar outros runners. Trocar de projeto
exige encerrar o terminal primeiro. Ctrl+C interrompe o comando; Encerrar
usa a confirmação editorial compartilhada e espera o processo terminar.

O SQLite possui uma imagem aceita no processo principal. Consultar usa
leitura; Aplicar alterações confirma uma transação completa. Salvar cópia
confirma a criação de arquivo novo e nunca substitui a origem. Erro, prazo
ou cancelamento descartam somente a operação atual. Uma sessão suja exige
salvar uma cópia ou confirmar descarte antes de trocar projeto/fechar.
Texto SQL e parâmetros ficam preservados entre módulos; não são autosave.

`activeWorkspace` reanexa o contexto já aberto quando apenas o renderer
recarrega. Não escolhe um projeto, executa programas ou recria uma sessão
depois de reiniciar o aplicativo. Terminal e banco retornam o estado que
o host ainda possui; falha na leitura de arquivos não pode tornar esse
estado inacessível. A tela explica erros de reanexação sem sobrescrever
arquivos ou inventar uma revisão salva.

Ao adicionar a primeira cota, o CAD promove o desenho para schema v2.
Uma cota fixa participa do validador central; transformações incompatíveis
são recusadas integralmente. DXF exige confirmar a perda das anotações na
cópia exportada; o documento nativo permanece completo.

## Evidência

Testes unitários verificam contratos e falhas reais. Smokes Electron usam projetos temporários, controles reais, arquivos e resultados do processo nativo. CI Windows executa as versões sem shims de ambiente. Capturas e JSON de resultados são anexados aos artefatos do workflow; não são prova de todas as combinações de hardware ou projetos externos.
