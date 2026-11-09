# Bancada nativa v0.11.0

Esta etapa transforma três capacidades planejadas em ferramentas operáveis:
terminal interativo, banco SQLite e cotas persistentes no CAD. Preserva a
arquitetura modular, as ferramentas da v0.10.0 e a navegação única. Cada
módulo tem seu estado e seus controles; nenhum botão representa integração
com um produto inteiro apenas porque ele aparece no catálogo.

## Entrega por módulo

| Módulo | Operações disponíveis | Persistência |
|---|---|---|
| Terminal | Abrir shell do sistema, digitar comandos, programas interativos, resize real, Ctrl+C, selecionar/copiar, limpar tela e encerrar | PTY e tela entre módulos; cauda limitada para reanexação após reload do renderer. Sem reinício automático de shell |
| SQLite | Criar/abrir snapshot, esquema, consultar com parâmetros, aplicar DDL/DML, rollback, cancelar, copiar resultado e salvar cópia | Imagem aceita em memória; arquivo novo criado exclusivamente após confirmação. Origem intacta |
| CAD | Cotas por objeto, referência/fixa, edição numérica, rejeição de conflitos, undo/redo, recuperação, salvar e SVG cotado | Documento CAD v2 ao adicionar a primeira cota; v1 continua legível |
| Referências | Busca, categorias, estado de adoção, versões e abertura delimitada de fontes oficiais | 150 identidades anteriores preservadas e guia Node SQLite acrescentado, total 151 |

### Terminal para desenvolver software

Abra um projeto, entre em **Desenvolvimento → Terminal**, escolha o shell e
use **Abrir terminal**. O diálogo mostra o ambiente e o projeto. No Windows,
as opções são Windows PowerShell e Prompt de Comando; Linux usa Bash ou sh
quando disponíveis. Os shells iniciam sem os mecanismos usuais de perfil
automático configurados por esta integração.

Dentro da sessão aprovada, é possível usar as ferramentas instaladas na
máquina, por exemplo executar testes, iniciar um servidor local ou chamar
Git. Node, Python, Git e outros programas usados pelos comandos continuam
sendo requisitos do projeto do usuário. O terminal não instala uma cadeia
de desenvolvimento automaticamente.

**Ctrl+C** interrompe o programa em primeiro plano. **Encerrar** fecha a
sessão e tenta terminar sua árvore normal de processos. O terminal não tem
o limite de 120 segundos do runner **Executar e testar**. Ele pode coexistir
com edição, salvamento e outras ferramentas; comandos externos podem
modificar arquivos e provocar conflitos de revisão no editor.

xterm.js 6.0.0 apresenta a tela; addon-fit 0.11.0 calcula as dimensões;
node-pty 1.1.0 fornece o PTY em um utility process Electron. A saída tem
controle de fluxo e ACK, a retenção é limitada e uma falha de inicialização
ou de encerramento é apresentada explicitamente. A entrada pertence à
sessão aprovada, sem expor APIs de processo ao renderer.

O shell mantém as permissões da conta. Ele pode ler, alterar ou apagar
arquivos fora do projeto e acessar rede; não há sandbox ou rollback geral.
OSC 52 e OSC 8 não acionam clipboard nem abertura de links. Copiar seleção
é uma ação própria e limitada. Consulte [o contrato do terminal](TERMINAL_WORKBENCH.md).

### SQLite para modelar dados locais

O módulo utiliza o `node:sqlite` incluído no Electron 45.1.0, sem servidor
ou dependência SQLite adicional. Crie um banco ou abra uma cópia offline
`.sqlite`, `.sqlite3` ou `.db` do projeto. O esquema apresenta tabelas,
colunas, índices, views e triggers. O editor aceita SQL real; parâmetros
JSON são vinculados separadamente, sem concatená-los ao SQL.

**Consultar** aceita uma instrução de leitura. **Aplicar alterações** pede
confirmação e executa o script inteiro em uma transação em processo separado.
É possível criar tabelas e relações, inserir/atualizar/excluir registros,
criar índices e triggers compatíveis. Erro, cancelamento ou prazo excedido
preservam a última imagem aceita, incluindo alterações anteriores ainda
não salvas. Os inteiros SQLite de 64 bits retornam como strings tipadas;
BLOBs e textos grandes mostram prévias limitadas e o tamanho original.

**Salvar cópia** cria um arquivo novo em uma pasta existente. Nenhuma origem
ou cópia anterior é substituída. A origem não é uma conexão viva: alterações
de outros aplicativos não entram automaticamente na sessão. Bancos WAL ou
com arquivos auxiliares são recusados; use uma cópia offline consolidada
em modo DELETE pelo aplicativo de origem.

Limites principais: 32 MiB por banco, 64 KiB de SQL, 10 segundos por processo,
1.000 linhas e 1 MiB de resultado. O authorizer bloqueia anexos, PRAGMA do
usuário, extensões e transações externas ao controle do módulo.
Não há PostgreSQL/MySQL, banco cifrado, edição direta da origem ou migrations
automáticas nesta entrega. Veja [o contrato SQLite](DATABASE_WORKBENCH.md).

### CAD com intenção dimensional persistida

Uma linha admite comprimento; um retângulo, largura e altura; um círculo,
raio ou diâmetro; um arco, raio. Em **Cotas persistentes**, escolha
**Referência** para acompanhar a medida geométrica ou **Fixa** para manter
um valor que controla a dimensão. Editar uma cota fixa altera geometria e
intenção na mesma operação.

O validador central confere as cotas ao editar, transformar, carregar,
salvar e recuperar. Uma escala incompatível é recusada integralmente.
Duplicar mantém as cotas do objeto; excluir remove suas cotas. Objetos ou
camadas bloqueados não podem ser modificados. O formulário preserva os
valores inválidos e informa o primeiro campo que precisa de correção.

O formato nativo e SVG preservam as anotações. O DXF atual continua
geométrico: a interface pede **Exportar só geometria** e trabalha sobre
uma cópia; cancelar não exporta. O exportador direto e o nó de automação
recusam desenhos cotados para impedir perda silenciosa. O relatório CAD
mede a geometria sem contar as anotações como novos objetos.

Não foi incorporado um solver SolveSpace. Não há relações entre objetos,
coincidência, tangência, equações, ângulos fixos ou modelagem de sólidos.
Estas são dimensões locais com regras verificadas, descritas em
[Cotas CAD](CAD_DIMENSIONS.md).

## Sessões, navegação e fechamento

Terminal e SQLite são carregados na primeira visita e permanecem montados
quando outro módulo é exibido. O PTY continua consumindo saída; SQL,
parâmetros e resultados continuam disponíveis ao retornar. O orçamento de
carregamento inicial permanece em 375.000 bytes de JavaScript e 300.000
bytes de CSS; isso mede arquivos estáticos, não RAM, FPS ou tempo de início.

Trocar de projeto exige fechar o terminal e resolver alterações SQLite
pendentes. O host confere essas condições mesmo que o renderer falhe.
A criação de outro projeto verifica a transição antes de criar arquivos.
Fechar o aplicativo aguarda gravações em curso, solicita cancelamento dos
processos e pede confirmação quando houver trabalho não salvo.

Recarregar apenas o renderer reanexa o projeto já aberto no processo
principal. O terminal reapresenta uma cauda limitada da saída; o SQLite
mantém a imagem já aceita. Texto SQL ainda não aplicado e resultados da
tela não têm checkpoint após reload. Reiniciar todo o aplicativo não
recria essas sessões, e a imagem SQLite não salva é perdida. Salvar cópia
é necessário para preservá-la.

## Compatibilidade e dependências

- Node de desenvolvimento: **24.22.1+**, com CI fixado em 24.22.1. Electron
  permanece em **45.1.0**; usa sua própria versão de SQLite.
- node-pty possui prebuild Windows no pacote fixado. Linux requer compilador,
  make e Python. O addon e auxiliares ficam fora do ASAR; a configuração
  `npmRebuild: false` preserva o prebuild N-API que será testado instalado.
- O primeiro uso de cotas promove um desenho para CAD schema v2. Versões
  antigas recusam esse formato; remover todas as cotas não o rebaixa
  silenciosamente. Arquivos antigos sem cotas continuam legíveis.
- Dependências estão fixadas no lockfile. Licenças upstream do terminal,
  winpty e node-addon-api acompanham os recursos distribuídos; veja
  [avisos da etapa](../third-party-notices/WORKBENCH-V0110.md).
- O mapa contém **144 repositórios e sete guias**, com **11 integrações
  efetivas**. Better-sqlite3 permanece alternativa e SolveSpace permanece
  planejado. A suíte verifica o hash de identidade das 150 fontes anteriores.

## Verificação por revisão

Os testes devem corresponder ao mesmo commit do código e do pacote. Criar
um teste não comprova sua execução, e passar em Node comum não comprova o
addon nativo dentro do Electron instalado.

```sh
npm ci
npm run verify:release
npm run verify:references
npm test
npm run build
npm run budget:bundle
npm run smoke:terminal
npm run smoke:database
npm run smoke:cad-dimensions
npm run smoke:capabilities
```

Os novos testes verificam processos e filesystem reais, falhas, revisão
obsoleta, consentimento cancelado, saída truncada, rollback, encerramento,
compatibilidade CAD e navegação/reload. Os smokes Electron produzem capturas
e JSON em `smoke-artifacts`; são executados com perfis e projetos temporários.
Os gates existentes de editor, recuperação, automações, Git, extensões,
agendamento, criação de projetos e segurança permanecem obrigatórios.

No Windows, o gate de distribuição instala o NSIS e executa workers dentro
do `app.asar`. Os helpers verificam PTY com node-pty desempacotado, resize,
arquivo produzido, término do worker, SQLite nativo, transação, rollback,
cópia exclusiva e reabertura. Também verifica Portable, abertura/fechamento,
fuses e preservação dos arquivos ao desinstalar.

O relatório definitivo é o resultado do CI e dos artefatos da revisão.
Testes locais Linux com adaptações externas do ambiente não certificam a
sandbox Electron nem substituem os gates Windows. A versão segue experimental
e os binários Windows não possuem assinatura digital.

## Próximas capacidades identificadas

O catálogo continua mostrando separadamente depurador DAP, LSP externo,
solver geométrico entre objetos, kernel de sólidos 3D, PostgreSQL/DuckDB,
CAM/BIM e plugins com código. Não foram habilitados como ações executáveis
nesta etapa. Nenhuma fonte do catálogo foi removida para aparentar conclusão.
