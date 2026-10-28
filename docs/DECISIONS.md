# ADRs — decisões com contexto e consequências

## ADR-001 — Núcleo separado de UI (aceita)
**Problema:** mudanças no canvas não podem afetar comportamento de execução.
**Decisão:** `core/` é ES module sem dependência de React/Electron e pode ser testado por `node --test`. O IPC é uma borda de aplicação; o fluxo persiste como JSON.
**Impacto:** facilita migração de componentes de UI, mas requer contratos explícitos.

## ADR-002 — Theia como candidato do IDE completo (aceita como direção, não implementada)
**Problema:** Monaco sozinho não carrega extensões VS Code.
**Decisão:** usar Monaco somente na base mínima; integrar Eclipse Theia e Open VSX em etapa dedicada. Não usar Marketplace Microsoft dentro do nosso produto sem direito de uso.
**Impacto:** maior esforço de integração, menor risco de reimplementar extension host e debugging.

## ADR-003 — Não embutir runtime n8n (aceita)
**Problema:** sua licença de uso sustentável limita incorporação/redistribuição sob certas condições.
**Decisão:** implementar runtime próprio e estudar padrões de interoperabilidade. Node-RED, Apache 2.0, pode ser estudado ou usado por adaptador após revisão de dependências.
**Impacto:** mais trabalho de motor, porém controle total do protocolo de execução.

## ADR-004 — Fluxo sem programação livre na 0.1 (aceita)
**Problema:** executar qualquer linguagem diretamente no processo privilegiado é inseguro.
**Decisão:** criar primeira trilha com nós declarativos reais, depois executar linguagens em workers isolados.
**Impacto:** evita um editor de blocos 'faz de conta' e prioriza segurança por versão.

## ADR-005 — Dados persistem no workspace, app é substituível (aceita)
**Problema:** upgrade não pode destruir cadastros/fluxos.
**Decisão:** artefatos sob `.omniforge/`, fora da pasta binária. Auto-updates não devem apagar essas pastas; migrações versionadas serão adicionadas.
**Impacto:** permite modo instalável e portátil apontando para o mesmo projeto, com cautela contra operações simultâneas.

## ADR-006 — Industrial começa read-only (aceita)
**Problema:** comando automatizado incorreto pode afetar máquinas e pessoas.
**Decisão:** módulos industriais começam em laboratório e somente leitura. Escrita exige isolamento, permissão explícita e processo de segurança.
**Impacto:** os recursos industriais avançados entram por versões e não podem ser habilitados por simples prompt de IA.
