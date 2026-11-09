# OmniForge Studio

## v0.10.0 — desenvolvimento executável, fluxos e CAD de precisão

O Studio agora executa e testa arquivos Node/Python, organiza fluxos com ELK em
worker e trabalha com arcos e blocos DXF estáticos. Cada módulo mantém suas
ferramentas e seu estado de edição. A central **Ferramentas e referências**
registra as 150 fontes pesquisadas, com busca, filtros e estado real de adoção.

- **Desenvolvimento → Executar e testar:** arquivos salvos, argumentos literais,
  verificação de sintaxe, Node test runner, Python unittest, stdout/stderr,
  cancelamento e aprovação nativa da revisão exata.
- **Automações:** organização topológica com cancelar/desfazer, reconexão de
  arestas por arraste e inspetor de portas/conexões.
- **CAD Sketch 2D:** arcos analíticos, edição numérica, paralelas concêntricas,
  DXF com bulges e expansão de blocos estáticos com proveniência.
- **Ambiente → Ferramentas e referências:** 144 repositórios e seis guias;
  oito componentes/ferramentas efetivamente adotados. Recursos futuros aparecem
  como indisponíveis e com seus requisitos de integração.

[Uso e limites da etapa](docs/WORKBENCH_V0100.md) ·
[Mapa completo das 150 fontes](docs/REFERENCE_MAP.md) ·
[Contrato de execução Node/Python](docs/DEVELOPMENT_RUNTIME.md) ·
[Segurança](docs/SECURITY.md) · [Histórico](CHANGELOG.md).

Requer Node/Python locais para as ações correspondentes. Executar código
aprovado usa as permissões da conta. O console é supervisionado, com limite de
120 segundos; terminal interativo, depurador e CAD paramétrico 3D permanecem
planejados. A versão é experimental; publicar depende dos gates da revisão.

## v0.9.0 — criação de projetos e automações de dados

Crie arquivos sem precisar abrir um documento existente, salve com nome e caminho,
gere projetos locais, organize arquivos e utilize 26 novos blocos de dados.
Mantém navegação única, tema grafite/vermelho e módulos independentes.

[36 capacidades e seus testes](docs/FEATURE_MATRIX_V090.md) · [Uso e limites](docs/PROJECT_DATA_SUITE_V090.md) · [Finalidade pessoal](docs/APPROVED_PRODUCT_SCOPE.md).

O menu **Criar** está na barra superior. **Ctrl+N** abre um documento em memória;
**Salvar como** cria o arquivo. **Ctrl+Shift+N** abre os modelos de projeto.
Um documento sem título ainda não é protegido em disco: salve antes de sair.

PapaParse MIT é utilizado de fato para CSV, com versão/hash fixados e licença
incluída. A versão permanece experimental e sem assinatura digital. Os gates
do mesmo commit devem passar antes de integrar/publicar.

### Base de IDE v0.8.2

Abas com buffers e histórico independentes, problemas e estrutura JS/TS, comparação
visual, recuperação por documento e salvamentos explícitos. A v0.10.0 adiciona execução, verificação de sintaxe e testes Python;
servidor LSP e depurador permanecem planejados.

### Base nativa v0.8.0

Segurança nativa centralizada, proteção de gravações, diagnóstico local sem conteúdo dos projetos,
instalação de dependências fixada por lockfile e verificação dos fuses no binário real.
A interface e os formatos da v0.7.9 são preservados. Consulte
[PRODUCTION_FOUNDATION_V080.md](docs/PRODUCTION_FOUNDATION_V080.md) para contratos, testes e pendências antes de declarar estabilidade.

Build local: `npm ci`, `npm run verify:release`, `npm test`, `npm run build`.
Os instaladores Windows são construídos e testados no CI. Nenhuma assinatura digital ou ausência universal de defeitos é prometida.

## Ferramentas consolidadas

**v0.7.9 — autoria de fluxos e recuperação protegida, integradas**

Aplicação desktop local para código, automações supervisionadas e CAD 2D.
Navegação única, tema grafite/vermelho e ferramentas contextuais, sem um dashboard de métricas simuladas.

Esta etapa concilia o histórico de edição, diagnóstico, oito operações de dados e três modelos do PR #36
com a recuperação cifrada do PR #37. Há um único estado de documento: restaurar pode ser desfeito,
salvar não limpa edições mais recentes e um conflito externo não sobrescreve o projeto.

[Integração, evidências e limites](docs/UNIFIED_FLOWS_V079.md) · [Histórico](CHANGELOG.md).
A promoção para release depende dos gates do mesmo commit; a versão permanece experimental.

**Base consolidada v0.8.2:** IDE com abas, buffers independentes, Salvar todos, problemas/estrutura JavaScript e TypeScript e comparação visual. Python continua com edição, sem LSP/DAP nesta etapa. Aprovação depende dos testes da mesma revisão. [Especificação](docs/CODE_WORKSPACE_V082.md) · [Decisões de produto](docs/APPROVED_PRODUCT_SCOPE.md).

Desenvolvedor: **Davi Brand** · Código-fonte: [DragonBlack18/OmniForge-Studio](https://github.com/DragonBlack18/OmniForge-Studio).

## Studio UX

Navegação global única, superfícies neutras com acento vermelho, editor sem cartões repetidos e CAD com árvore de objetos, propriedades, dimensões, transformações, bloqueios e undo/redo. [Decisões visuais, fontes e testes](docs/STUDIO_UX_V077.md).

## Recursos que realmente funcionam

| Módulo | Entrega atual | Observação |
|---|---|---|
| Automação | 57 nós executáveis (inclui 2 blocos CAD), canvas React Flow, 6 templates, validação, executor supervisionado em processo separado, cancelamento e histórico | Gatilho manual; não é o n8n completo |
| Programação | Editor Monaco, arquivos e pastas, busca global, revisão SHA-256 e recuperação local de edições não salvas com confirmação | Não inclui LSP ou depurador; recuperação do CAD tem módulo próprio, sem backup criptografado |
| Controle de versão | Git local real: status, diff, histórico, stage, unstage e commit nativo aprovado | Requer Git no PATH; sem push/pull/reset/merge |
| Executar e testar | Scripts Node/Python reais, sintaxe, testes, saída ao vivo, argumentos literais e cancelamento | Executa somente o arquivo salvo após aprovação da revisão; máximo 120 s |
| Central de Tarefas | Executa scripts reais do package.json com logs ao vivo, cancelamento e histórico local de até 60 resultados por projeto | Node.js/npm instalados; scripts confiáveis somente, sem terminal arbitrário |
| Projetos | Catálogo local e troca de workspace sem copiar ou excluir pastas de origem | Registro no perfil de usuário |
| APIs | GET/POST JSON em 127.0.0.1, contratos JSON tipados, aprovação antes de request | Não expõe conectores arbitrários ou credenciais |
| Agendamentos locais | Intervalos de 1–1440 min, fluxo salvo preso por SHA-256, pausa/retomada, execução real supervisionada, replay de horários perdidos bloqueado, histórico e recuperação após crash | Só executa com a janela do OmniForge aberta; HTTP agendado não permitido |
| Extensões | Hub local declarativo com importação JSON, verificação SHA-256, 10 operações sem código, grants por workspace, revogação e bloco executável de automação | Não instala nem executa VSIX/npm/JavaScript arbitrário |
| Engenharia 2D | CAD em mm, arcos, camadas, transformações, offsets circulares, exportações DXF/SVG e importação DXF com bulges/blocos estáticos | Não é CAD paramétrico 3D |
| Desktop | Electron com isolamento de contexto, IPC restrito, limite de execução (120 s), eventos de progresso, NSIS e portátil Windows x64 | Pré-lançamento; binários sem assinatura digital |

A execução tem timeout global padrão de 120 segundos e botão **Cancelar**. Cancelar impede etapas futuras, mas não desfaz gravações ou requisições externas que já ocorreram. O processo separado reduz travamentos do Electron; **não é sandbox de código arbitrário**.

Não estão implementados: plugins com código de terceiros, IA generativa nativa, agentes, Theia/Open VSX, terminal interativo genérico/depurador, plugins de código não confiável, 3D paramétrico, CAD DWG, robótica, protocolos industriais, gatilhos webhooks externos e automações de e-mail prontas.

## Recuperação da IDE v0.7.3

Ao editar código no Monaco, o OmniForge mantém uma cópia temporária local após aproximadamente 700 ms de inatividade, limitada a 240 KB por arquivo e 40 documentos por perfil. Essa cópia fica no perfil do aplicativo, não no workspace ou no Git. Se a janela perder o estado e você reabrir o mesmo arquivo, poderá **Restaurar no editor**, **Copiar rascunho** ou **Descartar rascunho**. O arquivo original só é alterado pelo comando **Salvar arquivo**. Quando a revisão original mudou externamente, a restauração direta fica bloqueada; o conteúdo pode ser copiado para comparação manual.

Não é um backup criptografado: o código recuperável permanece no perfil local em texto, e mudanças ainda em trânsito no instante de um crash podem ser perdidas. Arquivos típicos de credenciais não recebem checkpoint automático. Detalhes de arquitetura, riscos e critérios: [Recuperação do editor v0.7.3](docs/EDITOR_RECOVERY_V073.md). Teste E2E Electron Windows: `npm run smoke:recovery`.

## Estabilidade da interface v0.7.2

O shell usa uma trava síncrona de execução por sessão, independente do indicador visual de processamento, impedindo duas ações privilegiadas simultâneas disparadas rapidamente. Módulos React carregados sob demanda possuem limites de erro de renderização com reabertura manual, sem reiniciar todo o aplicativo; isso não recupera edições não salvas do componente afetado, nem intercepta crashes completos do Electron.

O teste E2E da IDE exige resposta visível da interface e verificação independente do filesystem e da API local. No Windows, duas execuções isoladas do teste detectam intermitência sem mascarar falhas. Em caso de FAIL, são guardadas evidências sintéticas, sem logs pessoais. A especificação completa e os limites estão em [Stability Foundation v0.7.2](docs/STABILITY_FOUNDATION_V072.md).

## Arquitetura modular v0.6.1

O OmniForge separa o domínio de **automação** (fluxos semelhantes em finalidade às ferramentas de n8n), **IDE** (editor Monaco, busca e Git), **CAD 2D**, **extensões**, **agendamentos**, **integrações** e **workspace** em diretórios de implementação independentes. O shell coordena tudo via contratos, sem que um módulo visual dependa de componentes internos de outro.

Monaco e seus Web Workers, o CAD, o canvas de automações e os painéis especializados são **carregados somente quando necessários**. O CAD permanece montado depois da primeira visita para preservar undo e alterações não salvas. O Electron carrega os serviços Git, CAD e IDE conforme uso. A navegação tem agrupamentos técnicos recolhíveis e mostra a ferramenta ativa no cabeçalho.

Os imports antigos do core são fachadas de reexportação para manter testes, fluxos e integrações existentes. Nenhuma migração, limpeza ou alteração das pastas de dados dos workspaces foi introduzida. O build Vite produz um manifesto com orçamento de bytes para impedir crescimento involuntário do carregamento inicial: `npm run build && npm run budget:bundle`.

**Bytes de bundle não são medições de RAM ou FPS.** Testes de funcionamento e de distribuição continuam indispensáveis. A análise de arquitetura, as dependências autorizadas e o baseline são descritos em [Workbench modular v0.6.1](docs/MODULAR_WORKBENCH_V061.md).

## Interface de trabalho

A barra principal agora agrupa Workspace, Recursos e Acompanhamento. A biblioteca de blocos e o explorador são contextuais e podem ser ocultados; o inspector aparece apenas no canvas de automações. Os controles mantêm seus nomes acessíveis, sem alterar os documentos salvos.

Atalhos: **Ctrl+B** recolhe/expande a navegação, **Ctrl+K** abre a busca de blocos, **Ctrl+Shift+F** busca texto no workspace e **Ctrl+S** salva o fluxo ou o arquivo ativo, quando há alterações. No CAD, **Ctrl+S também salva o desenho**. O atalho nunca abre a janela de salvar a página do navegador.

## Importação DXF 2D (atualizada na v0.10.0)

No CAD Sketch, clique em **Importar DXF**. O arquivo é lido pela janela nativa, sem gravação imediata. A importação suporta LINE, CIRCLE, ARC, LWPOLYLINE com bulges e INSERT estático expandido em primitivas independentes. Converte polegadas/pés/centímetros/metros em mm e exige confirmação quando o DXF não declara unidades. Objetos ou transformações incompatíveis bloqueiam a importação integralmente; não há suporte geral a DWG, sólidos 3D, atributos ou blocos dinâmicos. Após conferir o resultado, clique em **Salvar desenho**.

O importador mantém o histórico anterior do CAD e permite desfazer antes de salvar. Limites de segurança: DXF ASCII/UTF-8 até 2 MB, no máximo 2.000 entidades e 32 camadas. Esta versão não é um leitor universal de DXF/AutoCAD.

Teste isolado com Electron Windows: `npm run smoke:cad-import`. Documentação: [Importação CAD DXF](docs/V0.2.2_DXF_IMPORT.md).

## Central de Extensões v0.3.0

Na sidebar abra **Extensões** e use **Instalar exemplo funcional** para instalar o pacote de engenharia já incluído no código, ou **Instalar arquivo .ofx.json** para importar um manifesto externo. A instalação não executa scripts nem modifica o workspace. Por padrão cada extensão começa desativada. Depois, ative e autorize as permissões desejadas no projeto atual.

O pacote real de exemplo implementa: (1) conversão de `massaKg` para `massaGramas`, com gravação em `.omniforge/output/massa-convertida.json` autorizada separadamente; (2) formatação de etiqueta de ordem, somente em memória. Depois das autorizações, **Adicionar ao fluxo** insere um nó `extension.call` real. A execução usa o motor supervisionado e registra somente metadados no histórico.

Limites: **40 extensões**, 16 ações por pacote, 24 etapas por ação, 128 KB por manifesto/valor, operações puras conhecidas e saída JSON apenas na pasta controlada. A concessão de `workspace.output.write` é por projeto, revogável, e não é concedida automaticamente por instalar ou atualizar. Atualizar um pacote revoga todos os grants anteriores. O hash SHA-256 valida integridade local, **não** autentica a identidade de um editor de extensões.

O formato e suas limitações estão em [Contrato OFX v1](docs/EXTENSION_SDK_V1.md) e no [manifesto executável de exemplo](examples/engenharia.ofx.json). Para executar o E2E Windows: `npm run smoke:extensions`.

## Agendamentos automáticos locais v0.4.0

Na sidebar escolha **Agendamentos**, abra um projeto e salve um fluxo que não dependa de HTTP nem de APIs de outros projetos. Crie um agendamento com intervalo entre 1 e 1440 minutos; ele nasce **PAUSADO**, sem iniciar execução silenciosamente. Para ativar, confirme o diálogo nativo informando os efeitos locais possíveis. O botão **Executar agora** valida a revisão e grava artefatos reais; também é possível cancelar, pausar, aprovar uma nova revisão e excluir a agenda mantendo arquivos e histórico.

O registro persistente fica em `userData/local-schedules/schedules.json`, fora do workspace. Os horários perdidos com o aplicativo fechado ou Windows suspenso são coalescidos, não reproduzidos. A tarefa vincula somente o ID de projeto registrado e a revisão SHA-256 do fluxo salvo: se esse arquivo mudar, o agendamento **é bloqueado e pausado** até aprovação explícita. O motor compartilha uma trava de execução com os comandos manuais, evitando execuções simultâneas.

**Limitação operacional:** este não é um serviço Windows e não funciona com o aplicativo fechado. Não é um sistema de alta disponibilidade/exactly-once, nem oferece agenda cron, timezone arbitrário, HTTP agendado, workflows remotos ou execução de PLC/OT. Um processo pode cair após já ter gravado um arquivo; o OmniForge não consegue reverter efeitos locais anteriores. Veja [Política de recuperação e agendamento](docs/LOCAL_SCHEDULER_V040.md).

Para testar o módulo no Electron Windows: `npm run smoke:schedules`.

## Workspace IDE v0.6.0

O **Editor de código** permite criar arquivos e pastas reais no workspace pela barra lateral. Informe um caminho relativo (por exemplo, src/novo.js); os diretórios pais devem existir. Arquivos são criados exclusivamente, nunca sobrescritos. O salvamento verifica a revisão SHA-256 para proteger edições feitas por outro programa.

Em **Buscar em arquivos**, informe um termo literal (2 a 120 caracteres), marque ou desmarque a distinção de maiúsculas e clique em pesquisar. Cada resultado indica caminho, linha e coluna; clicar abre o Monaco diretamente naquela posição. Pressione **Ctrl+Shift+F** para abrir a busca global.

A busca usa somente arquivos de texto locais: não segue symlinks, ignora .git, .omniforge, dependências, arquivos binários e nomes comuns de segredos. Limites: 1.800 arquivos, 320 KB por arquivo, 12 MB totais, 160 ocorrências e 7 segundos. O resultado indica quando a varredura está incompleta; nenhuma indexação persistente é criada. Não há replace-all, exclusão ou terminal nesta fase.

Teste Electron Windows: `npm run smoke:ide`. Especificação e análise de riscos: [Workspace IDE v0.6.0](docs/V0.6.0_WORKSPACE_IDE.md).

## Central de Tarefas v0.7.0

Acesse **Desenvolvimento → Central de Tarefas** e abra um workspace que contenha um package.json válido na raiz. Com Node.js e npm instalados e disponíveis no PATH, o OmniForge identifica scripts reais (por exemplo test, build ou lint) e mostra a definição exata antes de executar. Nenhum comando livre pode ser enviado pela interface.

Ao clicar em **Executar selecionado**, uma confirmação nativa apresenta o script e alerta para efeitos colaterais. Após aprovação, ele é executado em processo externo, sem bloquear o renderer. A tela mostra stdout/stderr reais, estado, código de saída e botão **Interromper tarefa**. O cancelamento e o timeout tentam interromper a árvore de processos; o limite de execução é 120 segundos e a saída processada está limitada a 96 KB. Os logs completos desta central ficam apenas em memória durante a sessão. **Na v0.7.1, o Histórico de execuções preserva até 60 resultados por projeto** (30 exibidos de cada vez), com nome da tarefa, horário, duração, estado, código de saída e indicação de truncamento. O armazenamento fica em `userData/project-task-history/`, com nome de arquivo derivado de SHA-256 do caminho canônico do projeto. Comandos, stdout/stderr, ambiente e caminho do projeto não são gravados nesses registros. A retenção é circular: ao ultrapassar 60, registros antigos de tarefas deste projeto são substituídos; arquivos do workspace não são alterados. Dados corrompidos ou links simbólicos bloqueiam a gravação, sem reset automático.

A execução usa o npm-cli.js do Node instalado, sem lançar npm.cmd por shell arbitrário, e ignora scripts pre/post implícitos do npm. O arquivo package.json é verificado por SHA-256 antes e depois da confirmação para impedir execução de uma revisão diferente da exibida. Variáveis sensíveis herdadas são filtradas por allowlist, mas **scripts confiáveis ainda podem ler arquivos do usuário, alterar o workspace, instalar dependências ou acessar a internet**. Esta ferramenta não é sandbox, terminal genérico, serviço contínuo ou executor seguro de projetos desconhecidos. O aplicativo impede trocar projetos ou iniciar fluxos enquanto uma tarefa está em execução.

Gate Windows: `npm run smoke:tasks`. Especificações: [Tarefas de projeto v0.7.0](docs/PROJECT_TASKS_V070.md) e [Histórico v0.7.1](docs/PROJECT_TASK_HISTORY_V071.md).

## Git local v0.5.0

Abra um projeto cuja pasta seja a **raiz de um repositório Git existente** e selecione **Controle Git** na sidebar. O painel mostra alterações reais, commits recentes, branch e diffs locais/preparados. Selecione arquivos e use **Preparar** ou **Despreparar**; a segunda operação nunca descarta as alterações no disco. Após preencher a mensagem, **Confirmar commit** abre um diálogo nativo mostrando todos os arquivos já preparados, inclusive por outras ferramentas.

Não executa `git init`, `push`, `pull`, `reset`, `clean`, `checkout`, `merge` ou comandos arbitrários. Os commits locais usam a identidade Git configurada. O processo evita hooks de commit disparados pela interface; filtros de atributos Git existentes devem ser tratados como código confiável antes de preparar arquivos. Nenhum arquivo é adicionado automaticamente. Diferenças são lidas sob demanda e não são persistidas pelo OmniForge; máximo de 400 arquivos no painel, 40 por operação e 120 KB por diff. O commit bloqueia se a contagem ultrapassar 400 alterações, para evitar confirmação com lista incompleta. Teste Electron Windows: `npm run smoke:git`.

## Instalação de desenvolvimento

Use **Node.js 22.12+** e uma pasta de projeto de testes.

```powershell
npm install
npm test
npm run dev
```

Na inicialização, abra um workspace. O motor salva automações em `.omniforge/flows/`, logs em `.omniforge/run-history/` e o CAD em `.omniforge/cad/`. Não exclua essas pastas ao atualizar o aplicativo.

Para testar só o motor:

```powershell
npm run demo:core
```

Para construir Windows (ambiente preparado com as dependências necessárias):

```powershell
npm run dist:win
```

O pacote de release exige sucesso no HEAD exato do PR: testes Node Linux/Windows, build Vite, Electron E2E, workflow real no executável instalado, Portable e Setup/NSIS. **Não publique binários nem faça merge com checks pendentes.**

A integração contínua precisa aprovar testes Node Linux/Windows, build Vite, Electron E2E e abertura/fechamento do portátil e Setup antes de publicar binários em [Releases](https://github.com/DragonBlack18/OmniForge-Studio/releases).

## Estrutura do código

```text
core/modules/            automação, CAD, IDE, extensões, agenda, integrações e workspace
core/host.mjs            serviços nativos carregados conforme o uso
core/*.mjs               fachadas de compatibilidade e supervisor
electron/                janela, ciclo de vida, IPC autorizado, preload
src/App.jsx             pequena entrada estável
src/workbench/           shell, navegação técnica e visão geral
src/shared/              primitivos de UI
src/modules/             automação, IDE, CAD e extensão por domínio
scripts/                demonstração do núcleo e smoke Windows
.github/workflows/      CI, distribuição e publicação dos executáveis
tests/                  testes independentes do renderer
docs/                   decisões, pesquisa open source, segurança e entregas
```

## Documentação

- [Tarefas supervisionadas de projeto v0.7.0](docs/PROJECT_TASKS_V070.md)
- [Arquitetura modular e desempenho v0.6.1](docs/MODULAR_WORKBENCH_V061.md)
- [Workspace IDE v0.6.0 — limites, segurança e validação](docs/V0.6.0_WORKSPACE_IDE.md)
- [Agendamento local — estado persistente, recuperação e limitações](docs/LOCAL_SCHEDULER_V040.md)
- [Central de extensões OFX v1 — contratos, grants, limites e riscos](docs/EXTENSION_SDK_V1.md)
- [CAD Sketch 2D — escopo, segurança e limites](docs/V0.2.0_CAD_SKETCH.md)
- [Importação DXF ASCII 2D — unidades, limites e segurança](docs/V0.2.2_DXF_IMPORT.md)
- [Pesquisa de repositórios abertos, direitos de uso e integrações futuras](docs/OPEN_SOURCE_RESEARCH_2026-10-28.md)
- [Arquitetura por domínios](docs/ARCHITECTURE.md)
- [Modelo de segurança](docs/SECURITY.md)
- [Histórico das entregas](CHANGELOG.md)

## Uso responsável e limitações

- Este repositório é público, mas o projeto ainda tem licença de pacote `UNLICENSED`; isso não é uma licença open source de redistribuição de código próprio.
- Não foram importados/copied os códigos de FreeCAD, LibreCAD, JSCAD, n8n ou Bitbybit. As referências estão documentadas para análise e eventual integração licenciada.
- O aplicativo é **pré-lançamento**, não foi certificado para fabricação ou controle industrial. Uma release compilada não garante instalação ou atualização segura em todas as máquinas.
- A versão portátil não é totalmente isolada do perfil do usuário: o catálogo de projetos segue os dados por usuário do Electron. Os documentos de cada projeto ficam em suas próprias pastas.
