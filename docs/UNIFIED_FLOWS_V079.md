# v0.7.9 — integração de autoria e recuperação de automações

## Base auditável

A versão publicada de partida é `3ab8f151` (v0.7.8). Esta implementação reúne
os trabalhos preservados nos PRs #36 (`dfe3d4c4`) e #37 (`c82e117a`). Não
substitui um pelo outro nem mantém dois gerenciadores do mesmo documento.

## Funcionalidades de produto

- Histórico de até 60 ações e 12 MB somando desfazer e refazer. Arrastes e
  digitação são agrupados; excluir um nó e suas conexões é uma transação.
- Duplicação desconectada, organização topológica, enquadramento e filtro
  de blocos. Um único navegador global pesquisável.
- Inspetor por Propriedades, Estrutura e Diagnóstico; seleção de erros leva
  ao bloco correspondente. Estados reais do runner aparecem no canvas.
- Validação de portas, ciclos, auto-conexões, entradas ocupadas e limites.
- Projeção/mapeamento/agrupamento/soma/particionamento de dados, contrato
  de tipo, recorte de texto e limite numérico. Três modelos novos, que
  executam operações reais e persistem resultados quando solicitado.
- Recuperação cifrada de alterações após 900 ms no Windows; decisões
  explícitas para restaurar, inspecionar ou descartar. Restaurar não salva,
  não executa, não ativa agendas e não concede permissões.

## Contrato único de documento

`flow-session-store.mjs` é o único proprietário de nós, conexões, nome,
revisão, dirty-state, seleção e histórico. O hook React apenas se inscreve
via `useSyncExternalStore`. `FlowCanvas` continua dinâmico e injeta os
atualizadores oficiais de React Flow; o shell não carrega esse runtime no
boot. O grafo persistente é cacheado e mudanças de seleção/medição visual
não geram checkpoints nem histórico.

O store informa `recoveryEligible`: o fluxo de exemplo de um workspace
novo pode estar não salvo, mas não gera uma cópia até uma edição real.
Abrir outro projeto limpa história e invalida tokens do documento anterior.

O mesmo limite de nome (120 caracteres) é utilizado na autoria e no
checkpoint. Não há truncamento silencioso. Limites de documento continuam
400 blocos, 800 conexões e 2 MB; recuperação tem quota de 20 workspaces.

## Transações de save e restore

`flow-session-recovery.mjs` é usado pela interface e pelos testes puros.
Ele captura o JSON exato associado ao token de save. O resultado nativo
só atualiza a revisão da mesma sessão, e um resultado atrasado não faz a
revisão voltar atrás.

Se houve edição durante a gravação, a cópia de recuperação é atualizada
com a geometria mais recente e a revisão recém-gravada. A cópia anterior
não é excluída antes da nova proteção. Se essa proteção falha, a anterior
permanece e a interface informa o erro.

Restaurar revalida a cópia e a revisão atual no disco. A aplicação do
buffer ocorre antes de liberar o bloqueio de recuperação. O conteúdo
original permanece na história: é possível desfazer a restauração.
Quando o undo retorna ao último conteúdo salvo, somente o checkpoint da
sessão é removido, após conferir CAS e revisão do original. Mudança externa
preserva a cópia em vez de descartá-la silenciosamente.

Bloqueio durante recuperação pendente vale para campos, templates,
atalhos, duplicação, exclusão, conexões, arraste e undo/redo. Navegação,
seleção, medição visual e inspeção permanecem disponíveis.

## Ensaios executados e gates

A suíte Node local possui 339 testes aprovados nesta integração. Onze
novos testes exercitam em conjunto o store, controlador e filesystem real:
nomes longos, restore reversível, undo/redo de checkpoints, save concorrente,
revisão externa, isolamento, memória do histórico e modelos de dados.
O codec AES-GCM dos testes é infraestrutura de ensaio, não substitui nem
simula evidência de DPAPI. O E2E Windows testa o provedor nativo real.

`smoke:flow-integration` reinicia processos Electron, restaura e desfaz,
reabre modelos com as ferramentas novas, executa explicitamente e confere
o JSON produzido no filesystem. Captura janelas de 1440×900 e 1280×800.

Continuam obrigatórios `smoke:flow-authoring`, `smoke:flow-recovery` e todos
os gates anteriores de CAD/IDE/Git/tarefas/extensões/agendas, além de build,
budget (JS inicial <=375.000 B) e execução de Setup/Portable no Windows.
Resultados e SHA do CI devem ser consultados no PR; os testes locais não
são usados como substituto de E2E ou de teste do instalador.

## Referências técnicas consultadas

- React: snapshots de stores externos precisam ser estáveis/imutáveis e
  sua leitura deve permanecer consistente entre renderizações:
  https://react.dev/reference/react/useSyncExternalStore
- Electron: API assíncrona de `safeStorage`; limites de segurança da
  proteção no Windows e diferenças em Linux/macOS:
  https://www.electronjs.org/docs/latest/api/safe-storage
- As decisões de interface continuam documentadas em STUDIO_UX_V077.md,
  FLOW_AUTHORING_V079.md e FLOW_RECOVERY_V079.md. Não foi copiado código de
  Blender, Adobe ou engines externas. Nenhuma dependência nova.

## Limites que permanecem

Proteção do checkpoint é Windows-only; projeto original e histórico já
salvo não são criptografados por esta versão. Não impede leitura por
outros programas da mesma conta. Edições anteriores ao checkpoint podem
se perder em encerramento abrupto. Não é replay automático de operações.
Executáveis não assinados, CAD 2D, sem LSP/DAP ou terminal arbitrário novos.

## Próxima etapa separada

v0.8.0: contratos versionados de módulos e capacidades, com testes de
isolamento antes de integrar LSP, terminal ou novos serviços. Esse item é
planejamento, não funcionalidade entregue pela v0.7.9.
