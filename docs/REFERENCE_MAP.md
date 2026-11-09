# Mapa das 150 referências

Gerado por `npm run verify:references` a partir do mesmo catálogo exibido no aplicativo. Para regenerar: `node scripts/generate-reference-map.mjs`.

O estado **Integrado** identifica um componente efetivamente utilizado, incluindo ferramentas de teste/build. **Referência de produto** orienta a experiência. **Planejado** descreve uma possibilidade ainda indisponível. **Alternativa em avaliação** concorre com outra solução para a mesma função. Não são 150 dependências instaladas.

## Automação

| Nº | Fonte | Estado | Aplicação / decisão | Evidência |
|---|---|---|---|---|
| 1 | [n8n](https://github.com/n8n-io/n8n) | Referência de produto | Histórico por etapa, credenciais separadas e conectores versionados. | Próxima etapa / referência |
| 2 | [Node-RED](https://github.com/node-red/node-red) | Referência de produto | Subfluxos reutilizáveis e biblioteca de nós com contratos explícitos. | Próxima etapa / referência |
| 3 | [Activepieces](https://github.com/activepieces/activepieces) | Planejado | Avaliar catálogo de conectores e execução isolada por integração. | Próxima etapa / referência |
| 4 | [Windmill](https://github.com/windmill-labs/windmill) | Alternativa em avaliação | Avaliar scripts versionados, formulários e filas; revisar termos dos componentes. | Próxima etapa / referência |
| 5 | [Huginn](https://github.com/huginn/huginn) | Planejado | Agentes de monitoramento com persistência e deduplicação de eventos. | Próxima etapa / referência |
| 6 | [Automatisch](https://github.com/automatisch/automatisch) | Alternativa em avaliação | Comparar autenticação e modelos de conectores. | Próxima etapa / referência |
| 7 | [Kestra](https://github.com/kestra-io/kestra) | Alternativa em avaliação | Fluxos declarativos e retomada após falhas. | Próxima etapa / referência |
| 8 | [Temporal TypeScript SDK](https://github.com/temporalio/sdk-typescript) | Planejado | Serviço separado para execução durável de longa duração. | Próxima etapa / referência |
| 9 | [Trigger.dev](https://github.com/triggerdotdev/trigger.dev) | Alternativa em avaliação | Avaliar filas e reexecução de tarefas externas. | Próxima etapa / referência |
| 10 | [Prefect](https://github.com/PrefectHQ/prefect) | Planejado | Adaptador Python para pipelines de dados. | Próxima etapa / referência |
| 11 | [Apache Airflow](https://github.com/apache/airflow) | Alternativa em avaliação | Integração externa com DAGs; não embutir um servidor completo no desktop. | Próxima etapa / referência |
| 12 | [Dagster](https://github.com/dagster-io/dagster) | Alternativa em avaliação | Rastrear dependências e proveniência de conjuntos de dados. | Próxima etapa / referência |

## Canvas e execução

| Nº | Fonte | Estado | Aplicação / decisão | Evidência |
|---|---|---|---|---|
| 13 | [React Flow](https://github.com/xyflow/xyflow) | Integrado | Canvas atual: portas, seleção, reconexão, navegação e histórico de edição. | @xyflow/react@12.12.0 |
| 14 | [Rete.js](https://github.com/retejs/rete) | Alternativa em avaliação | Comparar tipagem de portas e plugins de avaliação de grafos. | Próxima etapa / referência |
| 15 | [LiteGraph.js](https://github.com/jagenjo/litegraph.js) | Alternativa em avaliação | Comparar canvas compacto para grafos extensos. | Próxima etapa / referência |
| 16 | [bpmn-js](https://github.com/bpmn-io/bpmn-js) | Planejado | Módulo BPMN dedicado, com semântica própria de processos. | Próxima etapa / referência |
| 17 | [ELK.js](https://github.com/kieler/elkjs) | Integrado | Organização topológica real em worker, cancelamento e desfazer atômico. | elkjs@0.12.1 |
| 18 | [XState](https://github.com/statelyai/xstate) | Planejado | Máquinas de estados para operações longas e transições verificáveis. | Próxima etapa / referência |
| 19 | [BullMQ](https://github.com/taskforcesh/bullmq) | Planejado | Fila externa dependente de Redis; requer instalação e observabilidade. | Próxima etapa / referência |
| 20 | [Bree](https://github.com/breejs/bree) | Alternativa em avaliação | Comparar tarefas em worker com o agendador local existente. | Próxima etapa / referência |
| 21 | [APScheduler](https://github.com/agronholm/apscheduler) | Planejado | Agendamento de trabalhos Python por adaptador próprio. | Próxima etapa / referência |
| 22 | [node-cron](https://github.com/node-cron/node-cron) | Alternativa em avaliação | Comparar expressões de calendário com persistência do agendador atual. | Próxima etapa / referência |
| 23 | [p-queue](https://github.com/sindresorhus/p-queue) | Planejado | Limitar concorrência de operações independentes. | Próxima etapa / referência |
| 24 | [JSONata](https://github.com/jsonata-js/jsonata) | Planejado | Expressões de transformação com limites de tempo, memória e tamanho. | Próxima etapa / referência |

## RPA e IA

| Nº | Fonte | Estado | Aplicação / decisão | Evidência |
|---|---|---|---|---|
| 25 | [AutoHotkey](https://github.com/AutoHotkey/AutoHotkey) | Planejado | Adaptador Windows explícito para automações de teclado e janelas. | Próxima etapa / referência |
| 26 | [pywinauto](https://github.com/pywinauto/pywinauto) | Planejado | Automação de aplicativos Windows com consentimento por ação. | Próxima etapa / referência |
| 27 | [nut.js](https://github.com/nut-tree/nut.js) | Alternativa em avaliação | Avaliar automação desktop e distribuição dos binários. | Próxima etapa / referência |
| 28 | [Robot Framework](https://github.com/robotframework/robotframework) | Planejado | Importar resultados e executar suítes por processo supervisionado. | Próxima etapa / referência |
| 29 | [Puppeteer](https://github.com/puppeteer/puppeteer) | Alternativa em avaliação | Automação de navegador em processo separado e perfil dedicado. | Próxima etapa / referência |
| 30 | [Selenium](https://github.com/SeleniumHQ/selenium) | Alternativa em avaliação | Adaptador para sessões WebDriver e relatórios de testes. | Próxima etapa / referência |
| 31 | [RPA Framework](https://github.com/robocorp/rpaframework) | Planejado | Biblioteca Python de automação integrada por adaptadores delimitados. | Próxima etapa / referência |
| 32 | [Flowise](https://github.com/FlowiseAI/Flowise) | Referência de produto | Referência de composição visual de IA; verificar manutenção antes de adotar. | Próxima etapa / referência |
| 33 | [Langflow](https://github.com/langflow-ai/langflow) | Alternativa em avaliação | Fluxos de IA com identificação de modelos, custos e credenciais. | Próxima etapa / referência |
| 34 | [Dify](https://github.com/langgenius/dify) | Alternativa em avaliação | Avaliar aplicações de IA como serviço externo. | Próxima etapa / referência |
| 35 | [LangGraph.js](https://github.com/langchain-ai/langgraphjs) | Planejado | Estado persistente e pausas explícitas em agentes. | Próxima etapa / referência |
| 36 | [ComfyUI](https://github.com/Comfy-Org/ComfyUI) | Planejado | Adaptador local para geração de mídia e acompanhamento de jobs. | Próxima etapa / referência |

## IDE

| Nº | Fonte | Estado | Aplicação / decisão | Evidência |
|---|---|---|---|---|
| 37 | [VS Code](https://github.com/microsoft/vscode) | Referência de produto | Comandos, editor multiaba e painéis contextualizados; referência de experiência. | Próxima etapa / referência |
| 38 | [Eclipse Theia](https://github.com/eclipse-theia/theia) | Alternativa em avaliação | Avaliar plataforma IDE completa como alternativa arquitetural. | Próxima etapa / referência |
| 39 | [Monaco](https://github.com/microsoft/monaco-editor) | Integrado | Editor real, diferenças, diagnósticos e ferramentas JavaScript/TypeScript. | monaco-editor@0.55.1 |
| 40 | [monaco-languageclient](https://github.com/TypeFox/monaco-languageclient) | Planejado | Ponte para servidores de linguagem por transporte controlado. | Próxima etapa / referência |
| 41 | [monaco-vscode-api](https://github.com/CodinGame/monaco-vscode-api) | Alternativa em avaliação | Avaliar serviços compatíveis sem prometer extensões universais. | Próxima etapa / referência |
| 42 | [CodeMirror](https://github.com/codemirror/dev) | Alternativa em avaliação | Alternativa ao editor atual para superfícies menores. | Próxima etapa / referência |
| 43 | [LSP](https://github.com/microsoft/language-server-protocol) | Planejado | Contratos de diagnósticos, símbolos, renomeação e cancelamento. | Próxima etapa / referência |
| 44 | [DAP](https://github.com/microsoft/debug-adapter-protocol) | Planejado | Contrato de depuração com sessões, breakpoints e variáveis. | Próxima etapa / referência |
| 45 | [Tree-sitter](https://github.com/tree-sitter/tree-sitter) | Planejado | Indexação incremental e navegação estrutural do código. | Próxima etapa / referência |
| 46 | [Pyright](https://github.com/microsoft/pyright) | Planejado | Servidor de linguagem Python com ambiente e versão explicitamente selecionados. | Próxima etapa / referência |
| 47 | [debugpy](https://github.com/microsoft/debugpy) | Planejado | Depuração Python com processo, portas locais e encerramento supervisionados. | Próxima etapa / referência |
| 48 | [vscode-js-debug](https://github.com/microsoft/vscode-js-debug) | Planejado | Depuração Node via DAP, com testes de encerramento de sessão. | Próxima etapa / referência |
| 49 | [xterm.js](https://github.com/xtermjs/xterm.js) | Planejado | Terminal real depende de PTY nativo; saída atual é console supervisionado. | Próxima etapa / referência |
| 50 | [node-pty](https://github.com/microsoft/node-pty) | Planejado | PTY Windows/Linux: empacotar binários e controlar processo e ambiente. | Próxima etapa / referência |
| 51 | [isomorphic-git](https://github.com/isomorphic-git/isomorphic-git) | Alternativa em avaliação | Alternativa para operações Git sem executável externo. | Próxima etapa / referência |
| 52 | [simple-git](https://github.com/steveukx/git-js) | Alternativa em avaliação | Comparar camada Git com os comandos nativos delimitados atuais. | Próxima etapa / referência |
| 53 | [ripgrep](https://github.com/BurntSushi/ripgrep) | Planejado | Busca indexada e cancelável em projetos grandes. | Próxima etapa / referência |
| 54 | [Open VSX](https://github.com/eclipse-openvsx/openvsx) | Planejado | Registro de extensões somente após host e permissões compatíveis. | Próxima etapa / referência |
| 55 | [VSCodium](https://github.com/VSCodium/vscodium) | Referência de produto | Referência de empacotamento e separação entre código e distribuição. | Próxima etapa / referência |
| 56 | [JupyterLab](https://github.com/jupyterlab/jupyterlab) | Planejado | Notebooks em serviço próprio, com kernels isolados e seleção de ambiente. | Próxima etapa / referência |

## Layout

| Nº | Fonte | Estado | Aplicação / decisão | Evidência |
|---|---|---|---|---|
| 57 | [Lumino](https://github.com/jupyterlab/lumino) | Alternativa em avaliação | Comparar docking e persistência de painéis. | Próxima etapa / referência |
| 58 | [Dockview](https://github.com/mathuo/dockview) | Alternativa em avaliação | Avaliar abas encaixáveis mantendo recuperação e foco do editor. | Próxima etapa / referência |
| 59 | [FlexLayout](https://github.com/caplin/FlexLayout) | Alternativa em avaliação | Alternativa de layout persistente com painéis desacoplados. | Próxima etapa / referência |
| 60 | [Golden Layout](https://github.com/golden-layout/golden-layout) | Alternativa em avaliação | Comparar docking multiárea sem duplicar navegação. | Próxima etapa / referência |
| 61 | [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels) | Alternativa em avaliação | Comparar redimensionamento acessível com os separadores atuais. | Próxima etapa / referência |
| 62 | [Radix UI](https://github.com/radix-ui/primitives) | Planejado | Avaliar primitivas compartilhadas antes de substituir componentes existentes. | Próxima etapa / referência |
| 63 | [shadcn/ui](https://github.com/shadcn-ui/ui) | Referência de produto | Referência de composição de componentes; adaptar ao tema próprio. | Próxima etapa / referência |
| 64 | [React Spectrum](https://github.com/adobe/react-spectrum) | Referência de produto | Referência de foco, teclado e acessibilidade de controles complexos. | Próxima etapa / referência |
| 65 | [Floating UI](https://github.com/floating-ui/floating-ui) | Planejado | Posicionar menus e popovers com limites de viewport. | Próxima etapa / referência |
| 66 | [cmdk](https://github.com/dip/cmdk) | Alternativa em avaliação | Comparar busca e comandos com a paleta atual. | Próxima etapa / referência |
| 67 | [dnd-kit](https://github.com/clauderic/dnd-kit) | Planejado | Arrastar arquivos e ferramentas com alternativa por teclado. | Próxima etapa / referência |
| 68 | [React Arborist](https://github.com/jameskerr/react-arborist) | Planejado | Árvore virtualizada de arquivos para workspaces extensos. | Próxima etapa / referência |

## Propriedades e documentos

| Nº | Fonte | Estado | Aplicação / decisão | Evidência |
|---|---|---|---|---|
| 69 | [JSON Forms](https://github.com/eclipsesource/jsonforms) | Planejado | Formulários gerados por schemas e erros associados aos campos. | Próxima etapa / referência |
| 70 | [react-jsonschema-form](https://github.com/rjsf-team/react-jsonschema-form) | Alternativa em avaliação | Alternativa de formulário declarativo com validação real. | Próxima etapa / referência |
| 71 | [Leva](https://github.com/pmndrs/leva) | Alternativa em avaliação | Comparar controles numéricos para parâmetros do viewport. | Próxima etapa / referência |
| 72 | [Tweakpane](https://github.com/cocopon/tweakpane) | Alternativa em avaliação | Comparar painel compacto de parâmetros de desenho. | Próxima etapa / referência |
| 73 | [Lexical](https://github.com/meta/lexical) | Planejado | Editor de documentação rica com formato versionado. | Próxima etapa / referência |
| 74 | [Tiptap](https://github.com/ueberdosis/tiptap) | Alternativa em avaliação | Alternativa para documentação estruturada. | Próxima etapa / referência |
| 75 | [Excalidraw](https://github.com/excalidraw/excalidraw) | Planejado | Quadro de arquitetura separado de fluxos executáveis. | Próxima etapa / referência |
| 76 | [Penpot](https://github.com/penpot/penpot) | Referência de produto | Referência de desenho de interfaces e intercâmbio de assets. | Próxima etapa / referência |
| 77 | [tldraw](https://github.com/tldraw/tldraw) | Alternativa em avaliação | Avaliar canvas de desenho e condições de licença da versão escolhida. | Próxima etapa / referência |

## CAD

| Nº | Fonte | Estado | Aplicação / decisão | Evidência |
|---|---|---|---|---|
| 78 | [OCCT](https://github.com/Open-Cascade-SAS/OCCT) | Planejado | Kernel B-rep para sólidos, operações booleanas e topologia. | Próxima etapa / referência |
| 79 | [OpenCascade.js](https://github.com/donalffons/opencascade.js) | Planejado | Carregar kernel WASM sob demanda em worker dedicado. | Próxima etapa / referência |
| 80 | [Replicad](https://github.com/sgenoud/replicad) | Planejado | Modelagem paramétrica por código sobre um kernel geométrico. | Próxima etapa / referência |
| 81 | [Chili3D](https://github.com/xiangechen/chili3d) | Referência de produto | Referência de seleção, comandos e ferramentas CAD web. | Próxima etapa / referência |
| 82 | [FreeCAD](https://github.com/FreeCAD/FreeCAD) | Referência de produto | Referência de árvore paramétrica e bancadas; possível adaptador externo. | Próxima etapa / referência |
| 83 | [SolveSpace](https://github.com/solvespace/solvespace) | Planejado | Solver de restrições com indicação de conflitos e graus de liberdade. | Próxima etapa / referência |
| 84 | [CadQuery](https://github.com/CadQuery/cadquery) | Planejado | Adaptador Python para gerar peças por código. | Próxima etapa / referência |
| 85 | [build123d](https://github.com/gumyr/build123d) | Alternativa em avaliação | Alternativa Python para modelagem programática. | Próxima etapa / referência |
| 86 | [OpenSCAD](https://github.com/openscad/openscad) | Planejado | Compilação externa de modelos CSG e captura de erros. | Próxima etapa / referência |
| 87 | [CascadeStudio](https://github.com/zalo/CascadeStudio) | Referência de produto | Referência de editor e geração de peças por script. | Próxima etapa / referência |
| 88 | [JSCAD](https://github.com/jscad/OpenJSCAD.org) | Alternativa em avaliação | Modelagem CSG por JavaScript como motor alternativo. | Próxima etapa / referência |
| 89 | [LibreCAD](https://github.com/LibreCAD/LibreCAD) | Referência de produto | Referência de CAD 2D, camadas, snaps e cotas. | Próxima etapa / referência |
| 90 | [QCAD](https://github.com/qcad/qcad) | Referência de produto | Referência de ferramentas 2D; separar Community e componentes comerciais. | Próxima etapa / referência |
| 91 | [Maker.js](https://github.com/microsoft/maker.js) | Planejado | Desenhos paramétricos 2D e modelos para fabricação. | Próxima etapa / referência |

## Formatos

| Nº | Fonte | Estado | Aplicação / decisão | Evidência |
|---|---|---|---|---|
| 92 | [ezdxf](https://github.com/mozman/ezdxf) | Planejado | Adaptador Python para formatos DXF além do subconjunto local. | Próxima etapa / referência |
| 93 | [dxf-parser](https://github.com/gdsestimating/dxf-parser) | Integrado | Leitura estrutural DXF com validação planar, limites e recusas explícitas. | dxf-parser@1.1.2 |
| 94 | [dxf-viewer](https://github.com/vagran/dxf-viewer) | Planejado | Visualizador DXF amplo separado do editor de entidades suportadas. | Próxima etapa / referência |
| 95 | [libdxfrw](https://github.com/LibreCAD/libdxfrw) | Alternativa em avaliação | Avaliar intercâmbio CAD em processo nativo. | Próxima etapa / referência |
| 96 | [occt-import-js](https://github.com/kovacsv/occt-import-js) | Planejado | Importação STEP/IGES após definir kernel e convenções de unidade. | Próxima etapa / referência |
| 97 | [Online 3D Viewer](https://github.com/kovacsv/Online3DViewer) | Referência de produto | Referência de importação e inspeção de modelos. | Próxima etapa / referência |
| 98 | [Assimp](https://github.com/assimp/assimp) | Planejado | Conversão de malhas com relatório de perda de informação. | Próxima etapa / referência |

## Renderização

| Nº | Fonte | Estado | Aplicação / decisão | Evidência |
|---|---|---|---|---|
| 99 | [Three.js](https://github.com/mrdoob/three.js) | Planejado | Viewport 3D, seleção e descarte explícito de recursos GPU. | Próxima etapa / referência |
| 100 | [Babylon.js](https://github.com/BabylonJS/Babylon.js) | Alternativa em avaliação | Motor alternativo de viewport 3D. | Próxima etapa / referência |
| 101 | [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) | Planejado | Aceleração de seleção em malhas grandes. | Próxima etapa / referência |
| 102 | [Manifold](https://github.com/elalish/manifold) | Planejado | Booleanas de malhas com validação de topologia. | Próxima etapa / referência |
| 103 | [CGAL](https://github.com/CGAL/cgal) | Alternativa em avaliação | Algoritmos geométricos nativos; escolher módulos e licenças. | Próxima etapa / referência |
| 104 | [Clipper2](https://github.com/AngusJohnson/Clipper2) | Planejado | Offset e união robusta de polígonos 2D. | Próxima etapa / referência |
| 105 | [Trimesh](https://github.com/mikedh/trimesh) | Planejado | Análise Python de malhas, volume e estanqueidade. | Próxima etapa / referência |
| 106 | [Blender](https://github.com/blender/blender) | Referência de produto | Referência de workspace, ferramentas contextuais e processamento externo. | Próxima etapa / referência |
| 107 | [Konva](https://github.com/konvajs/konva) | Alternativa em avaliação | Comparar renderização 2D com o SVG técnico atual. | Próxima etapa / referência |
| 108 | [Fabric.js](https://github.com/fabricjs/fabric.js) | Alternativa em avaliação | Alternativa para composição gráfica não paramétrica. | Próxima etapa / referência |

## CAM e BIM

| Nº | Fonte | Estado | Aplicação / decisão | Evidência |
|---|---|---|---|---|
| 109 | [CuraEngine](https://github.com/Ultimaker/CuraEngine) | Planejado | Fatiamento externo com perfis, simulação e validação do resultado. | Próxima etapa / referência |
| 110 | [PrusaSlicer](https://github.com/prusa3d/PrusaSlicer) | Alternativa em avaliação | Alternativa de fatiamento e geração de G-code. | Próxima etapa / referência |
| 111 | [OpenCAMLib](https://github.com/aewallin/opencamlib) | Planejado | Cálculo de trajetórias com unidade e ferramenta explicitamente definidas. | Próxima etapa / referência |
| 112 | [Kiri:Moto](https://github.com/GridSpace/grid-apps) | Referência de produto | Referência de fabricação no navegador. | Próxima etapa / referência |
| 113 | [IfcOpenShell](https://github.com/IfcOpenShell/IfcOpenShell) | Planejado | Adaptador para leitura IFC e propriedades BIM. | Próxima etapa / referência |
| 114 | [web-ifc](https://github.com/ThatOpen/engine_web-ifc) | Planejado | Leitura IFC em WASM, fora da thread de interface. | Próxima etapa / referência |
| 115 | [That Open Components](https://github.com/ThatOpen/engine_components) | Planejado | Seleção, classificação e inspeção de componentes BIM. | Próxima etapa / referência |
| 116 | [xeokit](https://github.com/xeokit/xeokit-sdk) | Alternativa em avaliação | Alternativa de viewport BIM; revisar termos do SDK. | Próxima etapa / referência |

## Dados e desempenho

| Nº | Fonte | Estado | Aplicação / decisão | Evidência |
|---|---|---|---|---|
| 117 | [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | Planejado | Dados locais SQLite em processo dedicado, com migrações e backup. | Próxima etapa / referência |
| 118 | [DuckDB](https://github.com/duckdb/duckdb) | Planejado | Consultas analíticas locais e importação de conjuntos de dados. | Próxima etapa / referência |
| 119 | [TanStack Table](https://github.com/TanStack/table) | Planejado | Inspeção de dados tabulares com ordenação, filtros e colunas tipadas. | Próxima etapa / referência |
| 120 | [TanStack Virtual](https://github.com/TanStack/virtual) | Planejado | Virtualização de tabelas e logs extensos. | Próxima etapa / referência |
| 121 | [ExcelJS](https://github.com/exceljs/exceljs) | Planejado | Importação e exportação XLSX com limites de tamanho. | Próxima etapa / referência |
| 122 | [PapaParse](https://github.com/mholt/PapaParse) | Integrado | CSV real nos nós de dados; código vendorizado com licença preservada. | core/vendor/papaparse.cjs |
| 123 | [PDF.js](https://github.com/mozilla/pdf.js) | Planejado | Leitor de documentos PDF sem executar conteúdo arbitrário. | Próxima etapa / referência |
| 124 | [Zod](https://github.com/colinhacks/zod) | Planejado | Schemas tipados para contratos entre módulos. | Próxima etapa / referência |
| 125 | [Ajv](https://github.com/ajv-validator/ajv) | Alternativa em avaliação | Validação de JSON Schema como alternativa ao subconjunto atual. | Próxima etapa / referência |
| 126 | [Bruno](https://github.com/usebruno/bruno) | Referência de produto | Referência de coleções locais e testes de API. | Próxima etapa / referência |
| 127 | [DbGate](https://github.com/dbgate/dbgate) | Referência de produto | Referência de exploração de bancos com credenciais separadas. | Próxima etapa / referência |
| 128 | [Piscina](https://github.com/piscinajs/piscina) | Planejado | Pool limitado de workers para cargas independentes. | Próxima etapa / referência |
| 129 | [Comlink](https://github.com/GoogleChromeLabs/comlink) | Planejado | Avaliar RPC tipado para workers com cancelamento e transferência. | Próxima etapa / referência |

## Testes e qualidade

| Nº | Fonte | Estado | Aplicação / decisão | Evidência |
|---|---|---|---|---|
| 130 | [Playwright](https://github.com/microsoft/playwright) | Integrado | Testes Electron reais e evidências de interface em CI. | playwright-core@1.56.1 |
| 131 | [Vitest](https://github.com/vitest-dev/vitest) | Alternativa em avaliação | Avaliar testes de componentes; testes core usam node:test atualmente. | Próxima etapa / referência |
| 132 | [React Testing Library](https://github.com/testing-library/react-testing-library) | Planejado | Testes focados no comportamento acessível dos componentes. | Próxima etapa / referência |
| 133 | [fast-check](https://github.com/dubzzz/fast-check) | Planejado | Propriedades de grafos, geometria, serialização e revisões. | Próxima etapa / referência |
| 134 | [MSW](https://github.com/mswjs/msw) | Planejado | Falhas de rede determinísticas em testes de integrações. | Próxima etapa / referência |
| 135 | [axe-core](https://github.com/dequelabs/axe-core) | Planejado | Auditoria automatizada de acessibilidade complementar ao teclado. | Próxima etapa / referência |
| 136 | [Storybook](https://github.com/storybookjs/storybook) | Planejado | Catálogo de estados de controles sem simular capacidades executáveis. | Próxima etapa / referência |
| 137 | [Pixelmatch](https://github.com/mapbox/pixelmatch) | Planejado | Comparação visual com tolerâncias e revisão de evidências. | Próxima etapa / referência |
| 138 | [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) | Planejado | Impedir imports cruzados e ciclos entre módulos. | Próxima etapa / referência |
| 139 | [Pino](https://github.com/pinojs/pino) | Planejado | Logs estruturados com política de redação e retenção. | Próxima etapa / referência |
| 140 | [OpenTelemetry](https://github.com/open-telemetry/opentelemetry-js) | Planejado | Observabilidade opcional local; não ativar envio remoto implícito. | Próxima etapa / referência |
| 141 | [Gitleaks](https://github.com/gitleaks/gitleaks) | Planejado | Detecção de segredos em alterações e artefatos de release. | Próxima etapa / referência |
| 142 | [OSV-Scanner](https://github.com/google/osv-scanner) | Planejado | Auditoria das versões realmente instaladas. | Próxima etapa / referência |
| 143 | [Electron Fuses](https://github.com/electron/fuses) | Integrado | Fuses verificadas na configuração e nos binários empacotados. | build.electronFuses |
| 144 | [electron-builder](https://github.com/electron-userland/electron-builder) | Integrado | Empacotamento Windows NSIS/portable e manifesto de release. | electron-builder@26.18.0 |

## Guias

| Nº | Fonte | Estado | Aplicação / decisão | Evidência |
|---|---|---|---|---|
| 145 | [Blender Design Paradigms](https://developer.blender.org/docs/features/interface/design_paradigms/) | Referência de produto | Referência de bancadas e ferramentas contextuais. | Próxima etapa / referência |
| 146 | [Autodesk Fusion Interface](https://help.autodesk.com/view/fusion360/ENU/) | Referência de produto | Referência de ferramentas de engenharia por contexto; sem copiar código proprietário. | Próxima etapa / referência |
| 147 | [Adobe Spectrum](https://spectrum.adobe.com/) | Referência de produto | Referência de estados, foco, densidade e componentes. | Próxima etapa / referência |
| 148 | [VS Code UX](https://code.visualstudio.com/api/ux-guidelines/overview) | Referência de produto | Referência de padrões para comandos, painéis e extensões. | Próxima etapa / referência |
| 149 | [Electron Performance](https://www.electronjs.org/docs/latest/tutorial/performance) | Referência de produto | Carregamento sob demanda e medidas de inicialização. | Próxima etapa / referência |
| 150 | [Node-RED Embedding](https://nodered.org/docs/user-guide/runtime/embedding) | Referência de produto | Avaliar incorporação de runtime separado e suas fronteiras. | Próxima etapa / referência |
