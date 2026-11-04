# OmniForge Studio v0.7.4 — Recuperação não destrutiva de desenhos CAD

## Contrato funcional

O CAD Sketch 2D registra um checkpoint local aproximadamente 900 ms após a
última alteração no desenho não salvo. O checkpoint NÃO grava, modifica nem
exporta o arquivo original `.omniforge/cad/sketch.json`.

Depois de reiniciar ou recarregar a interface, reabra o mesmo workspace e
entre no CAD. Quando houver um checkpoint, será oferecida uma escolha explícita:

- **Restaurar no CAD**: recupera a geometria somente na memória do editor;
  `Salvar desenho` continua sendo uma segunda ação obrigatória.
- **Visualizar JSON recuperável**: permite inspecionar e copiar a geometria
  bruta sem aplicá-la; útil quando há conflito externo.
- **Descartar rascunho CAD**: exige confirmação; apaga apenas o checkpoint.

Se o `sketch.json` mudou desde a captura, a restauração direta é bloqueada
por divergência de revisão SHA-256. Nenhuma atualização automática tenta
substituir a versão externa. Erros no checkpoint não anulam o CAD original.

## Separação técnica

- Backend: `core/modules/cad/cad-recovery.mjs`.
- Coordenador React: `src/modules/cad/useCadRecovery.mjs`.
- Camada nativa: `electron/main.cjs` com IPC nominal, e
  `electron/preload.cjs` com allowlist (sem exposição de `ipcRenderer`).
- Core host carrega o serviço sob demanda; não acrescenta CAD ao startup.
- Workspace reivindicado pelo renderer deve ser idêntico ao workspace
  ativo no Electron. Troca de projeto invalida gravações antigas.

O perfil `userData/cad-recovery` armazena no máximo 20 checkpoints por
instalação, cada desenho com no máximo 1,5 MB de geometria JSON e até 1,6 MB
de registro. Nomes são hashes do caminho canônico do workspace, e o registro
não contém o caminho do projeto. O diretório e os arquivos passam por
verificações de tipo, symlink e tamanho; a escrita é atômica com modo 0600
onde suportado, e a exclusão exige o token atual de revisão do checkpoint.

O controle de revisão otimista trata a versão do desenho no disco e
separadamente a versão do rascunho. A fila do perfil serializa gravações,
exclusões e aplicação das quotas no processo Electron. Não há evicção
automática de rascunhos antigos nem arquivos de backup na raiz.

## Limitações

- Não é backup criptografado, versionamento formal ou garantia de recuperação
  integral. O JSON é local e permanece em claro no perfil do usuário.
- Edições no intervalo anterior ao debounce de 900 ms podem se perder se
  o processo encerrar abruptamente.
- Escrever um novo checkpoint após mudança externa do arquivo CAD é
  recusado. Um rascunho já existente pode ser inspecionado e descartado,
  mas não rebaseado automaticamente.
- Fluxos de automação continuam com persistência própria; esta versão não
  promete recuperação automática de fluxos nem CAD 3D.
- Nenhum comando CAD externo, CAD 3D ou componente de autoria terceirizada
  é instalado por esta alteração. O software continua experimental.

## Gate de aceite

1. `npm test` em Linux e Windows: checkpoints, CAS, concorrência, quota,
   conteúdo corrompido, symlinks, revisão divergente e isolamento.
2. `npm run build` e `npm run budget:bundle`: verificam lazy loading.
3. `npm run smoke:cad-recovery` em Electron Windows: edição real, gravação
   local no perfil isolado, reload, restauração explícita, conflito externo
   e descarte com confirmação, conferindo filesystem.
4. Regressão: CAD/DXF, Monaco, Git, automação, extensões, scheduler e tarefas.
5. Build dos executáveis Windows Setup/Portable, teste real NSIS/Portable e
   hashes SHA-256 no mesmo commit.
6. Não integrar na `main` sem sucesso dos gates exigidos para o HEAD.
