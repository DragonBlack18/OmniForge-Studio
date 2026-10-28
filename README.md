# OmniForge Studio

**v0.2.0 (candidato de integração)** · Plataforma desktop experimental para automação visual, edição de código, integração local de projetos e **CAD Sketch 2D**.

Desenvolvedor: **Davi Brand** · Código-fonte: [DragonBlack18/OmniForge-Studio](https://github.com/DragonBlack18/OmniForge-Studio).

## Recursos que realmente funcionam

| Módulo | Entrega atual | Observação |
|---|---|---|
| Automação | 57 nós executáveis (inclui 2 blocos CAD), canvas React Flow, 6 templates, validação, simulação, execução e histórico | Gatilho manual; não é o n8n completo |
| Programação | Editor Monaco para arquivos existentes, destaque por extensão, proteção contra overwrite | Não é um host de extensões do VS Code |
| Projetos | Catálogo local e troca de workspace sem copiar ou excluir pastas de origem | Registro no perfil de usuário |
| APIs | GET/POST JSON em 127.0.0.1, contratos JSON tipados, aprovação antes de request | Não expõe conectores arbitrários ou credenciais |
| Engenharia 2D | Novo CAD Sketch 2D em milímetros com linha, retângulo, círculo, grade, camadas, medidas e DXF/SVG | Não é CAD paramétrico 3D |
| Desktop | Electron com isolamento de contexto, IPC restrito, créditos, NSIS e portátil Windows x64 | Pré-lançamento; binários sem assinatura digital |

Não estão implementados: IA generativa nativa, agentes, Theia/Open VSX, terminal/depurador, plugins de código não confiável, 3D paramétrico, CAD DWG, robótica, protocolos industriais, gatilhos webhooks/agendados e automações de e-mail prontas.

## Instalação de desenvolvimento

Use **Node.js 22.12+** e uma pasta de projeto de testes.

```powershell
npm install
npm test
npm run dev
```

Na inicialização, abra um workspace. O motor salva automações em `.omniforge/flows/`, logs em `.omniforge/run-history/` e o CAD em `.omniforge/cad/`. Não exclua essas pastas ao atualizar o aplicativo.

Para testar só o motor:

```powershell
npm run demo:core
```

Para construir Windows (ambiente preparado com as dependências necessárias):

```powershell
npm run dist:win
```

A integração contínua precisa aprovar testes Node Linux/Windows, build Vite, Electron E2E e abertura/fechamento do portátil e Setup antes de publicar binários em [Releases](https://github.com/DragonBlack18/OmniForge-Studio/releases).

## Estrutura do código

```text
core/                    modelo de grafos, execução, arquivos, CAD 2D, APIs e projetos
electron/                janela, ciclo de vida, IPC autorizado, preload
src/App.jsx             orquestra workspaces, automações e navegação
src/components/         overview e módulo CAD isolados
scripts/                demonstração do núcleo e smoke Windows
.github/workflows/      CI, distribuição e publicação dos executáveis
tests/                  testes independentes do renderer
docs/                   decisões, pesquisa open source, segurança e entregas
```

## Documentação

- [CAD Sketch 2D — escopo, segurança e limites](docs/V0.2.0_CAD_SKETCH.md)
- [Pesquisa de repositórios abertos, direitos de uso e integrações futuras](docs/OPEN_SOURCE_RESEARCH_2026-10-28.md)
- [Arquitetura por domínios](docs/ARCHITECTURE.md)
- [Modelo de segurança](docs/SECURITY.md)
- [Histórico das entregas](CHANGELOG.md)

## Uso responsável e limitações

- Este repositório é público, mas o projeto ainda tem licença de pacote `UNLICENSED`; isso não é uma licença open source de redistribuição de código próprio.
- Não foram importados/copied os códigos de FreeCAD, LibreCAD, JSCAD, n8n ou Bitbybit. As referências estão documentadas para análise e eventual integração licenciada.
- O aplicativo é **pré-lançamento**, não foi certificado para fabricação ou controle industrial. Uma release compilada não garante instalação ou atualização segura em todas as máquinas.
- A versão portátil não é totalmente isolada do perfil do usuário: o catálogo de projetos segue os dados por usuário do Electron. Os documentos de cada projeto ficam em suas próprias pastas.
