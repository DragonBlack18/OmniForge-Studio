# OmniForge Studio v0.7.2 — Stability Foundation

## Missão
Estabelecer princípios verificáveis de confiabilidade sem alterar os schemas de fluxo,
CAD, extensão, Git, projetos ou histórico. Esta versão **não** declara o OmniForge
pronto para produção industrial ou livre de falhas.

## Fontes técnicas
- Electron Security Checklist: https://www.electronjs.org/docs/latest/tutorial/security
- Electron Performance: https://www.electronjs.org/docs/latest/tutorial/performance
- Playwright Best Practices: https://playwright.dev/docs/best-practices
- Playwright Auto-waiting: https://playwright.dev/docs/actionability
- Node.js child_process: https://nodejs.org/api/child_process.html

## Implementações

### 1. Trava síncrona de operações da interface
O estado React `busy` apenas atualiza a UI; não evita dois eventos no mesmo
ciclo de renderização. O helper puro `src/utils/operation-gate.mjs` concede no
máximo uma execução ativa, recusa a concorrente sem enfileirar, e libera
no `finally`, inclusive após falha. O `AppShell` continua exibindo o
estado `busy`, mas as operações privilegiadas coordenadas pela função
`execute` são protegidas pelo gate.

**Escopo:** não se aplica aos comandos de cancelamento, que devem permanecer
acessíveis durante uma execução. Os IPCs permanecem a autoridade final sobre
autorizações e mutex de operações do backend.

### 2. Isolamento de falha da interface
O `ModuleErrorBoundary` do React circunda ferramentas lazily-loaded
(CAD, canvas, editor Monaco, Git, tarefas, busca, extensões e agenda).
Se um módulo falhar durante renderização/montagem/importação, o shell e a
navegação ainda podem renderizar; a interface não tenta reiniciar
automaticamente e alerta sobre dados não salvos.

**Limites:** boundaries não capturam falhas em eventos, Promises, chamadas IPC
ou crashes completos do processo Chromium. Não há garantia de preservar
alterações em memória do módulo que falhou. A prioridade é impedir que o erro
contamine o restante do renderer, sem destruir documentos no disco.

### 3. Smoke E2E da IDE com dupla observação
O teste aguarda confirmação visível e dados reais por operações independentes:
disco no processo Node e listagem do workspace pelo IPC da janela. O
salvamento no Monaco também é conferido no disco. O CI Windows executa
duas sessões consecutivas, cada qual com workspace e perfil temporários.
Um FAIL não é mascarado com retry do mesmo teste.

Em caso de falha, o teste salva `smoke-artifacts/ide-failure.json` com
nome da suíte, fase e classe da exceção, além de screenshot do workspace
**sintético do E2E**. Não são gravados arquivos privados do usuário, segredos,
saídas de scripts nem variáveis de ambiente. Em produção não há captura
automática de tela. O CI disponibiliza artefatos somente nos jobs com falha.

## Gate de aceitação obrigatório
- [ ] `npm test` PASS Linux/Windows, inclusive testes de exclusão mútua e
  liberação do lock após falha.
- [ ] Build Vite e orçamento de startup do `budget:bundle` PASS.
- [ ] `smoke:electron`, `smoke:tasks`, `smoke:ide` duas vezes, Git,
  extensões, agendamentos e CAD/DXF PASS no Windows.
- [ ] Empacotamento e smoke Portable + Setup/NSIS PASS.
- [ ] Hash SHA-256, documentação e referências à revisão aprovada.
- [ ] Nunca misturar dados de teste com o perfil real. Sem migração/reset.

### Próximas frentes, não incluídas nesta versão
Métricas de latência/RAM por módulo e baselines no hardware real; recuperação
após crash total do renderer; journal de operações pendentes; watchdog de
workers; otimização do AppShell por domínios e integração futura de LSP,
Theia e depuração. Essas mudanças exigem provas específicas, não somente
indicadores visuais.
