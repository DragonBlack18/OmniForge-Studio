/** Research ledger, not a plugin installer. URLs are fixed first-party sources.
 * 'integrated' means an actual dependency/tool in this tree, never a visual mock.
 * The 150 entries retain the order of the original research catalogue.
 */
export const REFERENCE_STATUS = Object.freeze({
  integrated:'Integrado', reference:'Referência de produto', planned:'Planejado', alternative:'Alternativa em avaliação'
});
const groups = [
  ['automation','Automação','canvas',[
    ['n8n','n8n-io/n8n','Histórico por etapa, credenciais separadas e conectores versionados.','reference'],
    ['Node-RED','node-red/node-red','Subfluxos reutilizáveis e biblioteca de nós com contratos explícitos.','reference'],
    ['Activepieces','activepieces/activepieces','Avaliar catálogo de conectores e execução isolada por integração.'],
    ['Windmill','windmill-labs/windmill','Avaliar scripts versionados, formulários e filas; revisar termos dos componentes.','alternative'],
    ['Huginn','huginn/huginn','Agentes de monitoramento com persistência e deduplicação de eventos.'],
    ['Automatisch','automatisch/automatisch','Comparar autenticação e modelos de conectores.','alternative'],
    ['Kestra','kestra-io/kestra','Fluxos declarativos e retomada após falhas.','alternative'],
    ['Temporal TypeScript SDK','temporalio/sdk-typescript','Serviço separado para execução durável de longa duração.'],
    ['Trigger.dev','triggerdotdev/trigger.dev','Avaliar filas e reexecução de tarefas externas.','alternative'],
    ['Prefect','PrefectHQ/prefect','Adaptador Python para pipelines de dados.'],
    ['Apache Airflow','apache/airflow','Integração externa com DAGs; não embutir um servidor completo no desktop.','alternative'],
    ['Dagster','dagster-io/dagster','Rastrear dependências e proveniência de conjuntos de dados.','alternative']
  ]],
  ['canvas','Canvas e execução','canvas',[
    ['React Flow','xyflow/xyflow','Canvas atual: portas, seleção, reconexão, navegação e histórico de edição.','integrated','@xyflow/react@12.12.0'],
    ['Rete.js','retejs/rete','Comparar tipagem de portas e plugins de avaliação de grafos.','alternative'],
    ['LiteGraph.js','jagenjo/litegraph.js','Comparar canvas compacto para grafos extensos.','alternative'],
    ['bpmn-js','bpmn-io/bpmn-js','Módulo BPMN dedicado, com semântica própria de processos.'],
    ['ELK.js','kieler/elkjs','Organização topológica real em worker, cancelamento e desfazer atômico.','integrated','elkjs@0.12.1'],
    ['XState','statelyai/xstate','Máquinas de estados para operações longas e transições verificáveis.'],
    ['BullMQ','taskforcesh/bullmq','Fila externa dependente de Redis; requer instalação e observabilidade.'],
    ['Bree','breejs/bree','Comparar tarefas em worker com o agendador local existente.','alternative'],
    ['APScheduler','agronholm/apscheduler','Agendamento de trabalhos Python por adaptador próprio.'],
    ['node-cron','node-cron/node-cron','Comparar expressões de calendário com persistência do agendador atual.','alternative'],
    ['p-queue','sindresorhus/p-queue','Limitar concorrência de operações independentes.'],
    ['JSONata','jsonata-js/jsonata','Expressões de transformação com limites de tempo, memória e tamanho.']
  ]],
  ['rpa-ai','RPA e IA','canvas',[
    ['AutoHotkey','AutoHotkey/AutoHotkey','Adaptador Windows explícito para automações de teclado e janelas.'],
    ['pywinauto','pywinauto/pywinauto','Automação de aplicativos Windows com consentimento por ação.'],
    ['nut.js','nut-tree/nut.js','Avaliar automação desktop e distribuição dos binários.','alternative'],
    ['Robot Framework','robotframework/robotframework','Importar resultados e executar suítes por processo supervisionado.'],
    ['Puppeteer','puppeteer/puppeteer','Automação de navegador em processo separado e perfil dedicado.','alternative'],
    ['Selenium','SeleniumHQ/selenium','Adaptador para sessões WebDriver e relatórios de testes.','alternative'],
    ['RPA Framework','robocorp/rpaframework','Biblioteca Python de automação integrada por adaptadores delimitados.'],
    ['Flowise','FlowiseAI/Flowise','Referência de composição visual de IA; verificar manutenção antes de adotar.','reference'],
    ['Langflow','langflow-ai/langflow','Fluxos de IA com identificação de modelos, custos e credenciais.','alternative'],
    ['Dify','langgenius/dify','Avaliar aplicações de IA como serviço externo.','alternative'],
    ['LangGraph.js','langchain-ai/langgraphjs','Estado persistente e pausas explícitas em agentes.'],
    ['ComfyUI','Comfy-Org/ComfyUI','Adaptador local para geração de mídia e acompanhamento de jobs.']
  ]],
  ['ide','IDE','development',[
    ['VS Code','microsoft/vscode','Comandos, editor multiaba e painéis contextualizados; referência de experiência.','reference'],
    ['Eclipse Theia','eclipse-theia/theia','Avaliar plataforma IDE completa como alternativa arquitetural.','alternative'],
    ['Monaco','microsoft/monaco-editor','Editor real, diferenças, diagnósticos e ferramentas JavaScript/TypeScript.','integrated','monaco-editor@0.55.1','code'],
    ['monaco-languageclient','TypeFox/monaco-languageclient','Ponte para servidores de linguagem por transporte controlado.'],
    ['monaco-vscode-api','CodinGame/monaco-vscode-api','Avaliar serviços compatíveis sem prometer extensões universais.','alternative'],
    ['CodeMirror','codemirror/dev','Alternativa ao editor atual para superfícies menores.','alternative'],
    ['LSP','microsoft/language-server-protocol','Contratos de diagnósticos, símbolos, renomeação e cancelamento.'],
    ['DAP','microsoft/debug-adapter-protocol','Contrato de depuração com sessões, breakpoints e variáveis.'],
    ['Tree-sitter','tree-sitter/tree-sitter','Indexação incremental e navegação estrutural do código.'],
    ['Pyright','microsoft/pyright','Servidor de linguagem Python com ambiente e versão explicitamente selecionados.'],
    ['debugpy','microsoft/debugpy','Depuração Python com processo, portas locais e encerramento supervisionados.'],
    ['vscode-js-debug','microsoft/vscode-js-debug','Depuração Node via DAP, com testes de encerramento de sessão.'],
    ['xterm.js','xtermjs/xterm.js','Terminal real depende de PTY nativo; saída atual é console supervisionado.'],
    ['node-pty','microsoft/node-pty','PTY Windows/Linux: empacotar binários e controlar processo e ambiente.'],
    ['isomorphic-git','isomorphic-git/isomorphic-git','Alternativa para operações Git sem executável externo.','alternative'],
    ['simple-git','steveukx/git-js','Comparar camada Git com os comandos nativos delimitados atuais.','alternative'],
    ['ripgrep','BurntSushi/ripgrep','Busca indexada e cancelável em projetos grandes.'],
    ['Open VSX','eclipse-openvsx/openvsx','Registro de extensões somente após host e permissões compatíveis.'],
    ['VSCodium','VSCodium/vscodium','Referência de empacotamento e separação entre código e distribuição.','reference'],
    ['JupyterLab','jupyterlab/jupyterlab','Notebooks em serviço próprio, com kernels isolados e seleção de ambiente.']
  ]],
  ['layout','Layout','code',[
    ['Lumino','jupyterlab/lumino','Comparar docking e persistência de painéis.','alternative'],
    ['Dockview','mathuo/dockview','Avaliar abas encaixáveis mantendo recuperação e foco do editor.','alternative'],
    ['FlexLayout','caplin/FlexLayout','Alternativa de layout persistente com painéis desacoplados.','alternative'],
    ['Golden Layout','golden-layout/golden-layout','Comparar docking multiárea sem duplicar navegação.','alternative'],
    ['react-resizable-panels','bvaughn/react-resizable-panels','Comparar redimensionamento acessível com os separadores atuais.','alternative'],
    ['Radix UI','radix-ui/primitives','Avaliar primitivas compartilhadas antes de substituir componentes existentes.'],
    ['shadcn/ui','shadcn-ui/ui','Referência de composição de componentes; adaptar ao tema próprio.','reference'],
    ['React Spectrum','adobe/react-spectrum','Referência de foco, teclado e acessibilidade de controles complexos.','reference'],
    ['Floating UI','floating-ui/floating-ui','Posicionar menus e popovers com limites de viewport.'],
    ['cmdk','dip/cmdk','Comparar busca e comandos com a paleta atual.','alternative'],
    ['dnd-kit','clauderic/dnd-kit','Arrastar arquivos e ferramentas com alternativa por teclado.'],
    ['React Arborist','jameskerr/react-arborist','Árvore virtualizada de arquivos para workspaces extensos.']
  ]],
  ['documents','Propriedades e documentos','code',[
    ['JSON Forms','eclipsesource/jsonforms','Formulários gerados por schemas e erros associados aos campos.'],
    ['react-jsonschema-form','rjsf-team/react-jsonschema-form','Alternativa de formulário declarativo com validação real.','alternative'],
    ['Leva','pmndrs/leva','Comparar controles numéricos para parâmetros do viewport.','alternative'],
    ['Tweakpane','cocopon/tweakpane','Comparar painel compacto de parâmetros de desenho.','alternative'],
    ['Lexical','meta/lexical','Editor de documentação rica com formato versionado.'],
    ['Tiptap','ueberdosis/tiptap','Alternativa para documentação estruturada.','alternative'],
    ['Excalidraw','excalidraw/excalidraw','Quadro de arquitetura separado de fluxos executáveis.'],
    ['Penpot','penpot/penpot','Referência de desenho de interfaces e intercâmbio de assets.','reference'],
    ['tldraw','tldraw/tldraw','Avaliar canvas de desenho e condições de licença da versão escolhida.','alternative']
  ]],
  ['cad','CAD','cad',[
    ['OCCT','Open-Cascade-SAS/OCCT','Kernel B-rep para sólidos, operações booleanas e topologia.'],
    ['OpenCascade.js','donalffons/opencascade.js','Carregar kernel WASM sob demanda em worker dedicado.'],
    ['Replicad','sgenoud/replicad','Modelagem paramétrica por código sobre um kernel geométrico.'],
    ['Chili3D','xiangechen/chili3d','Referência de seleção, comandos e ferramentas CAD web.','reference'],
    ['FreeCAD','FreeCAD/FreeCAD','Referência de árvore paramétrica e bancadas; possível adaptador externo.','reference'],
    ['SolveSpace','solvespace/solvespace','Solver de restrições com indicação de conflitos e graus de liberdade.'],
    ['CadQuery','CadQuery/cadquery','Adaptador Python para gerar peças por código.'],
    ['build123d','gumyr/build123d','Alternativa Python para modelagem programática.','alternative'],
    ['OpenSCAD','openscad/openscad','Compilação externa de modelos CSG e captura de erros.'],
    ['CascadeStudio','zalo/CascadeStudio','Referência de editor e geração de peças por script.','reference'],
    ['JSCAD','jscad/OpenJSCAD.org','Modelagem CSG por JavaScript como motor alternativo.','alternative'],
    ['LibreCAD','LibreCAD/LibreCAD','Referência de CAD 2D, camadas, snaps e cotas.','reference'],
    ['QCAD','qcad/qcad','Referência de ferramentas 2D; separar Community e componentes comerciais.','reference'],
    ['Maker.js','microsoft/maker.js','Desenhos paramétricos 2D e modelos para fabricação.']
  ]],
  ['formats','Formatos','cad',[
    ['ezdxf','mozman/ezdxf','Adaptador Python para formatos DXF além do subconjunto local.'],
    ['dxf-parser','gdsestimating/dxf-parser','Leitura estrutural DXF com validação planar, limites e recusas explícitas.','integrated','dxf-parser@1.1.2'],
    ['dxf-viewer','vagran/dxf-viewer','Visualizador DXF amplo separado do editor de entidades suportadas.'],
    ['libdxfrw','LibreCAD/libdxfrw','Avaliar intercâmbio CAD em processo nativo.','alternative'],
    ['occt-import-js','kovacsv/occt-import-js','Importação STEP/IGES após definir kernel e convenções de unidade.'],
    ['Online 3D Viewer','kovacsv/Online3DViewer','Referência de importação e inspeção de modelos.','reference'],
    ['Assimp','assimp/assimp','Conversão de malhas com relatório de perda de informação.']
  ]],
  ['render','Renderização','cad',[
    ['Three.js','mrdoob/three.js','Viewport 3D, seleção e descarte explícito de recursos GPU.'],
    ['Babylon.js','BabylonJS/Babylon.js','Motor alternativo de viewport 3D.','alternative'],
    ['three-mesh-bvh','gkjohnson/three-mesh-bvh','Aceleração de seleção em malhas grandes.'],
    ['Manifold','elalish/manifold','Booleanas de malhas com validação de topologia.'],
    ['CGAL','CGAL/cgal','Algoritmos geométricos nativos; escolher módulos e licenças.','alternative'],
    ['Clipper2','AngusJohnson/Clipper2','Offset e união robusta de polígonos 2D.'],
    ['Trimesh','mikedh/trimesh','Análise Python de malhas, volume e estanqueidade.'],
    ['Blender','blender/blender','Referência de workspace, ferramentas contextuais e processamento externo.','reference'],
    ['Konva','konvajs/konva','Comparar renderização 2D com o SVG técnico atual.','alternative'],
    ['Fabric.js','fabricjs/fabric.js','Alternativa para composição gráfica não paramétrica.','alternative']
  ]],
  ['manufacturing','CAM e BIM','cad',[
    ['CuraEngine','Ultimaker/CuraEngine','Fatiamento externo com perfis, simulação e validação do resultado.'],
    ['PrusaSlicer','prusa3d/PrusaSlicer','Alternativa de fatiamento e geração de G-code.','alternative'],
    ['OpenCAMLib','aewallin/opencamlib','Cálculo de trajetórias com unidade e ferramenta explicitamente definidas.'],
    ['Kiri:Moto','GridSpace/grid-apps','Referência de fabricação no navegador.','reference'],
    ['IfcOpenShell','IfcOpenShell/IfcOpenShell','Adaptador para leitura IFC e propriedades BIM.'],
    ['web-ifc','ThatOpen/engine_web-ifc','Leitura IFC em WASM, fora da thread de interface.'],
    ['That Open Components','ThatOpen/engine_components','Seleção, classificação e inspeção de componentes BIM.'],
    ['xeokit','xeokit/xeokit-sdk','Alternativa de viewport BIM; revisar termos do SDK.','alternative']
  ]],
  ['data','Dados e desempenho','canvas',[
    ['better-sqlite3','WiseLibs/better-sqlite3','Dados locais SQLite em processo dedicado, com migrações e backup.'],
    ['DuckDB','duckdb/duckdb','Consultas analíticas locais e importação de conjuntos de dados.'],
    ['TanStack Table','TanStack/table','Inspeção de dados tabulares com ordenação, filtros e colunas tipadas.'],
    ['TanStack Virtual','TanStack/virtual','Virtualização de tabelas e logs extensos.'],
    ['ExcelJS','exceljs/exceljs','Importação e exportação XLSX com limites de tamanho.'],
    ['PapaParse','mholt/PapaParse','CSV real nos nós de dados; código vendorizado com licença preservada.','integrated','core/vendor/papaparse.cjs'],
    ['PDF.js','mozilla/pdf.js','Leitor de documentos PDF sem executar conteúdo arbitrário.'],
    ['Zod','colinhacks/zod','Schemas tipados para contratos entre módulos.'],
    ['Ajv','ajv-validator/ajv','Validação de JSON Schema como alternativa ao subconjunto atual.','alternative'],
    ['Bruno','usebruno/bruno','Referência de coleções locais e testes de API.','reference'],
    ['DbGate','dbgate/dbgate','Referência de exploração de bancos com credenciais separadas.','reference'],
    ['Piscina','piscinajs/piscina','Pool limitado de workers para cargas independentes.'],
    ['Comlink','GoogleChromeLabs/comlink','Avaliar RPC tipado para workers com cancelamento e transferência.']
  ]],
  ['quality','Testes e qualidade',null,[
    ['Playwright','microsoft/playwright','Testes Electron reais e evidências de interface em CI.','integrated','playwright-core@1.56.1'],
    ['Vitest','vitest-dev/vitest','Avaliar testes de componentes; testes core usam node:test atualmente.','alternative'],
    ['React Testing Library','testing-library/react-testing-library','Testes focados no comportamento acessível dos componentes.'],
    ['fast-check','dubzzz/fast-check','Propriedades de grafos, geometria, serialização e revisões.'],
    ['MSW','mswjs/msw','Falhas de rede determinísticas em testes de integrações.'],
    ['axe-core','dequelabs/axe-core','Auditoria automatizada de acessibilidade complementar ao teclado.'],
    ['Storybook','storybookjs/storybook','Catálogo de estados de controles sem simular capacidades executáveis.'],
    ['Pixelmatch','mapbox/pixelmatch','Comparação visual com tolerâncias e revisão de evidências.'],
    ['dependency-cruiser','sverweij/dependency-cruiser','Impedir imports cruzados e ciclos entre módulos.'],
    ['Pino','pinojs/pino','Logs estruturados com política de redação e retenção.'],
    ['OpenTelemetry','open-telemetry/opentelemetry-js','Observabilidade opcional local; não ativar envio remoto implícito.'],
    ['Gitleaks','gitleaks/gitleaks','Detecção de segredos em alterações e artefatos de release.'],
    ['OSV-Scanner','google/osv-scanner','Auditoria das versões realmente instaladas.'],
    ['Electron Fuses','electron/fuses','Fuses verificadas na configuração e nos binários empacotados.','integrated','build.electronFuses'],
    ['electron-builder','electron-userland/electron-builder','Empacotamento Windows NSIS/portable e manifesto de release.','integrated','electron-builder@26.18.0']
  ]],
  ['guides','Guias',null,[
    ['Blender Design Paradigms','https://developer.blender.org/docs/features/interface/design_paradigms/','Referência de bancadas e ferramentas contextuais.','reference'],
    ['Autodesk Fusion Interface','https://help.autodesk.com/view/fusion360/ENU/','Referência de ferramentas de engenharia por contexto; sem copiar código proprietário.','reference'],
    ['Adobe Spectrum','https://spectrum.adobe.com/','Referência de estados, foco, densidade e componentes.','reference'],
    ['VS Code UX','https://code.visualstudio.com/api/ux-guidelines/overview','Referência de padrões para comandos, painéis e extensões.','reference'],
    ['Electron Performance','https://www.electronjs.org/docs/latest/tutorial/performance','Carregamento sob demanda e medidas de inicialização.','reference'],
    ['Node-RED Embedding','https://nodered.org/docs/user-guide/runtime/embedding','Avaliar incorporação de runtime separado e suas fronteiras.','reference']
  ]]
];
let nextId=0;
export const REFERENCE_GROUPS=Object.freeze(groups.map(([id,label])=>Object.freeze({id,label})));
export const REFERENCE_CATALOG=Object.freeze(groups.flatMap(([group,category,target,entries])=>entries.map(
  ([name,source,proposal,status='planned',evidence=null,override])=>Object.freeze({
    id:++nextId,name,group,category,target:override??target,proposal,status,evidence,
    url:source.startsWith('https://')?source:'https://github.com/'+source
  })
)));
const normalize=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
export function filterReferences({query='',group='all',status='all'}={}) {
  const tokens=normalize(query).trim().slice(0,160).split(/\s+/).filter(Boolean);
  return REFERENCE_CATALOG.filter(row=>(group==='all'||row.group===group)&&(status==='all'||row.status===status)&&
    tokens.every(token=>normalize(`${row.name} ${row.category} ${row.proposal} ${row.evidence??''}`).includes(token)));
}
export function referenceSource(id) {
  if (!Number.isInteger(id)) throw new TypeError('Referência inválida.');
  const reference=REFERENCE_CATALOG.find(row=>row.id===id);
  if(!reference)throw new RangeError('Referência não encontrada.');
  return reference.url;
}
