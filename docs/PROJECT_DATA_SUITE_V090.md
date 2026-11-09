# OmniForge Studio v0.9.0 — criação de projetos e automações de dados

## Entrega funcional

Esta versão acrescenta 36 capacidades verificáveis, sem contar atalhos,
cores, testes ou cada exemplo de arquivo como uma funcionalidade distinta.
A matriz em `FEATURE_MATRIX_V090.md` relaciona cada capacidade ao teste.

### Criação e organização

- **Criar → Novo arquivo / Ctrl+N** abre um documento vazio, sem exigir
  arquivo ou projeto anterior. O documento é marcado como não salvo mesmo
  se vazio. O aviso informa que ainda está **somente em memória**.
- **Salvar como** escolhe nome/caminho e cria exclusivamente um novo arquivo.
  Se não houver projeto, a pasta é escolhida pelo diálogo nativo e o texto
  continua na sessão. Pastas intermediárias têm opção explícita.
- Salvar como em um documento existente cria uma nova aba/cópia do buffer;
  não grava nem descarta a versão anterior. Conflitos nunca sobrescrevem.
- **Arquivo de modelo** oferece 12 conteúdos originais com prévia: vazio,
  JS, TS, Python, JSON, HTML, CSS, Markdown, SQL, testes Node/Python e CSV.
  A abertura do modelo não executa código nem grava arquivos.
- **Novo projeto / Ctrl+Shift+N** oferece projeto vazio, CLI Node + testes,
  CLI Python + testes, web estática e tratamento CSV com biblioteca padrão
  Python. A pasta pai é escolhida nativamente; um nome existente é recusado.
- Os kits não baixam dependências e funcionam fora do OmniForge. Node/Python
  são pré-requisitos externos. O CLI Node pode ser executado pela Central
  de Tarefas já existente; Python não ganhou executor integrado nesta etapa.
- **Documento → Organizar / propriedades** e clique direito no explorador
  expõem duplicar, renomear, mover e inspecionar arquivo textual salvo.
  Propriedades incluem bytes, caracteres, linhas, EOL, UTF-8, data e SHA-256.
- Duplicar copia o disco revisado; Salvar como copia a edição da aba. Não
  confundir as duas operações. Renomear/mover exigem aba sem edição/rascunho
  pendente e confirmação nativa. Não atualizam imports automaticamente.
- Reabrir última aba fechada usa histórico local limitado a 10 caminhos da
  sessão; Fechar abas salvas/Fechar outras abas salvas não descartam edições.
- Tema grafite/vermelho, navegação global única, CAD e layouts preservados.

### 26 blocos executáveis

CSV/NDJSON, deduplicação por chave, contagem e resumo por grupo, junção de
listas, conversão colunas/linhas, expansão/achatamento de propriedades,
pares chave/valor, partição por igualdade, estatísticas, mapeamento de
intervalos, unidades físicas, normalização de texto, slug, componentes URL,
timestamp e diferença UTC, conversão explícita de campos e JSON ordenado.

Cada operação recebe JSON e é carregada no worker. Nenhuma contém eval,
shell, acesso a arquivos ou rede. Só os nós de saída existentes realizam
persistência, com seus controles de caminho e revisão já aplicados.

Quatro modelos combinam essas operações: **CSV: consolidar categorias**,
**Conciliar duas tabelas**, **Estatística de medidas** e **Inspecionar registros
NDJSON**. Cada saída é verificada no filesystem pelo teste de aceitação.

## Limites e contratos explícitos

1. Documento sem título **não tem recuperação em disco** antes de Salvar como.
   Trocar projeto com documento ainda sem nome exige resolução. Cancelar ou
   descartar uma aba não elimina arquivos do disco.
2. Até 16 abas; limite agregado de abertura 8 MiB. Save As reserva destino e
   capacidade antes da chamada nativa. Respostas antigas não migram abas entre
   projetos. Novas edições durante Save As são mantidas e recebem checkpoint
   com a revisão criada.
3. Operações novas de arquivo aceitam texto UTF-8 de até 1 MB, não conteúdo
   binário, segredos, diretórios técnicos, nomes de dispositivo, links ou
   caminhos fora da pasta. Destinos são exclusivos, inclusive variação de caixa.
4. Renomear/mover usa link exclusivo e retirada da origem, no mesmo filesystem
   com suporte a hard links (Windows NTFS e filesystems equivalentes). Não
   suporta diretórios, mudança de volume nem simples troca de maiúsculas.
   Falha antes do commit não substitui o destino. Não é uma transação distribuída
   nem proteção absoluta contra um processo hostil com a mesma conta do SO.
5. Uma criação interrompida pode deixar os arquivos/pastas já criados: nada
   preexistente é apagado para “limpar” um erro. Erros são apresentados, não
   convertidos em sucesso. Criação em lote de projeto não é rollback atômico.
6. Blocos: máximo 2 MB de JSON/texto por transformação, 10.000 registros,
   64 colunas e limites de profundidade/estrutura. Os limites globais do fluxo
   continuam valendo e podem ser menores. Nenhum limite antigo foi ampliado.
7. CSV exige cabeçalho único, conta de colunas consistente e parsing estrito.
   Valores ficam textuais até conversão explícita. Exportação protege fórmulas
   por padrão. NDJSON não é streaming: recusa dados maiores que o limite.
8. Junção não multiplica chaves duplicadas da tabela direita; recusa ambiguidade.
   Tipos das chaves são significativos (1 não é "1"). Tabelas irregulares são
   recusadas quando a operação exige colunas consistentes.
9. Estatísticas são populacionais, aritmética IEEE-754; não há promessa de
   precisão decimal financeira. Unidades devem ser da mesma dimensão e
   temperaturas abaixo de zero absoluto são recusadas.
10. Datas exigem UTC explícito. Diferença mede duração, não dias úteis ou
    calendário local. JSON ordenado é determinístico, não assinatura nem RFC JCS.

## Integração open source real e referências

**PapaParse 5.5.3, MIT** foi incorporado sem modificar seus bytes; origem,
Git blob, SHA-256, licença e uso estão em
`third-party-notices/PapaParse-INTEGRATION.md` e `core/vendor/manifest.json`.
O inventário da compilação inclui esse componente além das dependências npm.
O adaptador OmniForge limita entradas/saídas e não usa download remoto.

Referências consultadas para comportamento e organização (não engines copiadas):

- VS Code — criação, Save As, abas, Explorer e comandos contextuais:
  https://code.visualstudio.com/docs/getstarted/userinterface
  https://code.visualstudio.com/docs/editing/codebasics
- Node-RED — nós básicos de transformação e receitas CSV:
  https://nodered.org/docs/user-guide/nodes
  https://cookbook.nodered.org/basic/parse-csv
- PapaParse — API e licença da versão incorporada:
  https://www.papaparse.com/docs
  https://github.com/mholt/PapaParse/tree/5.5.3
- Node — criação exclusiva, metadados e semântica de filesystem:
  https://nodejs.org/api/fs.html

A finalidade agora é uso pessoal, conforme esclarecimento do usuário.
Atribuições e versões continuam registradas. Nenhum runtime completo Node-RED,
terminal, servidor Python LSP/DAP, kernel CAD 3D ou serviço permanente está
implícito nessa lista de operações.

## Verificação

- Unitários e integração real: `node --test tests/data-suite.test.mjs
  tests/project-authoring.test.mjs tests/untitled-documents.test.mjs
  tests/authoring-ipc.test.mjs`.
- Cada um dos 26 blocos é exercitado pela função real **e** pelo executor de
  fluxo com gravação/leitura de JSON temporário; entradas inválidas são recusadas.
- Kits Node/Python gerados executam testes reais como processos independentes;
  o handler do kit web tem teste isolado com DOM simulado, não é apresentado
  como teste de renderização desse aplicativo web externo.
- `npm run smoke:project-suite`: Electron Windows real, criar sem arquivo
  anterior, digitação integral, Save As, modelos, pasta, cópia/colisão,
  confirmação de movimentação, propriedades, abas, novo projeto, testes Node
  pela Central de Tarefas e quatro modelos de automação com saídas reais.
- O smoke produz oito capturas da mesma revisão em janelas 1440×900 e
  1280×800. Dados são exemplos temporários, sem conteúdo pessoal.
- Todas as regressões anteriores continuam obrigatórias, assim como orçamento
  Vite, instaladores Windows reais, fuses e proveniência SHA-256.

A fonte implementada não equivale automaticamente a pacote aprovado. O PR
registra o resultado e a revisão exata dos gates. Distribuição experimental
sem assinatura digital; QA prolongado e auditoria ampla ainda pendentes.
