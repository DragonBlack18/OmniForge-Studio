# OmniForge Studio v0.6.1 — Organização modular e desempenho

## Baseline

Build de produção v0.6.0 (commit fee52c7): JavaScript inicial de **4.251.260 bytes** (gzip 1.112,58 KB). O renderer carregava Monaco, Web Workers de linguagem, React Flow, CAD e painéis através do mesmo App.jsx. O processo principal importava todas as exports de core/index.mjs na inicialização.

Este valor mede bytes de bundle. Não é medição de RAM, FPS ou tempo até interação.

## Estrutura canônica

    electron/
      main.cjs             janela, IPC e scheduler
      preload.cjs          capacidade permitida ao renderer
    core/
      host.mjs             importações dinâmicas sob demanda
      index.mjs            API pública de compatibilidade
      supervisor.mjs       executor controlado compartilhado
      run-child.cjs        processo filho declarativo
      modules/
        automation/        DAG, runner, nós, templates
        cad/               geometria, DXF, documentos
        ide/               busca e Git local
        integrations/      HTTP local, contratos API
        extensions/        contratos OFX, permissões
        scheduling/        agenda local, recuperação
        workspace/         arquivos, projetos, histórico
    src/
      App.jsx              entrada mínima
      workbench/           AppShell, navegação e visão geral
      shared/              ícones originais simples
      modules/
        automation/        FlowCanvas, ScheduleCenter
        cad/               CadWorkbench
        ide/               CodeEditor, Git, Search
        extensions/        ExtensionsHub

n8n, VS Code e AutoCAD são referências de experiência de usuário, **não** código-fonte incorporado. Automação e CAD são motores próprios; esta versão não hospeda VSIX, scripts não confiáveis, 3D paramétrico, DWG nem protocolos industriais.

## Contratos entre domínios

- Cada módulo visual depende só de componentes compartilhados e do seu domínio backend, nunca de outro módulo visual.
- O shell é o coordenador da navegação, do estado compartilhado e das operações IPC permitidas.
- Os serviços canônicos ficam em core/modules. Imports entre domínios são explícitos e testados por allowlist.
- Antigos arquivos core/catalog.mjs, core/workspace.mjs e equivalentes permanecem como fachadas de reexportação. Não colocar implementações novas nos aliases.
- O host Electron carrega Git, CAD e serviços IDE somente na operação relevante. Catálogo, validação do grafo e agendador permanecem prontamente disponíveis para preservar contratos.
- O executor e o preload continuam controlando a fronteira de permissões; nenhum renderer ganha acesso direto a Node.js.

## O que carrega quando

- CodeEditor importa Monaco e seus cinco Web Workers apenas quando um arquivo é aberto. A Home não importa Monaco.
- FlowCanvas é importado quando o usuário abre a automação. Hooks de estado do React Flow permanecem no shell para não alterar semânticas de drag, seleção e conexão. Ainda há peso do React Flow na entrada estática.
- CAD é montado na primeira visita e fica montado, porém oculto, ao mudar de módulo, preservando edições não salvas e undo/redo. A chave do workspace permanece associada ao desenho.
- Git, agenda, extensões e busca são carregados conforme navegação, com desmontagem como na versão anterior.

## Proteção de desempenho

O build Vite gera dist/.vite/manifest.json. scripts/check-bundle-budget.mjs soma todos os arquivos JavaScript e CSS dos imports **estáticos** da entrada; importações dinâmicas não entram nesse custo inicial. Gate:

- JS inicial no máximo 1.900.000 bytes.
- CSS inicial no máximo 300.000 bytes.
- CodeEditor, CadWorkbench e FlowCanvas devem ser chunks dinâmicos.

Métricas reais devem acompanhar a build. Tamanho de bundle não garante latência, RAM ou FPS. A instrumentação posterior precisa comparar startup frio, navegação entre módulos, processamento do grafo e CAD com documentos grandes no hardware de destino.

## Persistência e regressões

Não há alteração no schema dos fluxos, arquivos CAD, perfil, banco de projetos ou scheduler. A pasta .omniforge permanece no workspace, dados globais ficam em userData, revisões SHA-256 e trava de operações são mantidas. Nenhuma migração destrutiva, limpeza de diretórios ou reset.

Validação obrigatória: Node Linux/Windows, fronteiras arquiteturais, Vite, orçamento, Electron de automações/CAD/extensões/Git/IDE/scheduler, instalação Portable/NSIS e hashes dos executáveis. Um check pendente bloqueia integração e publicação.

## Próximas etapas

Integração de terminal e tarefas locais, LSP/depuração, extensões executáveis e IA demandará isolamento, permissões, análise de licença, cancelamento, controle de processo e gates de segurança próprios. Não declarar produção industrial até concluir controles OT dedicados.

Referências de engenharia: Electron Performance (https://www.electronjs.org/docs/latest/tutorial/performance), Vite Build (https://vite.dev/guide/build) e VS Code Source Code Organization (https://github.com/microsoft/vscode/wiki/Source-Code-Organization).
