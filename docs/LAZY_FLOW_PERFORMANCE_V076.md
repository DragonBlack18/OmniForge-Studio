# OmniForge Studio v0.7.6 — isolamento do runtime visual e medição real

## Objetivo técnico

A interface deve funcionar como uma estação de trabalho de engenharia:
IDE, CAD, automação, extensões e manutenção compartilham somente o
workspace ativo e capacidades aprovadas. Abrir a Home, o editor de texto
ou o CAD **não deve carregar ou inicializar o motor gráfico React Flow**.

A v0.7.5 tinha JS inicial medido em **474.362 bytes** e CSS inicial
**45.023 bytes** (workflow CI v0.7.5, não RAM/FPS). O limite atual
v0.7.6 é **375.000 bytes de JS inicial**, exigindo redução de pelo menos
20% sem alterar a capacidade de executar fluxos e outras ferramentas.
O tamanho realmente obtido será registrado no log de build Vite.

## Arquitetura

```text
src/workbench/AppShell.jsx
  ├── useFlowSession (React nativo, estado leve do documento)
  │    ├── nodes / edges / selectedId
  │    ├── revision / dirty / edit epoch
  │    └── graph JSON (modelo persistente versionado)
  ├── CAD, IDE, agendamento, Git... (independentes)
  └── React.lazy(FlowCanvas.jsx)     ← import SOMENTE em Automação
       └── @xyflow/react            ← runtime pesado
            ├── applyNodeChanges    ← arraste, seleção, remoção
            ├── applyEdgeChanges
            └── addEdge             ← validação/deduplicação nativa
```

### Ciclo de vida e invariantes

1. **Home fria:** `AppShell` mantém estado leve, não importa
   `@xyflow/react`; importação Vite de `FlowCanvas` é exclusivamente
   dinâmica. E2E verifica ausência do chunk enquanto a Home é aberta.
2. **Ativação:** ao entrar em Automações, React.lazy importa o canvas,
   que injeta as funções oficiais de atualização React Flow no
   `useFlowSession` (sem reproduzir parcialmente as regras do framework).
3. **Navegação:** sair do canvas desmonta o runtime visual, mas o hook
   de sessão permanece montado no shell. Geometria do grafo, seleção,
   configuração, revisão e `flowDirty` sobrevivem à troca por CAD,
   IDE, Git e Home.
4. **Persistência:** somente a operação de salvar explícita usa o IPC
   nativo existente. Carregar templates altera buffer e mantém a revisão
   do projeto; rejeitar sobrescrita externa continua responsabilidade
   do backend `saveFlow`.
5. **Concorrência de edição/salvamento:** token local `documentEpoch +
   editEpoch` é capturado antes do IPC de save. Se um usuário editar
   durante um save ainda em andamento, o retorno atualiza a revisão
   do documento gravado, mas **não limpa o dirty** de edições recentes.
   Trocar o documento invalida tokens de save antigos.
6. **Recovery:** não alegamos recuperação de dados de fluxo que ficaram
   somente na memória após crash/reload. Essa será uma etapa específica
   futura, com SHA-256 e confirmação, como CAD e Monaco.
7. **Segurança:** não há novas permissões IPC, eval, shell, network,
   alteração de fluxo no disco, migração ou remoção de arquivos.

### Por que não reimplementar o motor de alterações?

O contrato original `useNodesState/useEdgesState` utiliza
`applyNodeChanges/applyEdgeChanges` da própria biblioteca. A nova
ponte deixa essas funções exclusivamente dentro do módulo de canvas
carregado sob demanda. Isso mantém posição/arraste, seleção, remoção,
medições e conexões compatíveis com o framework, reduzindo riscos de
regressões sem duplicar algoritmos de atualização.

Referência: https://reactflow.dev/api-reference/utils/apply-node-changes
e https://reactflow.dev/api-reference/utils/apply-edge-changes

## Métricas e evidências

- `npm run budget:bundle`: mede assets reais da entrada estática no
  manifesto Vite. O budget v0.7.6 JS inicial é 375 KB, CSS inicial
  mantém limite 300 KB; chunks Monaco, CAD e React Flow ficam fora
  da entrada. Relatório tem delta real vs v0.7.5.
- `npm run benchmark:startup`: **3 execuções reais** do Electron em
  perfis temporários isolados, observando tempo desde processo até
  Home visível, entradas Performance Navigation e JS heap do Chromium
  via CDP quando disponível. Salva
  `smoke-artifacts/startup-benchmark-v076.json`.
- `npm run smoke:lazy-flow`: percorre Home → projeto → gravação →
  edição não salva → CAD → Home → IDE → Automação → gravação → reload.
  Asserções no JSON real do workspace garantem que navegação
  não faz autosave nem perde alterações em memória.
- Logs E2E e screenshots reais ficam como artifacts de CI.
- **Atenção:** tempo de cold start, consumo de heap e renderização
  dependem do runner/hardware. A v0.7.5 não tinha benchmark idêntico
  de inicialização; **não** comparar ms de máquinas diferentes ou
  anunciar melhoria de FPS/RAM sem prova pareada.

Referência oficial de profiling:
https://www.electronjs.org/docs/latest/tutorial/performance

## Testes de aceitação antes de integrar

- [ ] Unit tests Node Linux + Windows, inclusive round-trip do
  modelo de grafo, dirty por mudança e fronteiras.
- [ ] Vite build e orçamento de JS de entrada.
- [ ] E2E real lazy flow e regressão de automação existente.
- [ ] E2E Monaco/IDE, CAD/DXF, recuperação CAD, recuperação de
  arquivos de código, Git, extensões, tarefas e scheduler.
- [ ] Benchmark com dados reais e captura; nenhum mock de memória.
- [ ] Setup/Portable Windows x64 gerados, abertos, validados;
  hashes SHA-256; arquivos de usuário anteriores intactos.
- [ ] Somente depois de todos os checks do mesmo commit: merge na
  main e publicação de binários via GitHub Actions.

## Próximos incrementos propostos

- v0.7.7: operações de layout redimensionável com armazenamento de
  preferência por workspace, recuperação seletiva de painéis e testes
  de densidade em diferentes resoluções.
- v0.7.8: recuperação de rascunhos de fluxo (com revisão externa,
  consentimento, quotas e isolamento do workspace).
- v0.8.x: adaptadores LSP/depuração e componentes open source com
  análise separada de licença, footprint, segurança e compatibilidade.

Nenhum destes incrementos futuros é anunciado como funcional nesta
release. Um resultado de CI verde indica aprovação dos testes escritos,
não garantia de 100% de ausência de defeitos.
