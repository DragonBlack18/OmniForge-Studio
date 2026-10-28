# Pesquisa técnica e decisão de integração — OmniForge Studio

**Data:** 2026-10-28 · **Objetivo:** combinar IDE, automação, CAD e engenharia, sem copiar código sob licença inadequada.

## Projetos analisados

| Referência | Uso proposto | Licença observada / cuidado |
|---|---|---|
| [Eclipse Theia](https://theia-ide.org/docs/extensions/) / [Open VSX](https://projects.eclipse.org/projects/ecd.openvsx) | Host da futura IDE completa, LSP, debugging e extensões | Framework Eclipse; avaliar cobertura de APIs das extensões e licenças de cada plugin |
| [React Flow](https://reactflow.dev/) | Canvas atual de automação com nós e portas | MIT; já utilizado na aplicação |
| [Node-RED](https://github.com/node-red/node-red) | Referência para fluxo de mensagens e catálogo de nós | Apache-2.0; integração posterior mediante contrato, não copiar motor |
| [n8n](https://docs.n8n.io/sustainable-use-license/) | Referência funcional do produto (gatilhos, runs, credenciais, retries) | Sustainable Use License é **source-available**, não open source OSI; não embutir como runtime distribuído sem direito de uso |
| [LibreCAD](https://github.com/LibreCAD/LibreCAD) | Referência para UX 2D, layers, DXF e snapping | GPLv2; inspiração de interação, **código não incorporado** |
| [Open CAD Studio](https://www.open-aec.com/en/open-cad-studio/) | Referência CAD 2D/3D e fluxo de engenharia | GPL-3.0; não copiar e não acoplar ao binário sem análise de obrigações |
| [FreeCAD](https://github.com/FreeCAD/FreeCAD) | Arquitetura paramétrica, solver, histórico de features, STEP | LGPL-2.1+ no código próprio; dependências adicionais exigem revisão |
| [JSCAD](https://github.com/jscad/OpenJSCAD.org) | Modelagem paramétrica por JavaScript, CSG e exportação | MIT (salvo exceções por pacote); candidato a engine no worker futuro |
| [Bitbybit](https://github.com/bitbybit-dev/bitbybit) | CAD node-based usando OCCT, Three.js, Manifold | Componentes de software MIT em diretórios especificados no projeto; examinar licença de cada pacote/asset |
| [OpenCascade.js](https://github.com/donalffons/opencascade.js) | Kernel BRep para operação real de sólidos via WebAssembly | Revisar licenças OCCT, ports WASM, build e redistribuição antes da adoção |
| [cadview](https://github.com/wiscaksono/cadview) | Visualizar DXF em JavaScript no futuro | Core MIT, pacote DWG separado GPL-3.0 |

## Decisões arquiteturais

1. **Não colar repositórios**: criar módulos independentes, contratos versionados e interfaces estáveis. Novo núcleo CAD 2D da versão 0.2.0 é código original em `core/cad2d.mjs`.
2. **Não chamar de AutoCAD**: o CAD Sketch 2D atual oferece desenho geométrico e exportação DXF R12/SVG; não importa DWG, não oferece solver de restrições, cotagem normativa nem sólidos 3D.
3. **Seis domínios separados**: workbench/IDE, automação executável, grafo de arquitetura, modelagem geométrica, IA/agents e OT/industrial. Eles se conectam por tipos explícitos e eventos versionados.
4. **CAD 3D futuro**: avaliar JSCAD para geometria por código e Bitbybit/OCCT para BRep, isolados em workers; benchmark de memória/latência antes de escolher.
5. **Theia futuro**: substituir/integrar o Monaco atual por IDEAdapter sem acoplar motor de automação a widgets internos.
6. **Sem segurança por aparência**: botão ou grafo não garantem comportamento. Cada conector exige execução real, evidência, limites, revogação, falhas e testes adversariais.
7. **Propriedade e licença**: repositório original do OmniForge continua com `UNLICENSED` e não contém cópia de motores GPL/n8n; decidir política de distribuição com assessor jurídico antes de vendê-lo.

## Escopos e gates futuros

- 0.2.1: executor supervisionado fora do processo Electron (timeout/kill, eventos, crash-recovery).
- 0.2.2: plugin SDK declarativo, pacote assinado/verificado e permissões por capability.
- 0.3: agendamento/webhooks locais persistentes, retries e idempotência.
- 0.4: gestão de credenciais, HTTP(S) com allowlists, provedores de e-mail e integrações de produtividade.
- 0.5: Eclipse Theia + Open VSX (integração real, sem prometer 100% de compatibilidade).
- 0.6: grafo arquitetural alimentado por parsers AST, dependências e vínculos de testes.
- 0.7: agente de IA para criar/testar fluxos e CAD com aprovações explícitas.
- 0.8: CAD 3D por kernel geométrico e exportação STEP/STL quando comprovado.
- 0.9: leitura industrial OT isolada com avaliação de segurança funcional prévia.

**Nota:** versões futuras são planejamento. Nenhuma implementação presente deve receber o selo de pronto sem demonstrar o gate correspondente.
