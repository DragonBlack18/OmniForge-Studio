# OmniForge Studio v0.7.1 — Histórico de tarefas de projeto

## Escopo real

Complementa a Central de Tarefas v0.7.0, sem criar terminal arbitrário, serviço em segundo plano, novos comandos executáveis ou novas dependências npm.

Após o estado terminal de uma execução real (completed, failed, cancelled, timeout, output-limit), o Electron grava **somente os metadados finais** e então notifica o renderer. O resultado da tarefa é autoritativo mesmo quando a persistência falha: a interface exibe a falha no histórico separadamente.

## Dados e isolamento

- Armazenamento: pasta do perfil Electron em userData/project-task-history/<sha256-do-caminho-canonico>.json.
- O workspace não recebe arquivos adicionais e não é alterado pelo histórico.
- Campos: UUID, nome de script, status final, início/fim, duração em milissegundos, exitCode ou null e indicador de saída truncada.
- Não gravar command, stdout, stderr, entradas/saídas de fluxos, ambiente, credenciais, mensagens arbitrárias, nem o caminho completo do workspace.
- Os arquivos são estritamente limitados a 64 KiB. A lista mantém até 60 registros por workspace; a interface exibe os 30 mais recentes.
- A retenção é circular, não há limpeza do workspace ou alteração do catálogo. Ao exceder o limite, os metadados de tarefas antigas são descartados.

## Durabilidade e segurança

- Escrita por arquivo temporário e rename atômico (incluindo retry limitado no Windows, reutilizando a implementação já testada).
- Atualizações serializadas em memória por arquivo para evitar perda de registros quando conclusões coincidem no mesmo processo Electron.
- Rejeitar symlink, arquivo fora do contrato, JSON corrompido ou arquivo maior que a quota sem sobrescrever, recriar ou apagar o conteúdo anterior.
- O IPC expõe somente listProjectTaskHistory() e obtém o workspace ativo e userData exclusivamente do processo principal.
- A persistência não é um mecanismo de auditoria inviolável. Um processo com permissão sobre o perfil do usuário pode modificar registros.
- Histórico pós-crash: somente tarefas cuja conclusão chegou ao adaptador são registradas. Um processo encerrado abruptamente pode deixar uma execução sem evento final; não se promete exactly-once.
- O runner npm mantém as mesmas permissões e riscos de v0.7.0. Não há sandbox.

## Testes obrigatórios

- node --test tests/project-task-history.test.mjs: primeiro acesso sem criar arquivos, gravação real, confidencialidade, isolamento de workspaces, eventos duplicados, concorrência, quota, datas, corrupção e symlink.
- npm test: regressão completa de automação, CAD, extensões, IDE, scheduler e Git.
- npm run smoke:tasks: aprovação nativa, npm real, saída, cancelamento e histórico persistente em arquivo JSON; janela recarregada e projeto aberto novamente mostra resultados anteriores, sem copiar stdout para o arquivo.
- npm run build && npm run budget:bundle: proteção do carregamento inicial.
- Build, smoke e instalação/desinstalação Windows Portable e NSIS no GitHub Actions para o mesmo commit SHA antes de integração à main.

## Limites assumidos

A UI não pesquisa nem exporta registros, nem mantém logs completos após fechar. A retenção dos 60 últimos metadados é deliberada para baixo custo de I/O e privacidade. Futuras opções de exportação/auditoria requerem controle de segredos e retenção explícitos.
