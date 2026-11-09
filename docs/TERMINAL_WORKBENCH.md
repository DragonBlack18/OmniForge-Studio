# Terminal interativo — v0.11.0

O módulo conecta **xterm.js 6.0.0**, **addon-fit 0.11.0** e **node-pty
1.1.0** a um processo utilitário Electron. É um terminal real: programas
recebem um PTY, entrada interativa, dimensões da tela e sinais de interrupção.
Não é uma simulação de shell nem o console limitado das tarefas npm.

## Uso

1. Abra um projeto e selecione **Terminal**, em Desenvolvimento.
2. Escolha um ambiente do sistema e clique em **Abrir terminal**.
3. Confira workspace e shell no diálogo nativo. Cancelar é a opção padrão.
4. Digite comandos normalmente. Ctrl+C ou **Interromper comando** envia a
   interrupção ao programa em primeiro plano; não fecha a sessão inteira.
5. Selecione texto com o mouse e use **Copiar seleção**. **Limpar tela** limpa
   a exibição; não desfaz comandos nem apaga arquivos.
6. **Encerrar** pede confirmação e encerra a sessão e sua árvore normal de
   processos. Fechar o aplicativo usa o coordenador nativo de encerramento.

Windows usa Windows PowerShell, sem perfil, ou Prompt de Comando com AutoRun
desativado. POSIX usa Bash sem arquivos de perfil/rc ou `/bin/sh` interativo.
Os caminhos são resolvidos pelo host em locais conhecidos do sistema; não
há um campo para fornecer um launcher, comando inicial ou ambiente arbitrário
na abertura. A partir da sessão aprovada, a entrada do usuário é interativa
e pode conter comandos de shell reais.

## Edição e execução simultâneas

Existe uma sessão por workspace ativo. A preparação e o consentimento usam
o mutex nativo; depois da abertura, a sessão **não mantém um bloqueio de
gravação**. É possível editar/salvar arquivos, usar tarefas npm e executar
outras ferramentas enquanto o shell está aberto. Cada gravação do editor
continua conferindo a revisão esperada, mas comandos do shell podem modificar
arquivos externamente. Não há transação global entre programas independentes.

A troca de workspace exige encerrar a sessão. Mudar de módulo mantém o xterm
montado, sua tela e o PTY ativos; o painel oculto continua consumindo saída.
Não há restauração automática de um shell depois de fechar/reiniciar o app.

## Arquitetura e IPC

| Camada | Responsabilidade |
|---|---|
| `TerminalWorkbench.jsx` | Tela xterm, teclado, resize, seleção, confirmação editorial e ACK após o parser consumir a saída |
| `terminal-ipc.cjs` | Origem IPC do host, consentimento nativo, workspace fixado, rechecagem de shell e cancelamento pendente |
| `terminal-contract.mjs` | Shells permitidos, argumentos fixos, ambiente filtrado, limites de dimensões/entrada |
| `terminal-session.mjs` | Handshake ready/start, processo utilitário, estado, buffer de sessão, ACK e fechamento |
| `terminal-worker.cjs` | Addon node-pty, PTY, controle de fluxo, resize, encerramento de processos e heartbeat |

O preload expõe métodos nomeados: disponibilidade, estado, abertura,
attach/detach, entrada, resize, ACK e fechamento. Toda ação da sessão exige
seu identificador e o mesmo workspace. O renderer não recebe `child_process`,
`node-pty`, handles do sistema ou APIs genéricas de `ipcRenderer`.

O addon nativo é carregado apenas no processo utilitário, fora do renderer
e do processo principal. Não é hospedado por `worker_threads`. O host aguarda
o handshake antes de enviar o plano; erro de importação, crash anterior ao
handshake e timeout aparecem como falha real de inicialização.

O cancelamento durante descoberta, confirmação ou carregamento invalida a
tentativa. Uma aprovação tardia não inicia o PTY. O fechamento espera o fim
do worker; ausência de confirmação no prazo aparece como falha, inclusive
quando o host precisa solicitar término forçado.

## Fluxo, entrada e retenção

- A entrada é limitada a 16 KB por mensagem e 128 KB por segundo no host.
  A fila de teclado/colar do renderer também é limitada a 128 KB. Chunks
  preservam pares Unicode, espaços e sequências de controle.
- Saída usa chunks de até 4096 caracteres. O worker pausa o PTY ao atingir
  128 KB pendentes e retoma abaixo de 32 KB, após ACK do parser xterm.
  Um estouro excepcional de 1 MB pendente encerra a sessão com erro.
- O xterm mantém até 2000 linhas de scrollback. O host guarda até 128 mil
  caracteres para reanexar a mesma sessão; informa quando essa cauda foi
  truncada. O replay limitado não promete reconstruir uma aplicação de tela
  inteira que deixou de ser consumida por um renderer anterior.
- Dimensões aceitas: 20–500 colunas e 5–200 linhas. Resize da interface altera
  também o PTY; não é apenas zoom visual.
- A aplicação não grava transcript ou comandos no diagnóstico. Histórico
  de shell, arquivos de programas e efeitos dos comandos seguem o comportamento
  dos próprios programas e podem ser persistidos por eles.

O terminal interativo não herda o timeout de 120 segundos dos runners de
desenvolvimento. A sessão permanece aberta até o shell sair, ocorrer uma
falha, o usuário encerrá-la ou o aplicativo fechar. O worker monitora a
conexão com o host; perda prolongada de heartbeat solicita encerramento.

## Fronteiras e limitações

**PTY e processo separado não são sandbox.** O shell e os comandos mantêm
as permissões da conta, podem ler/gravar/apagar arquivos e acessar a rede.
Não existe rollback, cota nativa de CPU/memória, ambiente de contêiner ou
restrição ao filesystem do workspace após o shell começar.

O ambiente herdado é filtrado; credenciais arbitrárias, `NODE_OPTIONS`,
`PYTHONPATH`, `BASH_ENV` e `ENV` não são repassados. Isso não impede um comando
de ler arquivos acessíveis à conta. O interpretador e suas dependências
precisam ser confiáveis. A rechecagem de caminho canônico não é assinatura
ou hash de todo o software invocado e não elimina races hostis no filesystem.

OSC 52 (clipboard) e OSC 8 (hyperlinks) são consumidos sem ação nativa.
Não há addon de links nem abertura automática de URL. Manipulações de janela
por escape sequence ficam desativadas. Copiar seleção exige ação explícita
do usuário por um método IPC específico, vinculado à sessão/workspace e
limitado a 64 KB; a saída de um processo não chama essa ação. Não é necessário
relaxar a política geral de permissões do Chromium para copiar uma seleção.

O fechamento usa `taskkill /T /F` e limpeza ConPTY no Windows. Em POSIX,
consulta descendentes, termina processos e o grupo do shell. Processos
deliberadamente desassociados, races de PID ou falha abrupta do sistema
exigem mecanismos adicionais de contenção; não há garantia de eliminar
processos maliciosos ou de reverter efeitos já realizados.

## Electron, Windows e distribuição

O pacote oficial node-pty 1.1.0 usa `node-addon-api` e contém prebuilds Windows
x64/arm64. Linux requer compilação nativa quando não há prebuild compatível.
Os arquivos `.node` e auxiliares devem permanecer acessíveis fora do ASAR;
a configuração usa `asarUnpack: ["node_modules/node-pty/**"]`.

Esta implementação solicita ConPTY do Windows e não habilita a opção
experimental `useConptyDll`. O contrato rejeita builds Windows inferiores
a 18309, correspondendo ao limiar usado pela versão fixada do addon.
Windows x64 é o alvo de distribuição atual; incluir prebuild arm64 no pacote
de origem não constitui validação de uma release arm64.

O worker utilitário ajusta `ELECTRON_RUN_AS_NODE=1` em seu próprio ambiente
para o helper interno de enumeração de console que node-pty inicia com
`child_process.fork`. O shell recebe outro objeto de ambiente, sem essa
flag. Isso utiliza o fuse `RunAsNode` já necessário aos workers existentes.

Importar o addon em Node comum não prova compatibilidade com Electron ou
empacotamento. A distribuição precisa passar pelo Electron fixado, pelo
worker dentro de `app.asar`, pelo prebuild desempacotado e pelo fechamento
real do PTY. Não declarar esse gate aprovado apenas por haver os binários
no diretório.

## Testes e evidências

```sh
node --test --test-timeout=30000 tests/terminal-runtime.test.mjs tests/terminal-ipc.test.mjs
node scripts/smoke-terminal.mjs
```

Os testes de runtime verificam um PTY real, `isTTY`, Unicode, argumentos,
arquivo produzido, resize físico, Ctrl+C, backpressure, limites de retenção,
exit code e fechamento sem artefato tardio de um filho normal. Também testam
contratos inválidos, startup crash, encerramento sem confirmação e aprovação
nativa tardia.

O smoke Electron usa o shell padrão da interface, incluindo Windows
PowerShell no Windows, teclado e xterm reais. Verifica coexistência com
salvar/executar, bloqueio de troca de workspace, navegação, resize, escapes,
cópia selecionada, interrupção e fechamento normal do aplicativo. Workspaces
e perfis são temporários; diálogos nativos são respondidos pelo harness do
teste, sem modificar consentimentos de produção.

`scripts/lib/packaged-native-tools-checks.mjs` fornece uma função serializável
para o teste do executável instalado. Ela resolve módulos no ASAR real,
inicia o worker usando o executável instalado, abre Prompt de Comando,
redimensiona o PTY, grava arquivo real e confirma saída do worker.

Screenshots `terminal-*.png` e `terminal-results.json` são evidências da
execução correspondente. Um script criado ou um teste Linux com wrapper
externo sem sandbox não comprova um teste Windows/ASAR aprovado.

## Fontes dos componentes e contratos

- [node-pty, código e documentação oficiais](https://github.com/microsoft/node-pty)
- [Pacote oficial node-pty 1.1.0](https://www.npmjs.com/package/node-pty/v/1.1.0)
- [xterm.js](https://github.com/xtermjs/xterm.js)
- [Controle de fluxo xterm.js](https://xtermjs.org/docs/guides/flowcontrol/)
- [Segurança de integração xterm.js](https://xtermjs.org/docs/guides/security/)
- [Electron utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process)
- [Módulos nativos no Electron](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)

As dependências têm versões fixas no lockfile; os avisos de licença de cada
componente acompanham a distribuição. A documentação do branch principal
dos projetos upstream pode divergir da versão fixada — por exemplo, remoção
posterior de winpty — e não substitui a inspeção do pacote instalado.
