# Relatório de validação inicial — 2026-10-28

## Ambiente disponível

- Sistema de execução: contêiner Linux, Node.js 22.16.0, npm 10.9.2, git 2.47.3.
- Internet de registro npm indisponível (`EAI_AGAIN` ao consultar registry.npmjs.org).
- Sem execução do shell Electron em Windows, sem instalação de dependências npm para UI.

## Evidência técnica local

| Verificação | Resultado | Evidência |
|---|---|---|
| `npm test` | PASS — 24/24 testes | Node built-in test runner |
| `npm run demo:core` | PASS | Executou 3 nós e gravou JSON real em pasta temporária |
| `node --check electron/main.cjs` | PASS | Parser Node |
| `node --check electron/preload.cjs` | PASS | Parser Node |
| JSX `src/App.jsx`, `src/main.jsx` | PASS (somente parse) | TypeScript compiler API disponível localmente |
| `npm install` | NÃO EXECUTADO | Registro npm inacessível no contêiner |
| `npm run build` | NÃO EXECUTADO | Dependências de UI não instaladas |
| `npm run dev` | NÃO EXECUTADO | Electron e renderer indisponíveis localmente |
| `npm run dist:win` | NÃO EXECUTADO | Sem dependências e sem ambiente Windows |
| GitHub Actions | NÃO EXECUTADO | Novo repositório ainda não existe |

## Cenários aprovados no core

- Exemplo de grafo válido, ordem topológica e etapas registradas.
- Bloqueio de ciclo, conexão inexistente, porta inválida, entrada desligada, identificadores indevidos, tipo não registrado, saída duplicada e payload malformado.
- Simulação sem escrita, execução com escrita real e falha sem artefato posterior.
- Workspace novo sem criação automática, save/load explícitos.
- Editor salva arquivo real, preserva permissões executáveis, bloqueia traversal/symlink, recusa UTF-8 inválido e alterações concorrentes.
- Diretórios internos de saída verificam symlink e o explorador omite caminhos técnicos.

## Gate aberto

O marco 0.1 está **implementado e testado no núcleo**. Não é release aprovada para usuários finais. Antes de chamar a primeira versão desktop de funcional/produtiva, rodar no Windows: instalar dependências, compilar frontend, iniciar Electron, confirmar protocolo customizado/Monaco workers, manipular blocos, executar fluxo real pelo UI, abrir projeto existente, fechar/reabrir, gerar setup e portable, instalar/desinstalar e verificar que dados não são perdidos.
