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
- Nova tela inicial com visão dos módulos realmente operacionais e dos recursos ainda planejados.
- Revisão do design visual e da hierarquia da interface, mantendo a identidade OmniForge.
- Corrigido diagnóstico `partialSimulation` em ramificações Se/Senão reais, com testes de regressão.
- Pesquisa e decisões de licença para Theia, FreeCAD, LibreCAD, JSCAD, Bitbybit e kernels geométricos.
- Gating necessário antes de release: Node tests, build React/Vite, E2E Electron Windows, testes do portátil e NSIS.
