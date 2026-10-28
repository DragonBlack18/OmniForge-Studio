# OmniForge Studio

**Versão de fundação 0.1.1 — nome de trabalho, ainda não validado como marca.**

Ambiente desktop experimental para conectar editor de código, projeto local e automações por blocos. **Esta versão não é um substituto funcional do VS Code, do n8n nem do AutoCAD.** Ela entrega o primeiro fluxo verificável da arquitetura, e fixa contratos para expandir sem reescrever o núcleo.

## O que já está implementado

- Janela desktop Electron com separação entre processo principal e renderer, `contextIsolation`, sandbox e IPC de operações autorizadas.
- Canvas de blocos com React Flow e conexões direcionadas; catálogo real de três tipos.
- Editor Monaco para ler e alterar arquivos de texto existentes em um diretório escolhido.
- `trigger.manual` → `logic.pick` → `io.writeJson`: recebe um JSON, seleciona um campo e grava o resultado em `.omniforge/output/venda.json`.
- Validador estrutural: nós desconhecidos, portas incompatíveis, nós desconectados, ciclos, configurações inválidas e múltiplas conexões na mesma entrada.
- `Simular` executa as mesmas transformações, mas não persiste o arquivo de saída.
- Persistência manual do fluxo em `.omniforge/flows/principal.json`, escrita em arquivo temporário e renomeação.
- Explorador limitado ao workspace selecionado (sem links simbólicos, sem pastas técnicas, sem abrir arquivos acima de 1 MB), com rejeição de arquivos UTF-8 inválidos e bloqueio de sobrescrita após alteração externa.
- Painel de diagnóstico por nó, página de créditos e configuração para gerar instalador e versão portátil Windows.

## Limitações importantes

1. **Não há compatibilidade com extensões VS Code nesta versão.** Monaco não é um extension host. O projeto prevê introduzir Theia/Open VSX após estabilizar os contratos do núcleo.
2. **Não há execução arbitrária de Python, C++, Java, PowerShell ou JavaScript.** O mecanismo seguro de workers isolados será uma etapa específica, com permissões e testes.
3. **Não há IA real, SMTP, PLC, OPC UA, MQTT ou CAD nesta primeira versão.** Nenhum desses módulos aparece como botão funcional.
4. **O validador não prova ausência de bugs.** Confirma propriedades estruturais dos fluxos que entende; testes externos e efeitos colaterais ainda exigem validação real.
5. **O processo gráfico e o instalador não foram executados neste ambiente de entrega**, pois o download das dependências npm não estava acessível. Foram realizados testes do núcleo Node e verificações sintáticas do processo principal. Não considere a versão pronta para produção.
6. O gerenciador de arquivos é intencionalmente conservador. A lista limita até 160 entradas com profundidade máxima de 5 pastas.

## Executar no Windows

Pré-requisitos: **Node.js 22.12+**, npm, Git opcional e acesso à internet na primeira instalação. Os binários Electron serão baixados pelo npm.

No PowerShell (abra o terminal na pasta onde está o `package.json`):

```powershell
npm install
npm test
npm run demo:core
npm run dev
```

O fluxo inicial aparece no canvas. Clique em **Abrir projeto** e escolha uma pasta de testes **sem arquivos importantes**. Clique em **Validar**, **Simular** e depois **Executar**. Confira o resultado em `PASTA_ESCOLHIDA\.omniforge\output\venda.json`.

**Por segurança, a gravação de arquivos é restrita ao workspace selecionado e a saída de nós vai apenas para a pasta `.omniforge/output/`.** O editor pode alterar arquivos existentes no workspace se você clicar explicitamente em **Salvar arquivo**.

Para alterar o fluxo: selecione cada bloco no canvas e modifique as configurações no inspetor à direita. Para adicionar um bloco, use a barra lateral; conecte a porta de saída à porta de entrada. Um bloco desconectado bloqueia a execução.

## Gerar instalador e versão portátil

No Windows, após os testes:

```powershell
npm run dist:win
```

Saídas esperadas: arquivos `.exe` em `release/`, sendo um instalador NSIS e outro pacote portátil. **Ainda não há binários criados ou assinados**, pois o empacotamento Windows não foi validado neste ambiente. Aplicativos sem assinatura podem receber avisos do SmartScreen.

O alvo `portable` significa que não precisa instalar, **não** que seja totalmente independente de persistência: o app ainda usa preferências do Electron; os fluxos continuam associados às pastas escolhidas. Política de dados portáteis será definida em etapa futura.

## Publicar no GitHub

O conteúdo foi preparado para um repositório exclusivo, sem misturar projetos já existentes. A conexão GitHub disponível nesta sessão não oferece ação de **criar novo repositório**. Por isso **nenhum push remoto, PR ou release foi realizado**.

1. Crie um repositório privado vazio (exemplo: `DragonBlack18/omniforge-studio`) no GitHub.
2. Extraia este pacote em uma pasta local; execute o `npm test`.
3. No terminal da pasta, siga os comandos abaixo:

```powershell
git init -b main
git add .
git commit -m "feat: foundation 0.1.1 - graph engine and desktop shell"
git remote add origin https://github.com/DragonBlack18/omniforge-studio.git
git push -u origin main
git checkout -b develop
git push -u origin develop
```

Crie o repositório com **esse nome** para poder usar a URL literalmente; caso prefira outro, altere a URL no comando. Nenhum projeto seu existente será modificado.

O comando `npm run demo:core` executa o núcleo de verdade em uma pasta temporária e grava um arquivo JSON mesmo sem as dependências gráficas; para executá-lo isoladamente, basta `node scripts/demo-core.mjs`.

Ações automatizadas ficam em `.github/workflows/`: testes do núcleo no Linux/Windows, tentativa de build do frontend, e empacotamento Windows acionado manualmente ou por tag. Os workflows precisam ser observados no GitHub após o primeiro push. Idealmente gere e versione `package-lock.json` no primeiro `npm install` bem-sucedido e substitua `npm install` por `npm ci` nos workflows.

## Organização

```text
omniforge-studio/
├── core/                   # catálogo, grafo, execução e persistência
├── electron/               # janela, IPC, protocolo customizado
├── src/                    # canvas, editor, explorador, inspetor
├── tests/                  # testes integrados do núcleo Node
├── docs/                   # especificação, segurança, decisões e etapas
├── .github/workflows/      # automação de teste e build
├── package.json
└── vite.config.js
```

## Referências técnicas e de licença

- Eclipse Theia: https://theia-ide.org/docs/extensions/
- Open VSX: https://open-vsx.org/
- React Flow: https://reactflow.dev/
- Electron: https://www.electronjs.org/docs/latest/tutorial/security/
- n8n licença: https://support.n8n.io/article/can-i-use-your-license-for-my-use-case
- Node-RED licença: https://nodered.org/about/license/
- Monaco: https://github.com/microsoft/monaco-editor
- Open CASCADE: https://github.com/Open-Cascade-SAS/OCCT

**Desenvolvedor:** Davi Brand. © 2026. Licenciamento do código próprio ainda a definir; dependências de terceiros conservam suas licenças. Não utilizar nomes, marcas e extensões proprietárias sem revisar os respectivos termos.


## Novidades da v0.1.1 — segurança do fluxo e teste desktop

- **Revisão otimista do fluxo**: `readFlowDocument()` fornece SHA-256 do documento aberto; `saveFlow(flow, revision)` impede sobrescrita silenciosa se outro processo modificou o fluxo.
- **Recuperação**: antes de substituir um fluxo salvo, a versão anterior é preservada em `.omniforge/flow-history/<sha256>.json` (somente dentro do projeto escolhido).
- **Alterações pendentes**: indicador de fluxo modificado, confirmação ao trocar de workspace e bloqueio antes de fechar a janela; o fluxo de demonstração recém-aberto pode ser salvo.
- **Proteção contra execução simultânea**: IPC aceita apenas uma execução e uma gravação de fluxo por vez no processo desktop.
- **Smoke Windows**: `npm run smoke:electron` abre a interface de produção, abre um projeto temporário com diálogo nativo interceptado, salva, simula, executa, lê um arquivo, reinicia e valida persistência. O script **não** usa dados fictícios para comprovar execução do motor.
- **CI**: matriz Node Linux/Windows + build Vite + gate Electron real no `windows-latest`, antes dos artefatos de instalador e portátil.

### Critérios de entrega

`npm test` roda testes de motor e armazenamento sem instalar dependências de interface. `npm install`, `npm run build`, `npm run smoke:electron` e `npm run dist:win` exigem rede, npm e ambiente Windows; o pacote só é classificado como validado quando a execução do GitHub Actions terminar em sucesso. A geração dos binários não os assina digitalmente.

**Importante:** esta etapa ainda não implementa integração HTTP, envio de e-mail, Theia, extensões do VS Code, inteligência artificial ou CAD. Essas capacidades permanecem no roadmap e não aparecem como botões funcionais.
