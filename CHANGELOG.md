## [0.5.0] — Controle Git local (candidate)

- Git local verdadeiro, sem shell de comandos no renderer: status -z, renomeações, diffs, últimas 12 revisões.
- Stage/unstage explícitos para arquivos escolhidos, com validação contra travessia de caminhos e índice atualizado; sem reset destrutivo.
- Commit somente depois de confirmação Electron nativa com a lista de arquivos preparados, hooks desabilitados e sem push remoto.
- Painel dedicado integrado à navegação, visão geral, testes reais com repositórios efêmeros e smoke Electron Windows.
- Dependência externa: Git CLI instalado; repositórios Git não confiáveis e filtros externos precisam de avaliação.

## [0.4.1] — Windows atomic persistence hotfix (candidate)

- Prevent intermittent Windows EPERM/EACCES/EBUSY failures while replacing local schedule metadata, flow snapshots and CAD documents.
- Bounded retry only for Windows transient rename errors; no deletion or destructive fallback of the previous destination.
- Deterministic tests cover eventual success, exhaustion, nonretryable errors, non-Windows behavior, and a real atomic write.
- Release only after green Windows scheduler E2E, all regressions and Setup/Portable package checks.

## [0.1.3] — 2026-10-28

- Histórico persistente por workspace, com arquivos JSON individuais e sem limpeza automática.
- Visão de histórico e detalhes de PASS/FAIL/SKIP e tempo por bloco na interface Electron.
- Metadados somente: sem payload, sem resposta de API e com redação de segredos comuns.
- Suíte ampliada para 49 testes, incluindo isolamento e preservação entre projetos.

## [0.1.2] — 2026-10-28

- Novo conector real HTTP JSON local (GET/POST) com autorização por execução.
- Bloqueio explícito de acesso externo, redirects e respostas não-JSON.
- Simulação parcial honesta (SKIP) sem chamadas nem dados falsos.
- Testes integrados com servidor loopback real; limites de timeout/tamanho.

# Changelog

## 0.1.1 — 2026-10-28

- Bloqueio de sobrescrita externa de fluxos usando SHA-256.
- Snapshots de recuperação por revisão em diretório controlado do workspace.
- Indicador de fluxo modificado e proteção ao trocar de projeto.
- Serialização de gravação e execução no IPC Electron.
- Novo gate Windows Playwright/Electron de fluxo e reinício do aplicativo.
- Testes Node ampliados para 28 casos (a validar no CI também).

# Changelog

## [0.1.0] — 2026-10-28 · Fundação experimental

- Projeto desktop inicial: Electron + React Flow + Monaco.
- Motor independente de grafo, catálogo versionado, validação, execução e dry-run.
- Edição de arquivos locais, leitura de workspace, persistência de fluxos, painel de diagnóstico.
- Testes Node para fluxos, persistência e travessia de diretórios.
- Documentação de arquitetura, roadmap, segurança e decisões.
- Workflows propostos para CI e pacote Windows; ainda não executados no GitHub.

## 0.1.4 — Catálogo local de projetos
- Cadastro e alternância entre projetos locais, sem cópia dos arquivos.
- Catálogo separado em app-data, inclusive projetos offline e remoção não destrutiva.
- Verificação de manifesto somente-leitura, 58 testes Node e smoke Electron estendido.

## 0.1.5 — API local entre projetos
- Capacidade HTTP GET/POST com esquema JSON verificável, vínculo por projeto e autorização por execução.
- Tela Conectores de projetos, bloco Chamar projeto por API e validação integrada ao motor.
- Entrada e saída tipadas, dry-run sem requisições e limite de bytes/timeout.
- 68 testes Node (incluindo integração de dois workspaces por servidor HTTP real) e smoke Electron ampliado.

## [0.1.10] — Expanded functional catalog and portable exit regression (2026-10-28)
- v0.1.6: native close dialog, removal of silent renderer `beforeunload` blocker, explicit Sair command; smoke tests for cancel/exit and packaging.
- v0.1.7: searchable catalog grouped by technical category with renderer descriptions for real, registered nodes.
- v0.1.8: true/false port routing and skip semantics; combine/merge with graph-port enforcement.
- v0.1.9: 49 pure transformations + protected output file read, 55 total functional nodes and extensive unit coverage.
- v0.1.10: built-in template library, real catalog and window close Electron E2E tests, Windows Portable/Setup smoke gate.
- Out of scope: third-party n8n connector ecosystem, arbitrary code execution, remote APIs, automatic timers and CAD.

## v0.2.0 — CAD Sketch 2D e nova experiência de workbench (em validação)

- Desenho técnico 2D nativo em mm: linhas, retângulos, círculos, camadas, snapping, navegação, seleção, medidas e desfazer/refazer.
- Persistência independente de CAD por workspace, revisão SHA-256, snapshots anteriores e exportação SVG/DXF R12.
- Dois blocos executáveis de integração entre CAD e fluxos, além de um sexto modelo de automação.
- Nova tela inicial com visão dos módulos realmente operacionais e dos recursos ainda planejados.
- Revisão do design visual e da hierarquia da interface, mantendo a identidade OmniForge.
- Corrigido diagnóstico `partialSimulation` em ramificações Se/Senão reais, com testes de regressão.
- Pesquisa e decisões de licença para Theia, FreeCAD, LibreCAD, JSCAD, Bitbybit e kernels geométricos.
- Gating necessário antes de release: Node tests, build React/Vite, E2E Electron Windows, testes do portátil e NSIS.

## [0.2.1] — 2026-10-28 · Executor supervisionado e CAD de precisão

- Processo separado para executar fluxos declarativos, com timeout global, controle de cancelamento e eventos de progresso no editor.
- Cancelamento, timeout e falha de processo retornam resultado explícito ao histórico; etapas concluídas externamente não são revertidas.
- IPC restrito à janela principal, lista limitada de variáveis de ambiente do processo filho e guardas contra gravações simultâneas.
- Ferramentas CAD: coordenadas editáveis por números, ajuste de desenho à janela, espaçamento de grade, snap opcional e camadas novas/removíveis.
- Geometrias e camadas validadas no núcleo, com preservação de revisão SHA-256 e proteção contra sobrescrita externa.
- E2E Windows passa a aguardar efetivamente exportação DXF e SVG e a finalizar somente o processo de teste em caso de falha.
- Testes de cancelamento, timeout, execução real, dry-run, cotas, layers e geometria exata; aprovação de release condicionada ao CI completo.

### Refinamentos finais da interface v0.2.1

- Navegação principal agrupada por Workspace / Recursos / Acompanhamento e opção de recolher, com ícones SVG originais.
- Biblioteca e explorador contextuais, busca de blocos/arquivos, árvores recolhíveis, inspetor opcional e layout responsivo.
- Visão geral reestruturada para dados locais reais, removendo elementos de aparência demonstrativa.
- CAD alinhado ao design system grafite/verde-azulado, mantendo ferramentas e medidas em mm.
- Ctrl+B abre/fecha a navegação, Ctrl+K busca blocos e Ctrl+S salva o documento ativo (incluindo CAD) sem acionar 'Salvar página' do Chromium.
- E2E Windows atualizado para navegação, árvore de arquivos, atalho CAD e persistência; versão permanece pendente dos gates da última revisão.

## [0.2.2] — Importação DXF ASCII 2D (candidata, sem release)

- Leitor DXF em módulo original, separado do modelo geométrico: LINE, CIRCLE e LWPOLYLINE reta.
- Conversão explícita de polegadas/pés/cm/m para mm; DXF sem unidade requer aprovação nativa, padrão cancelar.
- Camadas com cores/visibilidade/lock, incluindo camadas vazias, sem exceder limites.
- Arquivo externo escolhido pelo diálogo Electron; leitura limitada a 2 MB e UTF-8, sem links simbólicos, escritas ou caminhos arbitrários enviados pelo renderer.
- Importação em memória com ajuste de enquadramento, histórico Undo e confirmação antes de descartar edições ainda não salvas.
- Suíte de testes unitários e filesystem; smoke Electron dedicado para importação real, cancelamento, persistência, exportação e rejeição de objetos incompatíveis.
- Não importa DWG, ARC/3D, blocos, splines ou dados silenciosamente parciais. A integração depende do merge e da validação da v0.2.1.

## [0.3.0] — Extension Hub declarativo / integração entre módulos (candidata)

- Registro local de extensões instaladas pelo próprio usuário (não há mercado remoto, npm install, código arbitrário ou dependências externas).
- Pacotes `.ofx.json` com contrato versionado, 10 operações transformadoras seguras, 16 ações por pacote e controle de saída JSON.
- Manifestações com SHA-256 verificável e erro explícito caso alteradas fora da aplicação; atualização revoga grants de todas as pastas.
- Permissões `workflow.transform` e `workspace.output.write` por workspace e revogação sem exclusão de arquivos de projeto.
- Novo nó `extension.call` validado pelo graph e executado no worker separado, com simulação sem efeitos e histórico de metadados.
- Central visual completa: instalar, ativar, permitir/revogar, incluir ações no canvas, desinstalar, buscar e listar pacotes.
- Exemplo funcional de conversão de massa e etiqueta, disponível no repositório e em instalação assistida no aplicativo.
- Testes Node reais de manifesto, execução, escrita, atomicidade, atualização, grants, symlink, adulteração e fluxo supervisionado.
- Novo Playwright E2E Windows testa interface, pacote, permissão nativa, execução efetiva, revogação e preservação dos dados.
- **Não é** execução de plugins não confiáveis nem suporte a extensões VS Code/Theia/VSIX; pré-release sujeita aos gates Windows.

## [0.4.0] — Execuções automáticas locais e gerenciamento de agendas (candidata)

- Nova Central de Agendamentos na sidebar e home do workspace, com criação desativada por padrão, busca, pausa, exclusão, próximo disparo, histórico e revalidação.
- Agendas persistentes no perfil local do Electron, serialização atômica, máximo de 50 registros, travas por processo e validação de registros adulterados/symlink.
- Fluxo de origem preso à revisão SHA-256 no disco; mudanças de versão, permissões revogadas, erros de validação e projeto indisponível bloqueiam a execução futura.
- Motor em Node/Electron com polling de 5s, apenas uma execução de fluxo por vez, reutilizando worker supervisionado e registro de histórico com metadados.
- Ao iniciar após crash, tarefas que estavam executando são pausadas; ao retornar de suspensão e desligamento, horários perdidos são coalescidos sem replay em massa.
- A API de agendamento recusa HTTP e project.callLocalApi (estes exigem consentimento manual). Extensões somente com grants locais válidos.
- Ativação, execução manual e atualização de revisão exigem confirmação nativa; nenhum arquivo de projeto é excluído ao remover agenda.
- Node test fake clock + worker real; Electron E2E para criar, ativar, executar, pausar, reiniciar, detectar alteração externa, reaprovar e remover.
- Windows dist gate testa Portable + NSIS e app.asar; release condicionada aos checks do commit final.
- Ainda não implementa Windows Service, cron completo, multiusuário ou cluster/exactly-once.
