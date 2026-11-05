# OmniForge Studio v0.7.9 — recuperação protegida de fluxos

## Escopo implementado

Uma cópia local de recuperação protege alterações do editor de automações após
900 ms sem novas alterações. Não substitui o fluxo original, não dispara nós,
não habilita agendamentos e não concede permissões a extensões. O fluxo pode
estar desconectado e ainda em edição; só a execução exige um grafo executável.

Ao reabrir o mesmo projeto, o usuário decide entre restaurar a cópia no editor,
inspecionar seu JSON ou descartá-la com confirmação. A restauração continua
exigindo **Salvar fluxo** para alterar o documento no projeto. Executar é uma
segunda ação independente, protegida pelas verificações já existentes.

O novo projeto sem alterações não cria checkpoint do exemplo inicial. Só
edições, modelos carregados deliberadamente e restauração tornam o buffer
candidato à proteção. A navegação entre módulos continua preservando o buffer.
A troca deliberada de workspace tenta concluir a gravação pendente antes da
ativação nativa de outro projeto, sem forçar salvamento do original.

## Persistência e proteção

- Destino exclusivo: `userData/flow-recovery/<hash-do-workspace>.oflow`.
- Caminho canônico do workspace identifica o slot; caminho e conteúdo não são
  escritos em texto puro no registro. A carga cifrada inclui o hash do workspace
  para recusar a movimentação do arquivo para outro slot.
- Windows: `safeStorage.isAsyncEncryptionAvailable`, `encryptStringAsync` e
  `decryptStringAsync` do Electron 45.1.0, apoiados pelo provedor nativo do SO.
  As operações de cifra não bloqueiam o renderer.
- Sem fallback para texto puro. Em outro SO ou sem chave disponível, a proteção
  informa falha e o salvamento manual do fluxo original continua disponível.
- Limites: 400 nós, 800 conexões, 2 MB de JSON por fluxo, 2,1 MB por registro
  cifrado e 20 workspaces com rascunhos por perfil. Nenhuma evicção automática.
- Escrita atômica usa o mecanismo preexistente de arquivo temporário exclusivo,
  rename e retentativas limitadas para compartilhamento no Windows. Symlinks,
  arquivos com hardlinks, tipo incorreto e leitura acima do limite são recusados.
- Fila serializada por perfil e token SHA-256 separado para o rascunho. Atualização
  e descarte apresentam o token lido; outra sessão não é sobrescrita silenciosamente.
- Arquivo corrompido ou impossível de decifrar é mantido. Não zerar um slot após
  erro de leitura. O mesmo vale para falta de chave de outro usuário/instalação.

**Limite de confidencialidade:** a cifra protege somente os novos checkpoints,
não os arquivos `principal.json` e o histórico preexistente do projeto. Proteção
nativa do Windows não impede acesso por outros programas do mesmo usuário.
Não substitui cofre de credenciais nem backup criptografado independente.

## Conflitos e concorrência

Há duas revisões diferentes: a do documento original (`baseRevision`) e a da
cópia cifrada (`draftRevision`). Mudança externa do original não impede preservar
o buffer em um checkpoint, mas sua revisão de base antiga continua intacta.
A restauração relê a cópia e a revisão atual do disco; divergência ou original
ilegível bloqueiam a aplicação automática. O usuário ainda pode inspecionar o
JSON. O salvamento original conserva sua própria proteção de revisão.

O coordenador possui uma sessão distinta a cada abertura, inclusive ao reabrir
exatamente o mesmo caminho. Respostas atrasadas de uma sessão não mudam a outra.
Timers são cancelados e resultados são identificados pela sessão de origem.

Antes de salvar manualmente, o coordenador conclui a escrita que já começou,
retém o token retornado e pausa novos checkpoints. Depois de sucesso, exclui
apenas a cópia desse token. A próxima renderização apresenta o grafo e a revisão
já confirmados; não se escreve o grafo anterior com uma revisão nova. Edições
concorrentes mantêm o dirty-state por meio dos epochs existentes na sessão.
Uma falha do save mantém o checkpoint. Falha na limpeza não desfaz o save.

## Interface e módulos

Não foi criado outro menu de navegação. O estado protegido aparece em uma linha
pequena no cabeçalho do editor. O aviso com ações aparece apenas quando existe
rascunho pendente ou erro. Inspeção JSON exige ação explícita, alerta para dados
sensíveis e não copia informações para a área de transferência automaticamente.

- `core/modules/automation/flow-recovery.mjs`: contrato e persistência cifrada.
- `electron/modules/flow-recovery-ipc.cjs`: provedor nativo, IPC e workspace fixado.
- `src/modules/automation/flow-recovery-controller.mjs`: fila, sessões e timers;
  módulo puro testável sem carregar React Flow.
- `useFlowRecovery.mjs`: adaptação React e ações de restauração/save/descarte.
- `FlowRecoveryNotice.jsx`: aviso contextual carregado sob demanda.
- `editor-language.mjs`: extração simples do mapeamento de linguagens para manter
  o shell abaixo do limite existente; não altera recursos do editor.

Nenhuma dependência npm foi adicionada. CAD, Monaco e o canvas permanecem lazy;
o orçamento de JS inicial de 375.000 bytes não foi aumentado.

## Referências consultadas em 5 de novembro de 2026

1. VS Code — Basic editing / Hot Exit: recuperação de alterações não salvas é
   separada do salvamento explícito. Não copiamos a implementação.
   https://code.visualstudio.com/docs/editing/codebasics
2. React Flow — Save and Restore: uso do estado de nós/arestas como documento.
   Mantemos o modelo controlado atual, sem armazenar instâncias do framework.
   https://reactflow.dev/examples/interaction/save-and-restore
3. React — useEffect: limpeza e isolamento de respostas assíncronas fora de ordem.
   O coordenador puro torna esses casos testáveis sem depender de tempo do CI.
   https://react.dev/reference/react/useEffect
4. Electron — safeStorage: API assíncrona e limites de segurança por plataforma.
   Não usar a disponibilidade da API como justificativa para fallback inseguro.
   https://www.electronjs.org/docs/latest/api/safe-storage

## Gates

`flow-recovery.test.mjs` verifica contrato, dados cifrados, ausência de escrita no
original, CAS, deduplicação, concorrência, quota, corrupção, limites, links,
vinculação ao workspace, indisponibilidade de chave e contrato IPC.
`flow-recovery-controller.test.mjs` verifica respostas atrasadas, timers, sessão
substituída, write em voo, save que falha, revisão nova e conflito ao restaurar.

`npm run smoke:flow-recovery` usa Electron Windows real, cifra do SO, filesystem
real e um perfil temporário. Confere reinício completo do processo, restauração
manual, save, limpeza após debounce, conflito externo, descarte com consentimento,
rejeição de workspace estrangeiro e ausência de execuções/saídas automáticas.
O seletor de pasta é substituído pelo caminho da fixture; não há mock da cifra,
das operações do produto ou dos arquivos. Gera captura real para inspeção.

A release exige suíte Linux/Windows, build, bundle, esse E2E e todos os E2Es
anteriores, além de abrir Setup/Portable no Windows e gerar hashes SHA-256.

## Limites operacionais

Alterações anteriores ao checkpoint podem se perder em encerramento abrupto.
Não prometemos durabilidade diante de falha de energia ou de hardware. A cópia
é por workspace, não uma linha do tempo completa. Não é sincronizada na nuvem.
Dados de recuperação dependem da chave local/conta Windows e não são transferíveis
como backup universal. O arquivo original salvo segue portável como antes.
CAD 3D, novos formatos e editor multi-documento não fazem parte desta etapa.
Execuções de agendamentos anteriormente autorizados têm seu ciclo independente;
ler/restaurar um checkpoint não as inicia nem as reconfigura.

## Integração
Consulte `INTEGRATION_V079.md`: contrato conjunto, restauração reversível, limites e gates.
