# OmniForge Studio v0.7.0 — Central de Tarefas

## Objetivo

Tornar a IDE capaz de executar scripts de desenvolvimento reais com uma interface supervisionada, sem criar um terminal genérico nem sobrecarregar o processo do Electron. A ferramenta funciona com projetos Node.js que contenham um package.json na raiz do workspace. Não altera CAD, grafos de automação, extensões ou seus esquemas persistidos.

## Funcionamento

1. Abra um workspace de projeto com package.json válido. A Central de Tarefas carrega a lista de scripts com nomes permitidos, e uma revisão SHA-256 do manifesto.
2. Selecione um script (test, build, lint etc.). O OmniForge exibe o comando exato armazenado em package.json.
3. Clique em Executar. O Electron abre diálogo nativo de aprovação com nome, workspace, comando e aviso de que o código pode alterar arquivos e acessar a internet.
4. Se aprovado, o backend revalida o hash do manifesto, encontra Node.js e npm no PATH e chama o npm-cli.js via spawn sem shell do renderer e sem argumentos fornecidos livremente.
5. stdout/stderr são enviados ao painel em blocos de no máximo 2048 caracteres. A execução exibe status real, código de saída e resumo.
6. O usuário pode interromper o processo. Windows usa taskkill.exe /PID /T /F contra o PID filho; Linux/macOS utilizam grupo de processos isolado. Os efeitos já produzidos por scripts NÃO são desfeitos.

## Cotas e limites

- Uma execução ativa por aplicação.
- Duração máxima: 120 segundos.
- Saída processada: no máximo 96 KB; snapshot em memória: últimas 48 mil posições de texto.
- package.json com até 160 KB, 80 scripts, 1200 bytes por definição; nomes de scripts simples.
- Nenhum argumento livre, comando digitado pelo usuário ou shell/PTY remoto.
- Sem execução oculta no startup, sem retry automático, sem persistência de logs.
- Não há suporte a npm.cmd direto: o runner identifica o Node executável e seu npm-cli.js no ambiente.
- Scripts lifecycle pre/post implícitos não devem executar (--ignore-scripts), mas o script selecionado é executado.
- Variáveis de ambiente sensíveis herdadas são removidas por allowlist. O processo mantém PATH, HOME/USERPROFILE e TMP/TEMP, necessários ao funcionamento.

## Modelo de ameaça

O código executado é o script definido no package.json do próprio workspace, e possui permissões do usuário que está executando o OmniForge. Um script malicioso pode acessar dados locais, iniciar serviços, acessar a internet ou provocar alterações irreversíveis. A aprovação nativa **não é isolamento**; execute apenas em workspaces confiáveis. O filtro de variáveis de ambiente não impede a leitura de arquivos de credenciais pelo script.

O manifesto é inspecionado novamente após a confirmação, mas um outro processo local pode alterá-lo imediatamente antes da execução (TOCTOU). Projetos que sofrem alterações simultâneas por processos hostis estão fora deste contrato. NPM também interpreta .npmrc e configuração própria do projeto; mantenha dependências confiáveis.

O Electron impede iniciar fluxos ou trocar workspace enquanto scripts estão ativos. O fechamento nativo pede confirmação, solicita cancelamento da tarefa e evita a execução silenciosa em segundo plano. O agendador do OmniForge permanece independente e não inicia scripts npm automaticamente.

## Testes

- Testes Node: leitura e validação, revisão alterada, symlinks, descoberta do npm-cli, script real e output, skip de lifecycle pre/post, timeout, cancelamento, falha e dupla execução.
- E2E Windows Electron: recusar aprovação e não criar artefatos, aprovar e executar npm real, visualizar stdout, criar arquivo em disco, filtrar secret herdado, não rodar hook e cancelar processo em execução.
- Regressões anteriores: grafos, CAD/DXF, Git, editor Monaco, extensões, scheduler, build Vite/bundle, Portable e instalador NSIS.

Referência técnica: documentação Node child_process (https://nodejs.org/api/child_process.html). Em Windows, executáveis .cmd/.bat não são processados por execFile sem shell; por isso usamos diretamente node.exe com npm-cli.js, nunca comandos de shell do renderer.
