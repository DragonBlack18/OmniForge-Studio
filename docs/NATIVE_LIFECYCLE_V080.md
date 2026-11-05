# v0.8.0 — encerramento nativo e esperas verificáveis

## Correções desta revisão

O fechamento possui um coordenador por janela, com estados idle/prompt/draining/approved.
Somente uma confirmação é aberta. Cancelar libera a interface; aceitar cancela a execução
supervisionada, aguarda a finalização e a persistência do histórico, e solicita `app.quit()`
no próximo ciclo do processo nativo. O código não usa `app.exit()` nem destruição forçada.

Uma gravação de arquivo, registro, CAD, exportação de diagnóstico ou aprovação de tarefa
aberta bloqueia o fechamento. O estado é conferido novamente ao retornar de um diálogo.
Novas chamadas de trabalho são recusadas durante a decisão/saída; diagnóstico, cancelamento
e comunicação de alterações não salvas permanecem disponíveis. Callbacks de uma janela
já fechada são invalidados. O evento before-quit não cancela trabalho antes do consentimento.

Uma tentativa de salvar fluxo sem projeto ativo não pode deixar o mutex nativo ocupado.
O término de uma tarefa inclui seu histórico: o encerramento não antecipa essa escrita.

## Falha intermitente nas esperas dos testes

Na versão fixada Playwright 1.56.1, a rotina de `waitForFunction` verifica a verdade do retorno
do predicado antes de resolver a Promise retornada por um predicado async. Uma Promise
resolvendo `false` não constitui repetição confiável nesse caminho. O teste de extensões
podia continuar antes da autorização realmente persistir; não foi criada uma permissão implícita.

As observações assíncronas de IPC agora usam `scripts/lib/wait-for-state.mjs`, que aguarda
cada resultado booleano, aplica prazo total, não sobrepõe leituras nem ignora exceções.
As esperas de DOM síncronas continuam em Playwright. Um teste impede reintroduzir a forma
async inadequada nos smokes. O teste de extensão segura deliberadamente o consentimento,
confere que a escrita continua recusada, libera a resposta e só então verifica persistência.

Referências primárias consultadas:
- https://raw.githubusercontent.com/microsoft/playwright/v1.56.1/packages/playwright-core/src/server/frames.ts
- https://playwright.dev/docs/api/class-page#page-wait-for-function
- https://www.electronjs.org/docs/latest/api/browser-window
- https://www.electronjs.org/docs/latest/api/app
- https://www.electronjs.org/docs/latest/tutorial/security

## Aceite

Testes puros exercitam resposta atrasada, rejeição de diálogo, cancelamento, duas tentativas
simultâneas, escrita iniciada durante diálogo, tarefas finalizando histórico, janela substituída
e liberação do mutex. Smokes Windows confirmam a saída natural (código zero), a recusa de
novas operações durante confirmação e os arquivos anteriormente salvos após reiniciar.

Não alterar limites, remover asserções ou aprovar uma release com testes ignorados/falhando.
A assinatura digital, revisão de vulnerabilidades/licenças, atualizações com rollback e
aceitação em hardware de usuário continuam gates separados antes de produção comercial.
