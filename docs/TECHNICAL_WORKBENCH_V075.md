# OmniForge Studio v0.7.5 — Workbench técnico e fronteiras de integração

## Intenção do produto

OmniForge é um **software de engenharia local**, não uma coleção de
dashboards. A UI segue a hierarquia operacional:

```text
Electron / Shell
├── Activity rail (domínio do trabalho)
│   ├── Ambiente / workspace
│   ├── Desenvolvimento / IDE, busca, Git, tarefas
│   ├── Automação / fluxos, modelos, integrações, extensões, agenda
│   ├── Engenharia / CAD 2D
│   └── Observabilidade / histórico
├── Navegador técnico (ferramentas reais daquele domínio)
├── Área de edição (Monaco, canvas, CAD ou formulário operacional)
├── Contexto e inspetor (apenas quando o módulo oferece)
└── Barra de estado + comandos globais
```

A tela inicial é uma **superfície operacional** (pontos de entrada para
ferramentas implementadas e contexto da sessão), sem KPIs simulados, widgets
de marketing ou indicadores sem fonte. A definição de módulos é única em
`src/workbench/module-registry.mjs`, usada pela navegação e Home.

## Implementação v0.7.5

- Activity rail compacta, com filtro de domínio deliberado; modo padrão
  mostra todas as ferramentas para preservar navegação e automações de teste.
- Árvores e grupos existentes ainda têm nomes acessíveis e podem recolher;
  o estado de recolhimento preexistente continua local.
- Paleta de comandos `Ctrl+Shift+P` ou `F1` e quick-open
  `Ctrl+P`; `Ctrl+K` continua a buscar blocos da automação.
- `command-registry.mjs` só registra comandos explícitos do software e
  arquivos retornados pelo índice da API do workspace. Busca local,
  acento/case-insensitive, ranking previsível, máximo 35 resultados visíveis.
  Caminhos manipulados no campo de busca **não** são enviados ao IPC.
- Abrir arquivo passa pela rotina já existente (revisão, recuperação e
  confirmação se a edição anterior estiver suja). A paleta **não** executa
  scripts, shell, plugins ou tarefas em segundo plano.
- A paleta é um chunk dinâmico; não precisa carregar no boot. Componentes
  SVG locais são memorizados. Opções de Monaco são objetos estáveis, com
  minimap/wrap desligados para documentos com 180.000+ caracteres, sem
  modificar o conteúdo, o formato ou o salvamento.
- Nenhuma migração, gravação, alteração de schema ou operação destrutiva.

## Performance: medição antes de prometer

A orientação de performance do Electron é medir **processo real**, não
concluir RAM/FPS a partir dos bytes do bundle:
https://www.electronjs.org/docs/latest/tutorial/performance

**Gates existentes:** `budget:bundle` mede JS/CSS inicial pelo manifesto
de build Vite, exclui imports dinâmicos e exige Monaco/CAD/FlowCanvas sob
demanda. O limite existente continua JS inicial <= 1.900.000 bytes,
CSS inicial <= 300.000 bytes. Não aumentar o limite sem uma análise escrita.

**Gates adicionados:** testes puros de busca, limites, rotas e modos de
editor; E2E Electron Windows da hierarquia, comandos, abertura de arquivo
real, persistência de preferência, não alteração do arquivo e screenshot.
Repetir também todas as regressões existentes e teste de Setup/Portable.

**Próxima otimização estrutural proposta:** `AppShell.jsx` ainda importa
`@xyflow/react` para manter os hooks de estado mesmo fora da automação.
Extrair o estado e os eventos do fluxo para um provedor próprio carregado
apenas ao entrar em Automação exige tratamento explícito de dirty-state,
execuções, mudança de workspace, agendamentos, perda de buffer e undo; não
fazer essa migração silenciosamente na v0.7.5. Medir o bundle antes/depois
e a latência cold start em hardware Windows antes de aceitá-la.

## Referências open source: decisões de integração

| Projeto | Uso permitido nesta versão | Modelo de adoção futura |
|---|---|---|
| Code - OSS (MIT): https://github.com/microsoft/vscode | Referência de workbench, barra de atividade, paleta e painéis. **Nenhum código copiado.** | LSP/debug via adaptador, sem distribuir produto Microsoft VS Code. |
| Eclipse Theia (EPL-2.0 / secondary): https://github.com/eclipse-theia/theia | Referência de extensibilidade e contratos. **Não embarcado.** | Avaliação de composição separada, licença, footprint e compatibilidade com Electron existente. |
| Lucide (ISC): https://github.com/lucide-icons/lucide | Referência de consistência visual; ícones SVG OmniForge originais ainda embarcados. | Ícones por imports específicos, com revisão de bundle e NOTICE de licença. |
| FreeCAD (LGPL-2+): https://github.com/FreeCAD/FreeCAD | Referência para CAD paramétrico, não inclusa nesta release. | Interoperabilidade por arquivo ou worker/processo isolado com atribuições e obrigações LGPL verificadas. |
| n8n (Sustainable Use License): https://github.com/n8n-io/n8n | Referência conceitual para UX de fluxos. **Não copiar ou incorporar engine, nós ou código.** | Para produto comercial/distribuído, obter autorização/licença apropriada antes de qualquer integração embarcada. |

O repositório OmniForge declara atualmente `UNLICENSED`; **código
disponível na internet não implica autorização para copiar**. Licenças
são avaliadas antes do pull/instalação de cada componente. Nenhum
repositorio inteiro deve ser mesclado à árvore `src` ou `core`.

## Contratos de futura integração

1. **Manifesto versionado**: id, versão, licença/SPDX, origem/commit,
   capacidades, permissões, dados manipulados, limites de CPU/memória
   e formato de entrada/saída.
2. **Isolamento**: processo/worker ou adaptador específico; módulos
   `core/modules/automation`, `ide`, `cad` permanecem independentes.
   Nunca conceder acesso direto ao sistema pelo renderer.
3. **Compatibilidade**: adapters traduzem operações; nunca importar
   um `AppShell` de terceiros dentro do OmniForge.
4. **Operação segura**: consentimento para side effects, quotas, timeout,
   cancelamento, validação de caminhos, IPC allowlisted e logs redigidos.
5. **Entrega por gate**: testes em Linux + Windows, E2E de dados reais,
   orçamento de bundle, regressão CAD/IDE/fluxos, instalação e remoção
   NSIS/Portable, hashes de binários, benchmark comparativo.

## Próximas versões (propostas, não entregues)

- **v0.7.6**: medir inicialização fria/RAM; separar o estado do React Flow
  da Home, com recuperação do fluxo e regressões documentadas.
- **v0.7.7**: layout redimensionável com persistência versionada e reset
  seletivo, sem sobrepor views ou perder edição não salva.
- **v0.8.x**: LSP/depuração e ferramentas IDE por adaptação explícita.
- **v0.9.x**: conectores com sandbox e schemas sem copiar código n8n.
- **futura**: CAD paramétrico interoperável, mediante análise legal e
  isolamento de kernel; nenhuma promessa de suporte DWG/3D nesta versão.

**Aceite**: pacote Windows Setup/Portable passa testes reais no mesmo
commit, CI verde, dependências inalteradas e dados existentes preservados.
Software continua experimental, sem garantia de ausência de bugs.
