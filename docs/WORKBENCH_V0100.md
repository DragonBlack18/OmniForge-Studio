# OmniForge 0.10.0 — ferramentas executáveis por módulo

Esta etapa amplia a base 0.9.0 com execução e testes de código, organização de
fluxos, edição de conexões, geometria CAD e um catálogo completo das fontes
pesquisadas. A interface permanece uma bancada desktop com navegação única.

## 1. Desenvolver e testar software

Abra ou crie um projeto. O editor Monaco já oferece documentos, arquivos,
busca, comparação, diagnósticos JavaScript/TypeScript e ferramentas de Git.
Salve seu arquivo e abra **Desenvolvimento → Executar e testar**.

| Ação | Node | Python | Resultado verificável |
|---|---|---|---|
| Executar arquivo | `.js`, `.cjs`, `.mjs` | `.py` | Processo real, stdout/stderr, código de saída e eventuais arquivos produzidos |
| Verificar sintaxe | `node --check` | AST do arquivo via `tokenize` | Análise do arquivo selecionado sem executar seu conteúdo |
| Executar testes | Runner `node --test` | `unittest` no arquivo selecionado | Sucesso/falha do processo; suíte Python sem testes falha |
| Cancelar | Processo supervisionado | Processo supervisionado | Estado cancelado e tentativa de encerramento da árvore |

Selecione o arquivo, a ação e, para execução, argumentos como lista JSON de
strings. Cada string vira um argumento literal; não é uma linha interpretada
por shell. O diálogo nativo mostra caminho, ambiente, revisão e argumentos.
Depois da aprovação, o host verifica novamente o arquivo e o executável. Se o
arquivo mudou, atualize a lista e confirme a nova revisão.

Node deve estar instalado no PATH. Python prefere `.venv`/`venv` do projeto e
depois procura no PATH; o painel informa disponibilidade e caminho. Descobrir
arquivos não executa interpretadores. A instalação de ambientes e dependências
continua sendo uma decisão explícita do usuário.

O console mostra a origem da saída mesmo quando outro arquivo é selecionado.
A tarefa pode continuar ao navegar entre módulos; seu estado permanece no
processo principal. Salvar, trocar workspace, executar npm e iniciar fluxos
conflitantes são bloqueados durante o trabalho. O fechamento participa do mesmo
contrato de cancelamento. Cancelar durante preparação ou diálogo também impede
que uma aprovação tardia inicie código, tanto neste módulo quanto na Central de
Tarefas npm.

**Limites:** 120 segundos por execução, 96 KB de saída capturada, 48 mil
caracteres no snapshot visível, stdin fechado, até 300 alvos e 4.000 entradas
visitadas. O supervisor não é um terminal interativo, debugger ou serviço
persistente. Código aprovado mantém permissões da conta; cancelamento não
desfaz efeitos anteriores. TypeScript continua usando scripts npm do projeto.
Detalhes: [DEVELOPMENT_RUNTIME.md](DEVELOPMENT_RUNTIME.md).

## 2. Organizar e editar automações

**Organizar fluxo** usa ELK.js 0.12.1 em um Web Worker criado sob demanda.
O layout considera portas, dimensões e ramificações. O worker recebe topologia
e geometria, sem configurações, credenciais ou payloads dos nós.

É possível cancelar. Um resultado que chega após edição, troca de documento ou
bloqueio da sessão é descartado. A aplicação de novas posições é uma operação
única de histórico: **Desfazer** restaura todas as posições anteriores.

Selecione um bloco e abra a aba **Conexões**. Ela mostra portas de entrada e
saída, entradas obrigatórias, conexões ausentes e os blocos conectados. Permite
navegar até eles ou desconectar. Arrastar uma ponta de conexão altera o destino
ou a origem mantendo a identidade da aresta. Validação recusa ciclos, portas
inexistentes, autoconexão e entrada já ocupada. Reconectar e desconectar são
reversíveis, sem recriar os nós ou alterar suas configurações.

A execução continua pertencendo ao supervisor existente, com validação, revisão,
cancelamento e histórico. Organizar o desenho não muda a ordem semântica nem o
resultado do fluxo.

## 3. CAD 2D com arcos e importação ampliada

O desenho agora aceita **arcos analíticos**, com centro, raio e ângulos. Eles
participam de propriedades, medidas, enquadramento, snaps, transformações,
duplicação, desfazer/refazer, persistência e exportação SVG/DXF. A ferramenta
gráfica usa três cliques; os valores também podem ser editados numericamente.

**Paralela radial** cria offsets concêntricos de círculos e arcos, com distância
positiva ou negativa. Raios nulos/negativos são recusados. Espelhar um arco
preserva corretamente sua orientação.

O importador usa `dxf-parser@1.1.2` acompanhado de validação do domínio:

- `LINE`, `CIRCLE`, `ARC` e `LWPOLYLINE`, incluindo bulges positivos e negativos.
- `INSERT` estático com ponto base, translação, rotação, escala uniforme,
  espelhamento, aninhamento delimitado e herança de camada.
- Camadas desligadas ou congeladas tornam-se invisíveis; bloqueio é preservado.
  Não há estado de congelamento separado no documento nativo. Unidades conhecidas convertidas para milímetros.
- Proveniência com entidade/handle, caminho de blocos e instância, visível no
  inspetor e preservada no JSON.

**Blocos viram primitivas independentes.** Editar uma instância não modifica
automaticamente as demais. Exportar DXF preserva a geometria expandida, sem
reconstruir `INSERT` ou blocos paramétricos. A saída DXF continua R12/AC1009 em
milímetros; reimportar exige confirmar mm, pois a saída não inclui INSUNITS.
Coordenadas/raios usam quatro casas decimais e ângulos dez. Proveniência permanece
no JSON nativo. Camadas invisíveis são exportadas no DXF como desligadas; SVG
omite sua geometria. Entidades ocultas individualmente ficam fora das duas saídas.

A importação é integral: casos incompatíveis são recusados, sem omissão
silenciosa. Incluem 3D/paperspace, elipses geradas por escala não uniforme de
curvas, XREF, atributos, blocos dinâmicos, arrays INSERT, referências ausentes ou
cíclicas e metadados de recorte XCLIP/SPATIAL_FILTER. Limites: DXF até 2 MB,
2.000 entidades resultantes, 32 camadas, aninhamento até oito níveis e documento
JSON serializado de no máximo 1,5 MB. O limite final de persistência é verificado
antes de substituir o desenho.

Importar não altera o DXF de origem nem salva automaticamente o desenho. Salvar
é explícito e mantém a proteção de revisão do arquivo.

## 4. As 150 referências permanecem rastreáveis

**Ambiente → Ferramentas e referências** contém 144 repositórios e seis guias.
Busca sem distinção de acentos, filtros por área/estado, contagem, detalhes e
abertura da fonte oficial são funcionais. O host aceita apenas um ID do catálogo
para abrir URLs; não existe uma API genérica de abertura de endereço arbitrário.

São oito componentes/ferramentas marcados como integrados: React Flow, ELK.js,
Monaco, dxf-parser, PapaParse, Playwright, Electron Fuses e electron-builder.
Seis já pertenciam à base; ELK e dxf-parser são as duas integrações diretas novas.
Os demais estão classificados entre referência, planejado e alternativa.

O painel de preparação visual descreve terminal, depurador, modelagem de sólidos,
restrições, bancos de dados e CAM/BIM. Seus botões são indisponíveis. Não há
instalação automática de 150 repositórios, execução fictícia ou promessa de
compatibilidade com todas as extensões de VS Code/n8n/Autodesk.

O mesmo modelo gera [REFERENCE_MAP.md](REFERENCE_MAP.md); `npm run
verify:references` impede divergência entre o documento e o aplicativo.

## 5. Interface, dependências e compatibilidade

O tema grafite/vermelho, navegação única e painéis por módulo são preservados.
Confirmações editoriais agora usam um diálogo compartilhado com foco em
Cancelar, Escape, contenção e restauração do foco. Os testes de recuperação e
modelos clicam nos controles reais, inclusive para recusar a operação.

Monaco, CAD, canvas, desenvolvimento e catálogo continuam separados em módulos
carregados sob demanda. O worker ELK não integra o carregamento inicial. O
orçamento existente de 375.000 bytes JS permanece inalterado; isso não é uma
medição de memória, FPS ou tempo de inicialização.

Dependências novas são fixadas por versão/integridade no lockfile. Licenças e
proveniência são incluídas em `third-party-notices`. Uso pessoal não transforma
código proprietário em fonte disponível: referências proprietárias orientam a
experiência; o código incorporado nesta etapa vem das dependências declaradas.

Não há migração automática ou limpeza de projetos. O schema CAD v1 recebe
entidade arco e metadados aditivos. Uma versão antiga pode recusar um desenho
salvo com essas novidades; preserve uma cópia se precisar voltar a uma versão
anterior. Fluxos mantêm nós, conexões, configurações e revisões existentes.

## 6. Verificação e reprodução

```bash
npm ci --no-audit --no-fund
npm run verify:release
npm run verify:references
npm test
npm run build
npm run budget:bundle
npm run smoke:development
npm run smoke:flow-topology
npm run smoke:cad-precision
npm run smoke:capabilities
```

Os novos smokes e todos os gates existentes integram os workflows Windows, com
Node e Python reais. Capturas e JSON de resultados são artefatos do CI. A
distribuição Windows verifica também os binários e fuses empacotados.

Os testes locais em Linux usaram projetos temporários reais e um harness fora
do repositório para contornar a indisponibilidade de display/instância única
neste executor. Essa evidência funcional não prova sandbox, cofre Windows ou
exclusão de múltiplas instâncias; a validação desses itens pertence ao workflow
Windows sem adaptações. Estado final dos testes e pacotes deve ser consultado
na revisão exata do pull request, não inferido da existência dos scripts.
