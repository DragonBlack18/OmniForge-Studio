---
version: alpha
name: "OmniForge Studio"
description: "Bancada pessoal de desenvolvimento, automação e desenho técnico com superfícies grafite e acentos vermelhos."
colors:
  background: "#101012"
  surface: "#171719"
  elevated: "#222225"
  border: "#2c2c30"
  border-strong: "#444449"
  foreground: "#e5e3e4"
  muted: "#aaa6aa"
  subtle: "#918b93"
  primary: "#c8515e"
  selected: "#302025"
  focus: "#df7d87"
typography:
  sans:
    fontFamily: "Inter, Segoe UI, Arial, sans-serif"
  mono:
    fontFamily: "Consolas, ui-monospace, monospace"
rounded:
  DEFAULT: "4px"
  panel: "6px"
  dialog: "8px"
spacing:
  toolbar-height: "49px"
  navigation-width: "184px"
  inspector-width: "278px"
components:
  button: {}
  input: {}
  dialog: {}
  table: {}
---

# OmniForge Studio — design do produto

## Overview

A referência concreta é uma bancada de ferramentas de engenharia: a área de trabalho fica no centro, cada módulo apresenta ferramentas próprias nas laterais e a navegação global aparece uma vez. O registro é de produto desktop, em português brasileiro, para uso pessoal descrito pelo proprietário do repositório. Não há mercado comercial ou suporte móvel declarado.

A identidade já estabelecida em `docs/STUDIO_UX_V077.md` e `src/studio.css` permanece: grafite fosco, bordas discretas e vermelho para seleção e ação. Editor de código, canvas de automação e CAD têm gestos e ferramentas próprios. Evitar telas promocionais, estatísticas fictícias e botões que sugerem capacidades ainda não implementadas.

**Fonte dos tokens:** modelo B. `src/studio.css` é canônico; este arquivo documenta os valores reais. `src/style.css` fornece a base tipográfica. Novos módulos consomem `--of-*`; não introduzem uma paleta concorrente.

## Colors

`background` → `--of-bg`; `surface` → `--of-panel`; `elevated` → `--of-elevated`; `border` / `border-strong` → `--of-border` / `--of-border-strong`; `foreground` → `--of-ink`; `muted` / `subtle` → `--of-muted` / `--of-subtle`; `primary` → `--of-accent`; `selected` → `--of-accent-soft`; `focus` → `--of-focus`.

O estado é expresso também por texto, ícone ou atributo semântico. “Integrado”, “Planejado”, sucesso, erro e cancelamento nunca dependem somente de cor. O tema atual é escuro; não há promessa de tema claro nesta versão.

## Typography

Preservar a pilha existente, sem baixar fontes. Segoe UI é o fallback usual no Windows. Rótulos compactos usam 11–13 px, títulos de painel 13–19 px; código, saídas e identificadores usam monospace. Textos longos quebram linha; valores técnicos permanecem selecionáveis. O corpo explicativo usa entrelinha de aproximadamente 1,55–1,65. Evitar transformar instruções completas em caixa alta.

## Layout

Janela desktop mínima: 1040 × 680 no processo nativo. Verificar também 1280 × 900 e 1440 × 900. Navegação expandida padrão 184 px, recolhida 48 px, barra superior 46 px. Painéis de editor respeitam `src/workbench/layout/layout-model.mjs` e seus limites adaptativos. Não introduzir navegação duplicada nos módulos.

O catálogo possui filtros acima de uma tabela rolável e detalhes laterais. O módulo de desenvolvimento separa arquivo, ação, argumentos e saída. No CAD, ferramentas numéricas e propriedades pertencem ao inspetor. Caixas de resultado possuem limites e rolagem, mantendo ações acessíveis. A central de referências é carregada sob demanda, assim como editor, CAD e worker de organização dos fluxos.

Na v0.11.0, o terminal ocupa uma superfície contínua de texto com ações de
sessão acima, preservando espaço para comandos. O tamanho do PTY acompanha
o painel; ocultar o módulo não encerra o processo. O SQLite separa esquema
lateral, editor SQL, resultado tabular rolável e destino da cópia. Em janelas
menores, a área mantém rolagem própria e controles acessíveis. Cotas CAD
permanecem no inspetor existente e no desenho, sem uma segunda navegação.

## Elevation & Depth

Hierarquia por superfície, borda e espaço. Sombras ficam restritas a overlays e nós. O diálogo compartilhado usa backdrop escuro e limita sua altura à janela. Tabelas usam cabeçalho fixo no próprio contêiner; nada cobre a navegação global.

## Shapes

Botões e campos: raio de 4 px. Painéis: 6 px. Confirmações: 8 px. Ícones lineares existentes de `NavGlyph` usam traço de 1,65 e tamanhos 15–18 px; adicionar apenas símbolos coerentes ao conjunto.

## Components

Botões compartilham `.button`, `.button--solid` e `.button--subtle`. Foco usa contorno visível; ações indisponíveis têm `disabled` e uma explicação. Em andamento, manter rótulo e geometria estáveis, com `aria-busy` quando apropriado. Recursos planejados ficam explicitamente indisponíveis, sem sucesso simulado.

Selects nativos são uma escolha mantida para o desktop: o sistema operacional controla popup e teclado. Confirmações editoriais usam `ConfirmationDialog` e `confirmAction`, com Cancelar como foco inicial, Escape e restauração do foco. Consentimentos para execução de código, escrita nativa e fechamento permanecem no processo Electron. Textareas de propriedades não expõem alça de redimensionamento; suas superfícies rolam conforme necessário.

O status global pertence ao `AppShell` e usa live region discreta. Erros recuperáveis permanecem junto à operação. Filtros sem resultados apresentam explicação e limpeza. Não aplicar animações decorativas aos resultados. Transições existentes de aproximadamente 120 ms são desativadas com `prefers-reduced-motion`.

No xterm, os atalhos de teclado pertencem ao shell enquanto o terminal tem
foco. Existe opção de suporte a leitor de tela e ação explícita para copiar
seleção. A saída do processo não abre links ou escreve no clipboard. No
SQLite, Ctrl+Enter consulta; alterações e salvar cópia têm ações distintas.
Campos numéricos de cotas preservam a entrada inválida, exibem o erro junto
ao campo e focam o primeiro erro após a submissão. O Outliner permite
selecionar geometria por teclado para operar o inspetor.

## Do's and Don'ts

- Preservar buffers, histórico de edição, revisões e cópias recuperáveis ao navegar.
- Mostrar a ferramenta adequada ao módulo e o efeito concreto de cada ação.
- Manter fonte oficial, versão e estado de adoção separados no catálogo.
- Não afirmar que uma integração incorpora o produto inteiro de origem.
- Mostrar terminal, SQLite e cotas locais com seus limites atuais; manter depurador, solver entre objetos, kernel 3D, CAM e BIM indisponíveis até sua integração e seus testes.
