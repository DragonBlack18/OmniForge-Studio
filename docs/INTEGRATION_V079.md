# v0.7.9 — integração de autoria e recuperação

## Escopo
Combina a autoria do PR #36 (`dfe3d4c`) e a recuperação do PR #37 (`c82e117`)
sobre a v0.7.8 (`3ab8f151`). Não substitui uma etapa pela outra.

O único proprietário do documento é `flow-session-store.mjs`. O coordenador
de recuperação observa esse documento, mas não possui uma segunda cópia editável.
O runtime React Flow permanece lazy. Não há nova permissão privilegiada.

## Contratos conciliados
- `editEpoch` diferencia alterações persistentes de seleção/medição.
- `replaceDocument(flow, revision, dirty, protect)` distingue a carga do exemplo
  não salvo de uma edição real. Abrir um projeto novo não cria checkpoint vazio.
- `restoreDocument` é uma operação reversível. Undo volta ao conteúdo anterior,
  redo volta ao recuperado; a revisão no disco não muda.
- Restauração invalida leases antigos de save. Edições durante save continuam sujas.
- Nome de fluxo com até 120 caracteres em autoria e recuperação.
- Enquanto há recuperação pendente: propriedades, modelo, catálogo, conexões,
  teclado, toolbar, salvar e executar não podem modificar o documento.
- Inspecionar JSON requer ação do usuário; restauração não executa nós, cria
  agendamentos ou concede acesso às extensões.
- Foco da paleta corrigido antes da pintura; seis ciclos F1/Escape testados.

## Ferramentas preservadas
Histórico de até 60 ações, duplicação sem conectar automaticamente, exclusão
atômica de blocos/conexões, organização topológica, navegação por estrutura e
diagnósticos, seleção do bloco com erro, oito operações locais de dados/texto,
modelos executáveis, CAD Toolkit, IDE, Git e agendamentos já existentes.

## Verificação
`node --test` executa as suítes dos dois PRs e sete testes novos de integração.
`smoke:flow-authoring` verifica conexões, undo/redo, diagnóstico, execução e
saída JSON real. `smoke:flow-recovery` passa a verificar também undo/redo da
restauração e bloqueio das novas ações no mesmo processo Electron Windows.
Todos os gates anteriores permanecem no CI, inclusive Setup/Portable.
A aprovação local não substitui o E2E Windows do commit combinado.

## Referências
- React external store: https://react.dev/reference/react/useSyncExternalStore
- React Flow state: https://reactflow.dev/learn/advanced-use/state-management
- Electron safeStorage: https://www.electronjs.org/docs/latest/api/safe-storage
Implementação original. Nenhum exemplo pago, engine ou asset proprietário copiado.

## Limites
Checkpoints são protegidos apenas no Windows, pela conta local; não são backup
portátil nem proteção contra malware da mesma conta. Original e histórico do
projeto continuam em claro. O intervalo anterior ao debounce pode se perder.
CAD continua 2D. Não há novo LSP, terminal irrestrito, kernel 3D ou integração
industrial. Não declarar release publicada antes dos gates do mesmo commit.
