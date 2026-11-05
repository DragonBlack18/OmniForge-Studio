# OmniForge Studio 0.7.7 — revisão de interface e inspeção CAD

## Escopo entregue

Uma navegação global à esquerda substitui a combinação activity rail + menu lateral.
Os grupos mantêm todos os destinos existentes. O menu pode ser recolhido; Ctrl+B,
Ctrl+P, Ctrl+Shift+P e F1 continuam disponíveis. O explorador de arquivos e as
ferramentas de desenho são painéis do editor ativo, não novos navegadores globais.

O tema usa superfícies #101012 / #171719, texto #E5E3E4, texto secundário #AAA6AA
 e acento #C8515E. Vermelho destaca seleção, foco e ações principais, não cada
borda ou título. Cores semânticas de alerta/sucesso e cores existentes nos desenhos
são preservadas. Não há alteração retroativa da paleta dos documentos CAD.

A tela inicial deixou de repetir os módulos em cartões. O cabeçalho passou de
66 para 46 px; o navegador expandido ocupa 184 px e o recolhido 48 px. Retirados
a identificação de ambiente repetida e o botão Sair redundante com a janela nativa.
Ações continuam identificadas por texto acessível e atalhos; descrições longas
ficam em tooltips, não repetidas em cada linha do catálogo.

## CAD: organização e operações reais

A vista ocupa o centro. O inspetor à direita contém a árvore de objetos/camadas e
as propriedades da seleção, com seções recolhíveis. A largura é ajustável por
arraste ou teclado (272–420 px), persistida somente nas preferências locais.

- Árvore pesquisável, seleção sincronizada com a vista, nomes dos objetos e camadas.
- Nome do objeto e transferência para outra camada desbloqueada.
- Visibilidade e bloqueio individuais; bloqueio da camada continua prevalecendo.
- Coordenadas precisas em mm. Linhas também aceitam comprimento/ângulo; retângulos,
  posição/largura/altura. Círculos mantêm centro e raio com diâmetro medido.
- Translação X/Y e escala uniforme ao redor do centro. Duplicação com novo ID e
  deslocamento explícito de 10 mm. Não transforma retângulos em falsos sólidos 3D.
- Medições derivadas da geometria: comprimento/perímetro, área, largura, altura,
  diâmetro e ângulo quando aplicável. Nenhum valor é simulado.
- Camadas: criar, nomear, recolorir, ocultar, bloquear; remover somente quando vazias.
- Todas as operações passam pelo histórico existente de desfazer/refazer e pelo
  checkpoint local. Salvar continua explícito, com revisão SHA-256 do arquivo.
- Objetos ocultos não aparecem em SVG/DXF nem no snap ou nas métricas visíveis.
  Camadas ocultas preservam a semântica preexistente de camada desligada no DXF.

Metadados opcionais `name`, `visible` e `locked` são aditivos no schema v1. Arquivos
antigos continuam válidos. Nomes, tipos e limites são verificados no core e também
quando o documento é salvo. Nomes não são inseridos sem escape em SVG/DXF.

Não foi adicionada compatibilidade DWG, kernel 3D, cotas associativas, splines,
assemblies, constraint solver, BIM ou fabricação. Não chamar a versão de equivalente
a Blender/AutoCAD/Adobe ou de software comercial certificado.

## Engenharia e desempenho

`core/modules/cad/cad-edit.mjs` concentra comandos imutáveis de identidade,
transformação, dimensões e duplicação. `CadOutliner` e `CadInspector` são
componentes separados. O controlador mantém recuperação, gravação, importação,
undo/redo e seleção já existentes; o IPC privilegiado não ganhou capacidades novas.

A posição do cursor é publicada no máximo uma vez por animation frame em um store
local. Só a mira e a leitura de coordenadas se inscrevem nesse fluxo; mover o mouse
sem desenhar não reconstrói a árvore de objetos. Formas SVG têm memoização e a
lista de objetos visíveis usa índices por camada. Não inferir FPS ou RAM a partir
dessa mudança sem medição.

O limite de JS inicial da v0.7.6 (375.000 bytes) permanece. React Flow, Monaco e CAD
continuam carregados sob demanda. Sem nova biblioteca, servidor, rede ou dependência
runtime para tema, ícones, propriedades ou redimensionamento.

## Pesquisa de referência — 5 de novembro de 2026

| Fonte primária | Parte analisada | Decisão aplicada |
|---|---|---|
| Blender HIG — Editors | Regiões de editor, header, sidebar e contexto | Vista central dominante; controles pertencem ao editor; não repetir navegação global. |
| Blender Manual — Properties / Outliner | Propriedades contextuais e árvore de dados | Objetos/camadas acima de propriedades; seleção e identificação sincronizadas. |
| Adobe Illustrator — Properties panel overview | Controles conforme seleção e acesso progressivo | Campos numéricos, métricas específicas por forma e seções secundárias recolhidas. |
| three.js `editor/js/Sidebar.Object.js` | Código consultado: nome, identidade, posição e comandos de alteração | Operações imutáveis separadas da apresentação, integradas ao undo existente. Nenhum código copiado. |
| LibreCAD — repositório e documentação de dock widgets/property sheets | Separação de camadas, entidades e propriedades | Dimensões em unidades reais, validação e camadas com bloqueio explícito. Nenhuma engine incorporada. |
| Blender developer forum — UI meeting / toolbar-sidebar feedback | Trechos indexados sobre filtros, organização e duplicação | Evitar mais trilhos de ícones, novas barras flutuantes e comandos repetidos. |
| Blender oficial — Interface Overview, Blender 2.80 Fundamentals (YouTube) | Vídeo localizado; metadados consultados | Referência complementar histórica. Não foi possível reproduzir o vídeo aqui; não é evidência de teste nem de código revisado. |

Fontes:
- https://developer.blender.org/docs/features/interface/human_interface_guidelines/editors/
- https://docs.blender.org/manual/en/latest/editors/properties_editor.html
- https://docs.blender.org/manual/en/5.0/editors/outliner/interface.html
- https://helpx.adobe.com/illustrator/desktop/get-started/learn-the-basics/properties-panel-overview.html
- https://helpx.adobe.com/illustrator/desktop/get-started/learn-the-basics/workspace-overview.html
- https://github.com/mrdoob/three.js/blob/dev/editor/js/Sidebar.Object.js
- https://github.com/LibreCAD/LibreCAD
- https://github.com/LibreCAD/docs
- https://devtalk.blender.org/t/2025-04-22-user-interface-meeting/40168
- https://devtalk.blender.org/t/the-toolbar-sidebar-interface-issue/8704
- https://www.youtube.com/watch?v=8XyIYRW_2xk

Algumas páginas Blender e o player YouTube bloquearam leitura integral; onde isso
ocorreu, foram usados trechos indexados identificados acima, sem afirmar que todo
o conteúdo foi assistido ou revisado. O código three.js foi lido pelo conector GitHub.
Blender/Adobe/LibreCAD são referências de interação, não conteúdo distribuído na
aplicação. Não foram copiados assets, temas proprietários ou engines GPL.

## Evidência e gates

`tests/cad-studio.test.mjs`: metadados, persistência, bloqueios, transferência,
visibilidade/exportação, geometria numérica, limites, cópia e cursor coalescido.

`smoke:studio`: Electron real com DXF de teste, árvore e propriedades, renomeação,
dimensões, cópia, undo/redo, transformação, transferência de camada, bloqueio,
visibilidade, SVG, salvamento/reabertura e largura do inspetor. Capturas reais a
1440 e 1280 px. Interação do seletor nativo usa arquivo temporário conhecido;
operações do aplicativo e verificação de filesystem não são simuladas.

Os testes anteriores continuam obrigatórios, com atualização deliberada do teste
que antes exigia a barra de navegação duplicada. Não dispensar regressões de CAD,
Monaco, fluxos, agendamentos, Git, extensões, tarefas, checkpoint ou instalação.

Publicar somente após CI do mesmo HEAD, build + budget e teste Windows dos dois
pacotes. Executáveis continuam não assinados; aprovação de testes não garante
inexistência de defeitos. Revisão visual humana no equipamento final ainda é útil.
