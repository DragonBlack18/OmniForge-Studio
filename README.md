# OmniForge Studio

**v0.6.0 — Workspace IDE** · Plataforma desktop experimental para automação visual, edição de código, integração local de projetos e **CAD Sketch 2D**.

Desenvolvedor: **Davi Brand** · Código-fonte: [DragonBlack18/OmniForge-Studio](https://github.com/DragonBlack18/OmniForge-Studio).

## Recursos que realmente funcionam

| Módulo | Entrega atual | Observação |
|---|---|---|
| Automação | 57 nós executáveis (inclui 2 blocos CAD), canvas React Flow, 6 templates, validação, executor supervisionado em processo separado, cancelamento e histórico | Gatilho manual; não é o n8n completo |
| Programação | Editor Monaco, arquivos e pastas novos, busca global literal com navegação para linha/coluna, proteção contra overwrite | Não é um host Theia/LSP nem terminal/depurador |
| Controle de versão | Git local real: status, diff, histórico, stage, unstage e commit nativo aprovado | Requer Git no PATH; sem push/pull/reset/merge |
| Projetos | Catálogo local e troca de workspace sem copiar ou excluir pastas de origem | Registro no perfil de usuário |
| APIs | GET/POST JSON em 127.0.0.1, contratos JSON tipados, aprovação antes de request | Não expõe conectores arbitrários ou credenciais |
| Agendamentos locais | Intervalos de 1–1440 min, fluxo salvo preso por SHA-256, pausa/retomada, execução real supervisionada, replay de horários perdidos bloqueado, histórico e recuperação após crash | Só executa com a janela do OmniForge aberta; HTTP agendado não permitido |
| Extensões | Hub local declarativo com importação JSON, verificação SHA-256, 10 operações sem código, grants por workspace, revogação e bloco executável de automação | Não instala nem executa VSIX/npm/JavaScript arbitrário |
| Engenharia 2D | CAD Sketch 2D em mm, edição numérica, camadas, exportações DXF/SVG e importação DXF ASCII 2D validada | Não é CAD paramétrico 3D |
| Desktop | Electron com isolamento de contexto, IPC restrito, limite de execução (120 s), eventos de progresso, NSIS e portátil Windows x64 | Pré-lançamento; binários sem assinatura digital |

A execução tem timeout global padrão de 120 segundos e botão **Cancelar**. Cancelar impede etapas futuras, mas não desfaz gravações ou requisições externas que já ocorreram. O processo separado reduz travamentos do Electron; **não é sandbox de código arbitrário**.

Não estão implementados: plugins com código de terceiros, IA generativa nativa, agentes, Theia/Open VSX, terminal/depurador, plugins de código não confiável, 3D paramétrico, CAD DWG, robótica, protocolos industriais, gatilhos webhooks/agendados e automações de e-mail prontas.

## Interface de trabalho

A barra principal agora agrupa Workspace, Recursos e Acompanhamento. A biblioteca de blocos e o explorador são contextuais e podem ser ocultados; o inspector aparece apenas no canvas de automações. Os controles mantêm seus nomes acessíveis, sem alterar os documentos salvos.

Atalhos: **Ctrl+B** recolhe/expande a navegação, **Ctrl+K** abre a busca de blocos, **Ctrl+Shift+F** busca texto no workspace e **Ctrl+S** salva o fluxo ou o arquivo ativo, quando há alterações. No CAD, **Ctrl+S também salva o desenho**. O atalho nunca abre a janela de salvar a página do navegador.

## Importação DXF 2D (v0.2.2)

No CAD Sketch, clique em **Importar DXF**. O arquivo é lido pela janela nativa, sem gravação imediata. A importação suporta LINE, CIRCLE e LWPOLYLINE sem curvas, converte polegadas/pés/centímetros/metros em mm e exige confirmação quando o DXF não declara unidades. Objetos incompatíveis, incluindo arcos, blocos, sólidos 3D e DWG, bloqueiam a importação por completo em vez de desaparecer silenciosamente. Após conferir o resultado, clique em **Salvar desenho**.

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
core/                    modelo de grafos, execução, arquivos, CAD 2D, APIs e projetos
electron/                janela, ciclo de vida, IPC autorizado, preload
src/App.jsx             orquestra workspaces, automações e navegação
src/components/         overview e módulo CAD isolados
scripts/                demonstração do núcleo e smoke Windows
.github/workflows/      CI, distribuição e publicação dos executáveis
tests/                  testes independentes do renderer
docs/                   decisões, pesquisa open source, segurança e entregas
```

## Documentação

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
