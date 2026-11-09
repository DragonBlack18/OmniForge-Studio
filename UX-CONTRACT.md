# Contrato de interação do OmniForge

Complementa `DESIGN.md`, `docs/SECURITY.md` e os contratos de cada módulo. UI em pt-BR; escopo desktop. Mantém uma navegação global, estado de edição entre módulos e ações explícitas para salvar ou executar.

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Table Selection | CapabilityCenter e sessões de documento | Modelo de seleção de cada domínio | Linha única identificada; nenhuma seleção total implícita | smoke:capabilities; smoke:code-workspace |
| Select/Listbox | Controle HTML nativo | Sistema operacional e rótulo no JSX | native; popup do sistema aceito | Teclado e filtros nos smokes |
| Date | Agendador existente | Contrato do LocalScheduleEngine | Campos declarados pelo agendador; sem calendário novo | smoke:schedules |
| Form | Validação do domínio + operação exclusiva | Schemas/core e formulários existentes | noValidate, erro local, valores preservados | Testes core; smokes de desenvolvimento, CAD e criação |
| Scrollbar | src/studio.css | Tokens --of-scroll-thumb / --of-scroll-track | Geometria por superfície | Capturas e rolagem em 1040/1280/1440 |
| Toast | AppShell statusbar | notify + role=status | Status persistente; erros locais na operação | smoke:capabilities; smoke:development |
| CRUD | Serviços nativos e sessões por módulo | Revisão SHA-256 e workspace fixado | Criar, editar, salvar, copiar, mover, remover cópia | smoke:project-suite; smoke:cad-precision; recovery |

## Confirmação e foco

`src/shared/confirm-action.mjs` aceita apenas uma solicitação por vez. `ConfirmationDialog` usa o modal HTML nativo, contém foco, inicia em Cancelar, aceita Escape e devolve foco ao acionador quando ele ainda existe. Confirmações antigas do browser são migradas para este proprietário. Operações nativas sensíveis continuam usando `dialog.showMessageBox` no processo principal.

Solicitar consentimento antes de adquirir um bloqueio de edição quando a ação modifica uma sessão que depende desse mesmo bloqueio. Revalidar a identidade/revisão do documento após o consentimento. Nunca aplicar um resultado de worker a outro documento ou a um grafo editado durante o cálculo.

## Estados e resultados

Ao atualizar listas, ignorar resultados de workspace antigo. Impedir submissões simultâneas com mutex real; estado React sozinho não é bloqueio. Exibir carregamento, ausência de resultados, indisponibilidade de runtime, erro e conclusão real. Saída de scripts distingue execução, verificação de sintaxe e testes. Uma saída concluída com código diferente de zero representa falha.

Formulários usam validação própria; errors não eliminam os valores fornecidos. Operações com revisão divergente preservam o arquivo e oferecem atualização explícita. Catálogo e recursos planejados são somente informativos: não baixam ou executam projetos automaticamente.

## Evidência

Testes unitários verificam contratos e falhas reais. Smokes Electron usam projetos temporários, controles reais, arquivos e resultados do processo nativo. CI Windows executa as versões sem shims de ambiente. Capturas e JSON de resultados são anexados aos artefatos do workflow; não são prova de todas as combinações de hardware ou projetos externos.
