# Validação técnica — OmniForge Studio 0.1.1

Em 2026-10-28 foi executado `npm test` com Node v22.16.0 em Linux.

## Evidência local

- **28/28 testes PASS** com `node --test` (motor, grafo, workspace e concorrência otimista de documentos).
- `node --check` passou para `electron/main.cjs`, `electron/preload.cjs` e `scripts/smoke-electron.mjs`.
- A revisão SHA-256 foi validada em teste de leitura, atualização, erro de revisão obsoleta e arquivo de recuperação.
- Nenhum endpoint de rede do usuário foi contatado pelos testes.

## Verificação no GitHub Actions (28/10/2026)

- [CI bem-sucedida, commit `d33f7e5`](https://github.com/DragonBlack18/OmniForge-Studio/actions/runs/40718369348): **28/28 testes Node em Linux e Windows PASS**; build de produção Vite no Linux PASS; Electron E2E no Windows PASS.
- O smoke Electron Windows inicia de fato a interface construída para produção, seleciona uma pasta temporária, salva o fluxo, simula, executa, verifica o JSON escrito, lê código, reinicia e verifica persistência.
- [Workflow de empacotamento](https://github.com/DragonBlack18/OmniForge-Studio/actions/workflows/windows-build.yml): gera instalador NSIS e executável portátil x64 sem assinatura; conferir resultado e arquivos de cada execução antes de distribuir.

## Riscos / gates de distribuição

- Executáveis `.exe` ainda **não são assinados digitalmente**; possíveis alertas SmartScreen.
- Pipeline de empacotamento e instalação em computadores reais devem ser verificados por release.
- Ainda não existe `package-lock.json`; o CI utiliza versões de dependência diretas no `package.json` com `npm install`.
- Motor restrito a três nós; **não** foi validado para executar scripts de terceiros, rede, e-mail, IA, CAD ou protocolos industriais.
- Proibido classificar como pronto para produção industrial apenas com testes de CI.
