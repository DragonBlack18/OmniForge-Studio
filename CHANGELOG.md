## [0.7.8] — CAD Toolkit: operações geométricas precisas (candidata)

- Rotação de linha/círculo e retângulo nos ângulos compatíveis com o schema 2D, com pivô local/global; espelhamento X/Y.
- Cópia paralela de linha por distância e matriz retangular de objetos (até 64 cópias por transação), com ID único e undo único.
- Medição não destrutiva por dois cliques na vista (distância, ΔX, ΔY, ângulo), sem arquivo novo.
- Operações numéricas concentradas em seção recolhível do inspetor, mantendo interface grafite/vermelho e menu global único.
- Tests Node, Electron real, regressão e empacotamento NSIS/Portable como gates de publicação.

## [0.7.7] — Studio UX e propriedades CAD (candidata)

- Remove o trilho global de navegação duplicado; preserva destinos e atalhos em um único menu.
- Tema grafite/preto com vermelho discreto, cabeçalhos compactos e remoção de cartões/comandos redundantes.
- CAD: árvore pesquisável de objetos/camadas; nomes, transferência de camada, visibilidade, bloqueio e largura persistente do inspetor.
- Edição por coordenadas ou dimensões, translação/escala, duplicação, medições e undo/redo reais; schema v1 recebe campos opcionais compatíveis.
- Cursor coalescido por frame; objetos ocultos não entram em SVG/DXF/snap; propriedades passam pelo core e pelo salvamento com revisão.
- Regressão Node e Electron, capturas reais em duas larguras, gates existentes e validação de Setup/Portable mantidos.

## [0.7.6] — Lazy React Flow + benchmarks reais (candidata)

- Elimina a importação estática de `@xyflow/react` no shell; nó, aresta, edição e revisão migram para hook React leve independente.
- Atualizadores oficiais de mudanças e adição de conexões permanecem no `FlowCanvas` carregado por demanda.
- Protege `flowDirty` se houver edição concorrente ao salvamento; manutenção de dados e revisões na troca de módulos.
- Novo gate de JS inicial (<=375 KB), baseline medida da v0.7.5, instrumentação cold start com 3 sessões reais e memória via CDP quando disponível.
- Teste E2E Windows com arquivo de fluxo real, visitas ao CAD/Home/IDE, retorno e salvamento explícito. Mantém todos os outros smokes e distribuição Windows.
- Candidata: publicar apenas após testes Linux/Windows, bundle e Setup/Portable com SHA-256 aprovados.

## [0.7.5] — Workbench técnico modular e preparação para integrações (candidata)

- Activity rail por domínios com árvore de ferramentas, preservando o acesso a todos os módulos existentes.
- Tela inicial operacional no lugar de cartões de dashboard; contexto do projeto real e comandos para ferramentas existentes.
- Paleta de comandos Ctrl+Shift+P/F1 e abertura rápida de arquivos Ctrl+P, busca limitada e índice seguro do workspace, sem execução arbitrária.
- Perf: comando carregado sob demanda, ícones SVG locais memorizados, opções Monaco estáveis com minimap/wrap reduzidos em arquivos grandes. Sem dependências novas.
- Documento estratégico de integração: Code-OSS, Theia, FreeCAD, Lucide e impedimentos legais de incorporar n8n em produto distribuído.
- Testes Node de comandos/índice e gate real Electron Windows de navegação, arquivo, preferências e integridade, mais testes anteriores de CAD/IDE/automações.
- Candidata: merge e Release somente após CI Windows/Linux, orçamento de bundle, Setup/Portable e hashes PASS.

## [0.7.4] — Recuperação CAD não destrutiva (candidata em validação)

- Checkpoints locais de desenhos 2D não salvos após 900 ms, em userData, sem escrita automática no arquivo original.
- Revisões SHA-256 independentes de desenho original e rascunho, fila serializada, escrita atômica e limites por perfil.
- Recuperação manual com guarda de conflito externo, inspeção JSON e descarte confirmado; CAD, IDE e automações permanecem módulos independentes.
- Testes Node de concorrência, quotas, isolamento, corrupção e conflito; smoke Electron Windows com recarga, salvamento explícito e verificação do filesystem.
- Versão candidata: publicação e integração condicionadas ao CI e à validação real do instalador/portátil Windows.

## [0.7.3] — Recuperação local e não destrutiva do Monaco (candidata)

- Checkpoint automático de conteúdo não salvo, com debounce de 700 ms e armazenamento separado no userData.
- Backend isolado da IDE com gravação atômica, revisão otimista por arquivo, no máximo 40 documentos de 240 KB e rejeição de arquivos de credenciais.
- UI permite restaurar somente no editor, copiar o rascunho ou descartá-lo explicitamente; alterações externas bloqueiam restauração direta.
- Registros nunca sobrescrevem arquivos do workspace. O salvamento original segue revisão SHA-256 e tenta limpar checkpoint obsoleto somente por token.
- Testes Node de isolamento, symlinks, corrupção, quota e concorrência; E2E real Electron com recarga do renderer, salvamento e conflito externo.
- Distribuição Windows permanece condicionada ao gate de recuperação, testes antigos e validação de Setup/Portable.

## [0.7.2] — Stability Foundation (candidata)

- Trava síncrona e testada de operações do workbench para evitar double-click races sem enfileirar efeitos privilegiados.
- Limites de erro React por ferramenta lazy (Monaco, CAD, automação e demais módulos), com recuperação manual sem recarga global.
- E2E da IDE com verificação visível, IPC e filesystem; duas sessões isoladas no CI Windows.
- Evidências restritas a testes sintéticos são coletadas apenas em falhas, com artefatos CI.
- Nenhum schema de projeto, CAD, fluxo ou persistência foi migrado ou resetado.

## [0.7.1] — Histórico persistente de tarefas (candidata)

- Resultados de tarefas npm persistidos por workspace, no perfil do Electron, fora das pastas de projeto.
- Somente metadados: nome de script, estado final, duração, código de saída e datas; não persistem comandos, logs, ambiente ou caminhos reais.
- Escrita atômica, validação de estrutura e links simbólicos, serialização de gravações e limite circular de 60 registros por projeto.
- Interface com histórico legível, atualização, erro explícito e preservação entre recargas do renderer.
- Testes Node para persistência, isolamento, concorrência, rejeição de corrupção e retenção; Electron E2E verifica resultados reais no disco e confidencialidade.

## [0.7.0] — Central de Tarefas (candidata)

- Descoberta real de scripts do package.json, com limite de tamanho, nomes autorizados e revisão SHA-256 do manifesto.
- Execução explícita via Node/npm CLI, sem argumentos arbitrários ou shell do renderer, com confirmação nativa da definição real do script.
- Logs stdout/stderr ao vivo, status e código de saída; timeout de 120 s, limite de 96 KB e cancelamento da árvore de subprocessos.
- Scripts lifecycle pre/post implícitos desabilitados; variáveis de ambiente filtradas, sem persistência de logs contendo dados de projeto.
- Controle global de operações impedindo troca de workspace e execução de fluxos concorrentes durante tarefas.
- Testes reais Node Linux/Windows e E2E Electron para aprovação, recusa, scripts executáveis, cancelamento e preservação de dados.
- Módulo isolado em core/modules/ide, src/modules/ide e electron/modules. A execução de código de terceiros NÃO é sandbox.

## [0.6.1] — Modular Workbench & Performance (candidate)

- Seven canonical backend domains and small legacy import facades, preserving saved data and existing APIs.
- Separate CAD, automation, IDE, extensions and workbench React directories, shared icons and centralized navigation registry.
- Lazy Monaco, language workers, CAD and automation canvas, with CAD remaining mounted after first use to protect unsaved edits.
- Electron capacity host dynamically loads CAD, Git and IDE on demand; native IPC allowlist unchanged.
- Collapsible domain-aware sidebar, persistent group preferences and technical breadcrumb.
- Build-manifest-based initial bundle byte budget and automated module-boundary regression tests.
- Windows CI/release still requires all real E2E tests, Setup/Portable install/uninstall and SHA256.

## [0.6.0] — Workspace IDE (2026-10-29)

- Busca literal global nos arquivos do workspace, retorno real de linha/coluna e navegação direta no Monaco.
- Novo arquivo e nova pasta na sidebar com caminhos validados, exclusive-create e sem overwrite; edição segue revisão SHA-256.
- Cotas para arquivos, volume, ocorrências, profundidade e tempo; diretórios internos, symlinks, segredos e binários excluídos.
- IPC autorizado, trava de pesquisa e criação serializada; lock explícito de gravações do editor.
- Regressões de Node Linux/Windows, E2E Electron real, CAD/automação/extensão/scheduler/Git e distribuição Setup/Portable.

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
