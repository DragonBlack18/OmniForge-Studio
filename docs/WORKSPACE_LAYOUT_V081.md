# OmniForge Studio v0.8.1 — áreas de trabalho por projeto

## Escopo implementado

Uma navegação global, tema preto/grafite com acento vermelho, e ferramentas contextuais.
O menu **Layout** agrupa controles de organização, sem repetir destinos de navegação.

- Redimensionamento da navegação, biblioteca/explorador, inspetor de automações e inspetor CAD.
- Mouse com captura de ponteiro; setas ajustam 10 px, Shift+setas 30 px; Home/End aplicam limites; duplo clique restaura a largura padrão. Esc cancela um arraste sem persistir a prévia.
- Disposições Equilibrado, Área ampla e Inspeção. A terceira aparece somente nos editores com inspetor.
- Modo de foco por Ctrl+Shift+F11, menu Layout ou paleta. O botão **Sair do foco** permanece disponível. O atalho não substitui Ctrl+Space/Ctrl+Shift+Space do editor.
- Foco oculta painéis sem remontar o editor ou destruir seleção, campos do inspetor, buffer, undo/redo ou execução. Não salva nem executa documentos.
- Preferências por UUID do projeto, separadas entre Automação, Código e CAD. A Home inicial possui perfil independente. Navegar não reabre automaticamente um painel ocultado pelo usuário.
- Ajuste ao espaço disponível preserva um centro utilizável, sem sobrescrever larguras preferidas. A janela menor pode compactar painéis; voltar ao tamanho anterior recupera a preferência.
- Restauração deliberada do layout do projeto ativo sem apagar arquivos, histórico ou configurações dos demais projetos.

## Armazenamento e fronteiras

`of.workbench.layout.v1` no armazenamento local do renderer, dentro do perfil Electron.
O schema v1 contém somente UUIDs e campos de apresentação permitidos, nunca caminhos, documentos, credenciais ou permissões nativas. Há limite de 32 perfis e 48 KiB de texto serializado; a capacidade elimina apenas a preferência menos recentemente modificada.

Leituras não escrevem nada. O snapshot é estável e imutável. Valores inválidos recebem limites seguros.
Versão desconhecida, JSON inválido ou tamanho excessivo impedem substituição automática: edição do layout continua na memória e um aviso aparece no menu. **Restaurar layout** substitui explicitamente o arquivo de preferências incompatível, não documentos.
Falha/quota do armazenamento não impede uso dos editores e aparece como preferência válida apenas nesta sessão.

Preferências legadas são lidas como valores iniciais, sem apagar as chaves das versões anteriores.
Foco é transitório e não é armazenado. A mudança de escopo invalida prévias e callbacks antigos.
As permissões e os limites nativos da v0.8.0 permanecem inalterados; nenhuma dependência foi acrescentada.

## Implementação

- `src/workbench/layout/layout-model.mjs`: schema, validação, limites, projeção responsiva e store.
- `src/workbench/layout/useWorkbenchLayout.mjs`: assinatura React, isolamento de escopo e prévia sem gravação.
- `src/shared/PanelResizer.jsx`: componente acessível compartilhado, com coalescência por frame e um commit por gesto.
- `src/workbench/layout/LayoutControls.jsx`: controles contextuais em um único popover.
- Integração por props no CAD e no inspetor de fluxos. Nenhum domínio importa outro domínio.

## Referências primárias consultadas

- Blender Manual — Areas: https://docs.blender.org/manual/en/5.0/interface/window_system/areas.html
- Blender — Design Paradigms: https://developer.blender.org/docs/features/interface/human_interface_guidelines/paradigms/
- VS Code — Custom Layout: https://code.visualstudio.com/docs/configure/custom-layout
- WAI-ARIA APG — Window Splitter: https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/

Princípios aproveitados: áreas ajustáveis, editor ampliado, ações contextuais e separador operável pelo teclado. Não há código de Blender/VS Code copiado nem incorporação dos seus motores.
O separador publica nome, orientação, tamanho e painel controlado; isso não equivale a uma certificação completa de acessibilidade.

## Testes e evidências

`node --test tests/workbench-layout.test.mjs` cobre normalização, preservação de outros módulos, perfis independentes, recriação do store, migração legada não destrutiva, corrupção/quota, limites de memória e adaptação em 960/1040/1280/1440/1920 px.

`npm run smoke:layout` abre Electron real com perfil temporário. Usa dois projetos de teste, geometria CAD real, grafo nativo e arquivo JavaScript real. Verifica arraste/teclado/Esc, foco sem perda de estado, desfazer, armazenamento por projeto, reinício completo de processo e restauração seletiva. Compara bytes dos originais antes e depois.

Capturas geradas por esse teste, não por geração de imagem:

1. `layout-automation-1440-v081.png`: automações e painéis ajustados.
2. `layout-preferences-1440-v081.png`: disposições e opções por projeto.
3. `layout-cad-1440-v081.png`: desenho e inspetor com propriedade editada.
4. `layout-cad-focus-1440-v081.png`: foco no desenho com geometria preservada.
5. `layout-code-1280-v081.png`: editor real em janela menor com edição não salva.

A evidência usa fixtures locais identificadas como testes, não projetos pessoais. O relatório `layout-v081-results.json` só recebe PASS ao fim de todas as asserções.
Gates existentes de Linux, Windows, recuperação, segurança nativa, módulos, orçamento de bundle e executáveis devem aprovar a mesma revisão antes do merge.

## Limites

Não há docking arbitrário, janelas destacadas nem múltiplos editores simultâneos nesta versão.
Não aumenta as capacidades geométricas do CAD nem implementa LSP/DAP.
Ainda faltam assinatura do editor, atualização/rollback, auditoria de vulnerabilidades/licenças e aceitação prolongada em computadores reais para uma distribuição comercial estável.

## Correção de retenção do buffer Monaco durante a validação

O smoke de layout detectou perda de caracteres antes de ativar o modo de
foco: o checkpoint continha `// revisao ll`, embora o teclado tivesse
enviado `// revisao local`. A asserção de conteúdo integral foi mantida.

O modelo Monaco agora é o proprietário da edição em andamento. A interface
React recebe seus eventos para marcar alterações e produzir checkpoints,
mas não reaplica esses valores ao modelo a cada render. Somente uma nova
versão explícita de documento (abrir, carregar resultado, criar arquivo,
restaurar rascunho) pode substituir o buffer. A assinatura de eventos é
única por montagem, é liberada ao desmontar e preserva o undo/redo nativo.

`tests/editor-buffer.test.mjs` cobre ecos atrasados, troca explícita,
undo/redo, falhas de substituição e descarte de listeners. O E2E Windows
continua digitando pelo teclado sem aumentar delays ou substituir a
verificação por visibilidade de um botão: compara texto completo do
checkpoint, identidade do elemento Monaco e bytes originais no disco.

Referência primária consultada: implementação `Editor.tsx` do
`@monaco-editor/react` v4.7.0, em especial o efeito controlado `[value]`
e a assinatura de `onDidChangeModelContent`. Nenhum código externo foi
copiado para o adaptador local.
https://github.com/suren-atoyan/monaco-react/blob/v4.7.0/src/Editor/Editor.tsx
