# Escopo de produto — decisões para a expansão após v0.8.1

O direcionamento do usuário foi seguir as recomendações apresentadas para
as sete decisões. Este documento registra intenção de produto, não afirma
que todas as integrações já foram entregues.

| Decisão | Direção aprovada | Situação desta implementação |
|---|---|---|
| Produtos independentes | Projetos web/APIs e executáveis Windows gerados devem funcionar sem o OmniForge | Requisito; empacotador de projetos ainda não implementado |
| Linguagens | JavaScript/TypeScript e Python primeiro, com edição, execução, testes e depuração | v0.8.2: documentos e serviços semânticos JS/TS locais. Python permanece edição; execução/depuração pendentes |
| CAD | Engenharia mecânica: peças, máquinas e precisão geométrica | CAD 2D existente preservado; kernel 3D e restrições ainda pendentes |
| Integrações | APIs, bancos e arquivos; navegador em módulo separado | Base de fluxos/HTTP local existente preservada; ampliação pendente |
| Node-RED | Compatibilidade opcional por adaptador, sem substituir fluxos nativos | Não instalado/embutido nesta fase |
| Serviço independente | Automação continua sem interface somente após ativação explícita | Requisito; não foi criado serviço/daemon nesta fase |
| Distribuição comercial | Preservar código próprio reservado e avaliar cada componente/licença | UNLICENSED preservado; sem incorporar engines com licença incompatível |

## Importante: visibilidade não é licença

O repositório GitHub consultado nesta etapa está **público**. O campo
`license: UNLICENSED` em package.json não oculta o código. Nenhuma alteração
de visibilidade, permissão, custo, credencial de assinatura ou plano de
serviço foi feita. Tornar o repositório privado exige decisão administrativa
separada; cópias já públicas não são recolhidas automaticamente.

## Integrações e fronteiras

- Monaco Editor (MIT), já fixado em 0.55.1, fornece modelos, undo/redo,
  revisão visual e serviços JS/TS. A integração é por APIs públicas.
- FlexLayout (MIT) é candidato a docking posterior, não foi instalado
  apenas para acrescentar abas. Preservar o layout v0.8.1 já testado.
- LSP/DAP, xterm.js/node-pty, Node-RED e kernel CAD devem ter contratos,
  supervisão e revisão de dependências próprios. Nenhum foi anunciado como
  disponível apenas porque seu código é público.
- Um terminal ou worker com permissões da conta do usuário NÃO é sandbox.
- A licença da biblioteca de integração não substitui a licença do motor
  subjacente ou de nós/plugins adicionais.

Referências primárias consultadas em 2026-11-08:
- https://github.com/microsoft/monaco-editor
- https://github.com/microsoft/monaco-editor/blob/main/CHANGELOG.md
- https://github.com/caplin/FlexLayout
- https://github.com/microsoft/node-pty
- https://github.com/microsoft/vscode-js-debug
- https://github.com/microsoft/debugpy
- https://nodered.org/docs/user-guide/runtime/embedding
- https://github.com/sgenoud/replicad
- https://github.com/donalffons/opencascade.js

Nada neste documento constitui auditoria jurídica ou de vulnerabilidades
concluída. Atribuições e obrigações devem ser conferidas nas versões
concretas antes de cada incorporação e distribuição.
