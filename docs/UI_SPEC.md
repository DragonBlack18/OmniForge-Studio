# Especificação de interface — v0.1 e evolução

## Objetivos visuais

A interface não pode ser um n8n encaixado dentro de um VS Code. Terá uma linguagem única, ferramentas em painéis contextuais, hierarquia consistente e navegação por **contexto do projeto**. O canvas e o editor partilham a seleção do workspace, mas seus estados de execução não se confundem.

### Sistema visual inicial

- Base: azul-noite e grafite industrial; elementos de trabalho em cinza-claro.
- Destaque interativo: azul; sucesso: verde; erro: vermelho apenas quando houver erro real.
- Layout: topbar de ações e projeto, rail de módulos à esquerda, sidebar de catálogo/explorador, centro canvas/editor, inspetor à direita, statusbar inferior.
- Fonte: tipografia do próprio sistema; o MVP não depende de CDN nem baixa fontes remotas.
- Canvas: zoom, pan, mini-mapa, nós selecionáveis, handles, ligações e exclusão via React Flow.
- Editor: Monaco local com extensão detectada do arquivo; suporte de sintaxe não significa suporte completo a debugger ou compilador.

## Ações v0.1 — contrato de funcionamento

| Ação | Resultado que deve ser observado |
|---|---|
| Abrir projeto | Exibe diálogo do SO; após confirmação carrega arquivos e fluxo da pasta escolhida, sem gravação automática |
| Blocos | Lista os três tipos disponíveis; clique adiciona instância real ao fluxo |
| Arquivos | Mostra diretórios e arquivos (limites de tamanho/profundidade) |
| Clique em arquivo | Abre conteúdo UTF-8 no Monaco, bloqueia binário e symlink |
| Salvar arquivo | Grava apenas o arquivo selecionado, exige que a revisão não tenha mudado externamente |
| Selecionar bloco | Exibe campos do manifesto para editar no inspetor |
| Conectar blocos | Cria uma aresta editável; validação posterior exige portas compatíveis |
| Validar | Analisa estrutura do grafo; mostra erros específicos |
| Simular | Executa transformações e mostra as ações que seriam gravadas, mas não grava saída |
| Executar | Executa grafo válido e grava JSON real na pasta protegida |
| Salvar fluxo | Persiste JSON do fluxo em `.omniforge/flows/principal.json` |
| Sobre | Exibe nome, versão, modo e créditos do desenvolvedor |
| GitHub do desenvolvedor | Abre a página fixa do autor em navegador externo após ação explícita |

## Estados da UI

- Sem workspace: canvas exemplificativo editável na memória, persistência/execução desabilitadas até seleção.
- Fluxo estruturalmente inválido: `Validar` apresenta lista de erros, `Executar` é recusado no engine.
- Gatilho bem-sucedido: passos `PASS` com elapsed time, artefato real informado pelo caminho relativo.
- Falha no nó: execução interrompida e erro do bloco mostrado sem incluir conteúdo do payload no log.
- Arquivo com alteração local não salva: símbolo `•` no título; ao trocar arquivo/projeto, confirmação.
- Arquivo mudou externamente: salvar bloqueado; usuário deve recarregar antes de editar.

## Próximas telas previstas

- **Project Hub**: abrir, comparar, agrupar e referenciar projetos sem copiar todos os arquivos.
- **Architecture View**: grafo de dependência com níveis, contratos e testes.
- **Workflow Profiler**: duração, entradas/saídas tipadas, retries e timeline.
- **Plugins & Languages**: instalação consciente por fonte permitida, extensão e compatibilidade.
- **AI Workbench**: chat, agentes e avaliação com política clara de ferramentas.
- **CAD/Robot View**: árvore mecânica, parâmetros, viewport, materiais, movimentação e exportações.
- **Industrial I/O**: catálogo tipado de sinais, unidades, simulação e autorização de dispositivo.
- **Security & Permissions**: escopos por projeto, credenciais e auditoria.
- **Release Center**: versões, logs de migração, backup/restore, assinatura e atualizações.

Estas telas não devem surgir ativas enquanto não houver APIs e testes correspondentes.

## Navegação do workbench — v0.2.1 (visual cleanup)

- Navegação principal persistente, agrupada em **Workspace**, **Recursos** e **Acompanhamento**, com rótulos claros e ícones vetoriais.
- Recolhimento do menu lateral com `Ctrl+B`; a preferência é guardada somente no perfil local do renderer, sem alterar o projeto.
- Biblioteca de nós e explorador de arquivos são painéis contextuais: ficam disponíveis no **Editor visual** e no **Editor de código**, e deixam de ocupar espaço na visão geral, CAD, projetos e histórico.
- Na biblioteca, busca `Ctrl+K`, categorias e nós disponíveis; clique adiciona nó executável ao fluxo.
- Explorador de arquivos com filtro local, diretórios recolhíveis e atualização explícita. A lista continua vindo do backend seguro e não habilita edição de caminhos arbitrários.
- Inspector de nós pode ser recolhido. Selecionar um nó reabre o inspector.
- `Ctrl+S` salva o documento ativo somente quando alterado: o fluxo no canvas ou o arquivo aberto no Monaco. CAD preserva seu próprio salvamento.
- Painel inicial reflete apenas dados reais do workspace, catálogo e última execução da sessão. Recursos planejados são marcados como indisponíveis, sem cards simulados.
- Paleta grafite/teal controlada, contraste acessível, foco visível, suporte a movimento reduzido, tipografia e espaçamento consistentes.
- Preferências de layout não alteram `.omniforge/`, arquivos ou dados de projetos. Nenhum schema de persistência foi modificado.
