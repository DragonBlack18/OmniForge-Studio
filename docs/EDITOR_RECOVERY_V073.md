# OmniForge Studio v0.7.3 — Recuperação não destrutiva da IDE

## Contrato
A IDE salva um rascunho temporário local depois de 700 ms sem alterações no
editor Monaco. O arquivo do projeto NÃO é modificado por esse checkpoint.
Em caso de recarga da janela ou perda do estado em memória, reabra o mesmo
arquivo e escolha explicitamente **Restaurar no editor**.

Restaurar altera somente o buffer do Monaco. O usuário ainda precisa clicar
em **Salvar arquivo**; essa operação mantém a verificação SHA-256 do documento
original, impedindo overwrite silencioso após modificação externa.

## Arquitetura
- Backend canônico: core/modules/ide/editor-recovery.mjs.
- Coordenador React: src/modules/ide/useEditorRecovery.mjs.
- API nativa permitida: readEditorDraft, writeEditorDraft e
  discardEditorDraft em electron/preload.cjs.
- O Electron principal verifica que o workspace informado corresponde
  exatamente ao workspace ativo; nenhum caminho arbitrário de outro projeto
  é aceito.
- Os rascunhos são armazenados em userData/editor-recovery usando nomes
  SHA-256 derivados de workspace+arquivo. Jamais na raiz do projeto, .git
  ou junto dos binários de instalação.
- Escrita atômica com permissões locais 0600 onde suportadas pelo sistema,
  token de concorrência otimista, serialização por arquivo e limite de 40
  rascunhos no perfil. Cada conteúdo é limitado a 240 KB.
- Dados inválidos, symlinks e backups acima da quota são rejeitados sem
  exclusão ou substituição silenciosa de registros anteriores.
- Arquivos com nomes típicos de credenciais (.env, .npmrc, secrets,
  credentials, chaves PEM/PFX etc.) não recebem checkpoint automático.

## Estados
1. Sem rascunho: a IDE edita normalmente e salva checkpoint após 700 ms de
   inatividade, quando houver conteúdo modificado.
2. Rascunho existente e revisão original compatível: o usuário pode
   restaurar, copiar ou descartar. Sem sobrescrita automática do disco.
3. Rascunho existente mas arquivo mudou externamente: restauração direta
   bloqueada; o usuário pode copiar o texto para comparar, ou descartar.
4. Erro de gravação/armazenamento: aviso na interface. Arquivo original
   permanece protegido. O sistema não afirma que o rascunho está salvo.
5. Salvar arquivo normalmente: depois do commit validado, o checkpoint
   correspondente é descartado por token; outro checkpoint concorrente não
   pode ser excluído por uma gravação antiga.

## Limitações e privacidade
- Isto NÃO é um sistema de backup versionado, criptografado ou inviolável.
  O conteúdo do rascunho é código-fonte local armazenado em claro sob o
  perfil do usuário; proteja os dados e o disco com os mecanismos do Windows.
- Alterações feitas no intervalo de 700 ms, antes da escrita atômica terminar,
  podem não sobreviver a um encerramento abrupto. Operações em andamento
  podem falhar e o aviso é mostrado na interface quando ela permanece aberta.
- Checkpoints podem permanecer após encerramentos inesperados; não há
  remoção automática de projetos nem limpeza destrutiva.
- A v0.7.3 cobre somente o editor de arquivos. Fluxos de automação e CAD
  têm persistência própria e não são incluídos nesse checkpoint.
- Não executa código desconhecido, não envia arquivos à internet e não
  altera permissões de plugins.

## Aceite antes da publicação
- [ ] Testes Node Linux/Windows: isolamento, traversal/symlink, quotas,
  corrupção, revisão divergente, escrita atômica e concorrência.
- [ ] Build + orçamento de bundle aprovados.
- [ ] Electron E2E real: editar no Monaco, checkpoint no perfil de teste,
  recarregar renderer, restaurar somente no editor e salvar explicitamente.
- [ ] E2E: arquivo alterado externamente deve impedir restauração direta,
  preservando tanto arquivo original quanto rascunho até decisão do usuário.
- [ ] Regressão completa: Git, tarefas, automações, agenda, extensões, CAD,
  IDE e instalador/portátil Windows com hashes SHA-256.
- [ ] A mesma revisão de commit precisa passar todos os gates antes do merge.
