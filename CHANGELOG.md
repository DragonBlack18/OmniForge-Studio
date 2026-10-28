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
