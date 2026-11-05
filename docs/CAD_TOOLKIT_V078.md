# OmniForge Studio v0.7.8 — Operações técnicas de CAD 2D

## Objetivo e interface

A v0.7.8 amplia as operações da geometria real do CAD 2D sem inserir um
segundo menu global. As ferramentas de desenho permanecem no trilho interno
da vista. Operações sobre um objeto selecionado ficam em uma seção **Operações
geométricas** recolhida por padrão, com um seletor contextual para mostrar
apenas os campos da operação em uso. O tema grafite/preto e vermelho da v0.7.7,
a árvore, o inspetor redimensionável e os demais módulos são preservados.

A referência não é a quantidade de botões, mas a organização da tarefa.

## Operações implementadas (não simuladas)

| Operação | Comportamento, limites e resultado |
|---|---|
| Rotacionar | Linha em qualquer ângulo finito; círculo em torno do centro ou origem; retângulo em múltiplos de 90°, porque o schema v1 é alinhado aos eixos. Mantém ID e camada. |
| Espelhar | Eixo horizontal (X) ou vertical (Y), passando pelo centro do objeto ou origem global. Mantém tipo, ID e atributos. |
| Criar paralela | Somente linha; cria segmento independente a distância positiva em milímetros, à esquerda/direita segundo a orientação A→B. |
| Matriz retangular | Repete um objeto com linhas/colunas e passo X/Y. Original em [0,0], até 64 cópias por operação, novo ID para cada cópia, validação atômica. |
| Medir distância | Dois pontos na vista, com snap opcional. Mostra distância, ΔX, ΔY e ângulo; não cria geometria, não marca o desenho como editado e não grava. |

O módulo puro `core/modules/cad/cad-toolkit.mjs` é responsável por cálculos,
validação e transações imutáveis. O React somente solicita a operação. Todas as
edições passam pelo mesmo histórico de **desfazer/refazer**, checkpoint local e
`saveCadSketch` já existentes. Arquivos de terceiros DXF importados são
preservados, e não há alteração automática no disco.

### Invariantes e recusas

- Documento CAD **schemaVersion:1**, `units:'mm'`, IDs, camadas e cores mantidos.
- Limite de 2.000 objetos e coordenadas dentro de ±1.000.000 mm.
- Objetos/camadas bloqueados ou ocultos não podem receber transformações.
- Entradas não numéricas, NaN, Infinity, IDs duplicados, cópias excessivas e
  geometria fora dos limites são recusados antes de devolver novo documento.
- A operação de matriz produz documento inteiro válido ou falha sem alterar o
  desenho original. A UI só registra uma etapa de undo por operação.
- Retângulos não são polígonos arbitrariamente giráveis no schema atual;
  **não** aproximar ou converter silenciosamente uma rotação de 45°.
- Rotação, espelhamento, paralela e matriz não introduzem novos processos,
  permissões IPC, rede, plugins executáveis, nem dependências npm.

## Referências pesquisadas

1. [QCAD User Manual](https://qcad.org/en/manual/): menu `Modify` com
   Rotate, Mirror, Move/Copy, Scale e Offset; a organização é orientada por
   operação na seleção, com parâmetros numéricos.
2. [LibreCAD Drawing Tools](https://docs.librecad.org/en/latest/ref/tools.html):
   ferramentas Info para distância, diferença cartesiana, ângulo e comprimento.
3. [LibreCAD Animated Tutorials](https://dokuwiki.librecad.org/doku.php/usage:animated):
   `Mouse`, `Command-line` e `Tool-option` por comando; preservar contexto local.
4. [FreeCAD Sketcher](https://github.com/FreeCAD/FreeCAD-documentation/blob/main/wiki/Sketcher_Workbench.md):
   precisão geométrica e dimensional; diferenciar medição livre de *constraints*.
5. [Blender Interface](https://docs.blender.org/manual/en/latest/interface/index.html):
   região central como superfície de trabalho, painel de propriedades contextual.

Não foi copiado código, ícone ou motor desses projetos. Integração de um kernel
CAD paramétrico/3D exigirá desenho de contrato separado e análise de licença.

## Validação exigida

- `npm test` Linux/Windows, incluindo `tests/cad-toolkit.test.mjs` para
  rotações, matrizes, locks, offsets, geometria válida, saída SVG/DXF,
  métricas e salvamento/releitura com proteção contra revisões externas.
- Build Vite e orçamento da entrada JS/CSS sem carregar CAD na Home.
- `npm run smoke:cad-toolkit` Electron Windows com DXF real, operador contextual,
  matriz, undo/redo, medição não destrutiva, persistência e reabertura.
- Regresso completo: `smoke:studio`, IDE, Git, automações, CAD DXF, recuperação,
  extensões, tarefas, scheduler e benchmark.
- Setup/Portable Windows instalados e executados, SHA-256 verificado antes de
  integrar à `main` e publicar a release.

**Limitações:** permanece CAD 2D com linha, círculo e retângulo. Ainda não há
restrições associativas, solver paramétrico, arcos, splines, cotas persistentes,
3D, DWG, BIM ou equivalência ao AutoCAD, Blender e FreeCAD. A ausência de falhas
na suíte não garante a ausência de defeitos no uso real.
