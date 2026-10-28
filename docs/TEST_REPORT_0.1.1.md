# Validação técnica — OmniForge Studio 0.1.1

Em 2026-10-28 foi executado `npm test` com Node v22.16.0 em Linux.

## Evidência local

- **28/28 testes PASS** com `node --test` (motor, grafo, workspace e concorrência otimista de documentos).
- `node --check` passou para `electron/main.cjs`, `electron/preload.cjs` e `scripts/smoke-electron.mjs`.
- A revisão SHA-256 foi validada em teste de leitura, atualização, erro de revisão obsoleta e arquivo de recuperação.
- Nenhum endpoint de rede do usuário foi contatado pelos testes.

## Gates ainda pendentes

- `npm install` e build React/Vite: este ambiente não teve acesso DNS ao registry npm.
- Smoke Electron Windows **não executado localmente**; será executado pelo workflow GitHub Actions no Windows.
- Empacotamento NSIS e portátil **não executado localmente**; o workflow Windows realiza esta validação antes de publicar artefatos não assinados.
- Ainda não foi gerado um `package-lock.json`; não utilizar `npm ci` sem lock.

Não classificar como release pronto para produção até todos os gates aplicáveis passarem. O escopo permanece restrito ao motor inicial.
