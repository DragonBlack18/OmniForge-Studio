# v0.8.2 — fechamento das correções de integridade da IDE

## Revisão de origem

Reconciliação do pacote local de correções com a branch do PR #42 na revisão
`ebc5892958998299f481a31f3ac188d403ec7dcd`, árvore
`b2ba05954beec844176a5d3508360bb877392ad5`.
A árvore extraída do artefato de fonte do CI foi conferida por `git write-tree`.
Preservados o backport localizado do Monaco, navegação F12 e o ajuste de
fonte compacta já enviado ao GitHub.

## Correções consolidadas

- Salvar todos fixa a geração do projeto e a identidade de cada documento.
  Respostas atrasadas não iniciam a gravação do próximo arquivo de outro projeto.
  Uma gravação já enviada não é cancelada retroativamente nem declarada perdida.
- Fechamento revalida alterações após drenar checkpoints; uma edição nova
  mantém a aba aberta. Descartar um checkpoint não elimina uma edição posterior:
  o token removido é retirado e uma nova proteção é agendada.
- A barra de código acomoda seus controles sem esconder linha e coluna.
  O E2E exige visibilidade e limites de viewport, além do valor correto.
- Testes de concorrência determinísticos cobrem troca de projeto, fechamento
  inicialmente limpo, descarte em andamento e salvar-e-fechar com nova edição.

Nenhuma dependência, permissão, formato de documento ou limite de bundle mudou.

## Evidência e critério de entrega

A retomada local anterior aprovou 419 testes Node em Linux. Essa evidência não
substitui o CI da revisão consolidada. Os testes visuais e os binários devem
ser novamente gerados e aprovados na mesma árvore antes da integração.

O CI `42554946340` e o empacotamento `42554946486` aprovaram a revisão de origem
`ebc5892`, incluindo Node Windows e execução Portable/NSIS. Isso não certifica
as alterações deste commit. O timeout de uma execução Windows mais antiga
não se repetiu nessa revisão; sua causa não foi determinada e não foi ocultada
por aumento de limite ou remoção de testes.

Para liberar esta revisão: testes completos Linux/Windows, build/orçamento,
IDE multidocumento, regressões Electron, capturas revisadas, fuses, instalação
Portable/NSIS e conferência de árvore/proveniência/hashes dos artefatos.
Os resultados finais serão registrados no PR #42 com os IDs dos respectivos
runs, evitando alterar o código apenas para registrar o resultado do próprio CI.

Escopo: IDE local multidocumento v0.8.2; não inclui LSP Python, DAP, terminal,
Node-RED, CAD 3D ou serviço independente. Binários experimentais sem assinatura.
