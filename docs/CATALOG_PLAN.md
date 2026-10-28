# Catálogo universal — taxonomia proposta (não implementada)

O objetivo não é instalar milhares de dependências junto do executável. Cada categoria usa pacotes de nós separados, ativados sob demanda e geridos por manifesto de versão, licença, permissão e testes. Somente três nós constam como funcionais na v0.1.

## Catálogo v0.1 — realmente implementado

| ID | Contrato | Efeito | Requer permissão |
|---|---|---|---|
| `trigger.manual` | JSON de configuração → saída JSON | Início manual, sem serviço externo | Não |
| `logic.pick` | Entrada JSON + caminho → saída JSON | Seleção determinística de campo | Não |
| `io.writeJson` | Entrada JSON + nome simples → saída JSON | Cria arquivo em `.omniforge/output/` | Abertura de workspace + comando executar |

## Famílias futuras

### A. Controle de fluxo e lógica

- Triggers: manual, cron, timer, filesystem watcher, webhook, filas, Git events, mudanças de dados.
- Operadores: `if`, `switch`, `match`, `compare`, `and`, `or`, `not`, filtros, operações por janelas, map/reduce, merge, deduplicação, debounce, throttle.
- Orquestração: join/split, branching, waits, barriers, checkpoints, retries, timeout, compensação, aprovação humana, rollback explícito.
- Tipos: bool, integer, decimal, text, datetime, binary, struct, array, unit-value, model-reference, signal stream.

### B. Dados, arquivos e linguagens

- Dados: JSONPath, JSON Schema, XML, YAML, CSV, Excel, Parquet, Avro, protobuf, base64, hash, assinatura, compactação.
- Storage: SQLite, PostgreSQL, MySQL, SQL Server, MongoDB, Redis, S3, file-system.
- Languages: JavaScript/TypeScript, Python, Go, Rust, Java, C/C++, C#, PHP, Ruby, Lua, PowerShell, Bash; cada linguagem exige runtime instalado, contrato de versão, limites e ambiente isolado. Não existe execução universal sem os respectivos toolchains.
- Dev: compilação, linter, formatter, testes, coverage, profiling, pacote, versão, commit, revisão Git, PR, release.

### C. Aplicações e conectividade

- HTTP(S), GraphQL, gRPC, WebSocket, TCP/UDP autenticados e com políticas, SMTP/IMAP, MQTT, AMQP, Kafka, filas, Redis Streams.
- Provedores: GitHub, GitLab, Slack, Teams, Gmail, Outlook, ERP/CRM por APIs oficiais, pagamentos, bancos de dados, webhooks.
- IA: provedores de LLM, modelos locais, embeddings, reranking, OCR, visão computacional, TTS/STT, agentes, ferramentas MCP autorizadas, avaliação automática, tracing, custos, limites.

### D. Eletricidade, sinais e automação industrial

- Lógica digital: entradas/saídas, relés, temporizadores, contadores, flip-flops, portas, estados, memória, modos de falha.
- Analógico: voltagem, corrente, frequência, temperatura, pressão, escala 4–20 mA, 0–10 V, filtros digitais, PID simulado, calibração, transformação de unidades, amostragem e alarmes.
- Protocolos: OPC UA, Modbus RTU/TCP, MQTT industrial, Profinet/EtherNet/IP apenas mediante stacks/integrações adequadas, RS-232/RS-485, CAN bus conforme suporte.
- Topologia: gateway, sensor, atuador, PLC, drive, conversor, roteador, switch, HMI, supervisório, banco de históricos.
- Primeiros módulos somente de leitura e simulação; atuação real exigirá autorização e engenharia de segurança funcional.

### E. CAD, mecânica e robótica

- Geometria: sketch, linha, arco, spline, extrusion, revolution, loft, fillet, boolean, hole, surface, chamfer.
- Mecânica: material, densidade, massa, inércia, tolerâncias, juntas, restrições, montagem, interferência, fabricação.
- Robótica: links, joints, cinemática direta/inversa, trajetórias, servos, limites de torque, motores, sensores, URDF e controle por simulador.
- Renderização e arquivo: viewport 3D, STL, STEP, glTF, OBJ, DXF onde suportado, cenas e desenhos técnicos.
- Engenharia documental: BOM, lista de sinais, diagrama P&ID, esquema elétrico, intertravamentos, relatórios e evidências de validação.

### F. Arquitetura de sistemas

- Entidades: módulo, pacote, API, serviço, banco, dependência, evento, ambiente, CI, segredo, política, usuário, contrato.
- Análises: dependências circulares, contratos divergentes, acoplamento, propagação de mudança, conectividade, superfície de ataque, risco de indisponibilidade, orçamento de latência.
- Evidências: vínculos com testes, cobertura, revisão humana, resultado de execução, logs, SLA/SLO e impacto de mudanças.

## Como um bloco se torna oficial

A categoria não basta. Para cada plugin exigimos versionamento, docs, schemas, fixtures, teste com dependência real quando possível, timeout, repetibilidade, permissões, revogação, telemetria sem segredos e regra de migração. Dispositivos industriais só com laboratório, isolamento e aprovação específica.
