# Plano de implementação incremental — versões e gates

A tabela histórica abaixo foi redigida na fundação do projeto; seus números de marcos representam propostas iniciais, não versões efetivamente publicadas. O estado real evoluiu para v0.5.0 (Git local) e v0.6.0 (Workspace IDE). A ordem protege o núcleo funcional contra regressões; nada entra como botão ativo sem operação real e testes.

| Marco | Escopo verificável | Gate de aceite |
|---|---|---|
| **0.1 Fundação (entrega atual)** | Electron básico, canvas de três blocos, validação DAG, simulação, escrita real JSON no workspace, Monaco mínimo, créditos | Testes Node + smoke Electron no Windows (pendente) |
| **0.1.1 Estabilidade desktop** | Smoke Electron real no CI, revisão de fluxo para evitar sobrescritas, proteção contra execuções simultâneas, pacote portátil e instalador NSIS | E2E Windows e reabertura sem perda de dados |
| **0.1.2 Persistência** | Dirty-state de fluxo, histórico de alterações, snapshots de recuperação e logs de execução persistentes | Recuperação após encerramento forçado e migração |
| **0.2 Motor v2** | Contratos de tipos, caminhos de dados tipados, nós condicionais, JSON schema, correlação de execuções | Testes de ramificação, rejeição de incompatibilidades, replay |
| **0.3 Integração HTTP** | Cliente HTTP real, allowlist de destinos, políticas de timeout, retries, segredo seguro | Servidor local de teste e testes de SSRF/retry |
| **0.4 E-mail e eventos** | SMTP autenticado, webhook local seguro, templates, idempotência e trilha de auditoria | Venda → e-mail em provedor sandbox → confirmação e deduplicação |
| **0.5 Workspaces múltiplos** | Registro de projetos externos e contratos API, importações sem cópia destrutiva | Dois projetos isolados conectados por fluxo e testes de falha |
| **0.6 IDE e extensões** | Host Theia, Open VSX, LSP, debugging, Git e tarefas | Instalar/desinstalar extensão compatível, abrir linguagem, debug real |
| **0.7 Execução de código** | Workers isolados JS, Python e PowerShell com permissões específicas e limites | Host seguro não trava, timeout, kill, isolamento, logs |
| **0.8 IA/Agentes** | Provedores configuráveis, ferramentas aprovadas, limites de custo, avaliação de respostas | IA aciona somente ferramentas autorizadas, testes de prompt injection |
| **0.9 Automação industrial (somente leitura)** | MQTT, OPC UA/Modbus em laboratório, tipagem de sinais e unidades | Leituras reais/replay, rede isolada, sem capacidade de escrita |
| **1.0 Plataforma inicial estável** | Documentação, compatibilidade, editor/fluxos, distribuição Windows, recuperação e suporte | Matriz de aceitação de usuário e release assinado |
| **1.1 Arquitetura semântica** | Grafo de serviços, dependências, impactos, links com testes e código | Mudança de contrato aponta testes afetados; não promete ausência de bugs |
| **1.2 CAD visual** | Modelagem 3D, dimensões, formatos neutros e integração kernel | Abrir/salvar modelo e exportar geometria reproduzível |
| **1.3 Robótica e gêmeo digital** | Componentes parametrizados, cinemática e simulação física básica | Modelo testado em simulador externo e tolerâncias reportadas |

## Estado atual e próximas integrações

| Versão efetiva | Entrega real | Próximo gate |
|---|---|---|
| v0.5.0 | Git local, stage, diff e commit com aprovação | Publicada e integrada |
| v0.6.0 | Busca global literal no workspace e criação de arquivos/pastas com Monaco | Validada e publicada |
| v0.6.1 | Separação física dos domínios, lazy-load de Monaco/CAD/Canvas e limite de bundle | Publicada |
| v0.7.0 | Central real de tarefas npm com consentimento, logs, cancelamento e quotas | CI, E2E Electron e NSIS/Portable aprovados | 
| v0.7.1 | Histórico persistente por workspace com metadados e retenção limitada, sem guardar stdout | CI Linux/Windows, smoke Electron, distribuição NSIS/Portable |
| Proposta v0.7.x | Gerenciamento seguro de tarefas de desenvolvimento e terminal isolado | Quotas, consentimento, cancelamento, processo filho, ameaças |
| Proposta v0.8.x | Integração Theia/LSP/depuração via adaptador | Isolamento, licenças, end-to-end |
| Proposta v0.9.x | Gatilhos de eventos mais amplos, retenção e monitoramento de fluxos | Idempotência, replay, side effects, recovering |
| Proposta futura | IA, CAD 3D e conectores industriais read-only | Contratos, integração real e segurança dedicados |

Não afirmar completude ou produção industrial antes dos gates específicos de cada domínio.

## Ordem de prioridade

1. Segurança de dados, estabilidade, casos reais, execução previsível.
2. Expansão de catálogo somente com contratos e testes.
3. Integração AI/CAD/industrial como módulos desacoplados.
4. Workflows reais não compartilham credenciais entre projetos sem controle.

## Gate para aceitar qualquer nó novo

- [ ] Manifesto versionado com entradas, saídas e tipos.
- [ ] Executor explícito, sem `eval` no processo principal.
- [ ] Validação de parâmetros e erros compreensíveis.
- [ ] Teste de sucesso real (não somente mock).
- [ ] Teste de falha, timeout e repetição onde aplicável.
- [ ] Declaração de capabilities e riscos.
- [ ] Sem vazamento de credenciais em logs.
- [ ] Compatível com save/load e versão de schema.
- [ ] Exemplo e evidências de CI.
