# PapaParse 5.5.3 — componente efetivamente incorporado

Origem: https://github.com/mholt/PapaParse/tree/5.5.3
Arquivo upstream: https://github.com/mholt/PapaParse/blob/5.5.3/papaparse.min.js
Licença: MIT; texto integral em `PapaParse-LICENSE.txt`.
Autor: Matthew Holt e contribuidores do projeto.

O arquivo `core/vendor/papaparse.cjs` é o código upstream **inalterado** de
`papaparse.min.js`, apenas com extensão `.cjs` para interoperabilidade Node.

- Git blob SHA-1: `f31411042b80599f9dd6126ff8fd41f8fa8f68fb`.
- SHA-256: `3553fb8bdf5b8004ce5531e6827e81c8b34e7b3992677967754544064e97b016`.
- Tamanho: 19419 bytes.
- Tag revisada: `5.5.3`, não uma referência móvel a latest/main.

Uso: parsing e geração síncronos de CSV dentro do worker de automação.
Não é carregado no boot do renderer, não é utilizado com download remoto,
stream de rede nem execução de callbacks fornecidos pelo usuário. Cabeçalhos,
tipos, dimensões e tamanho são verificados pelo adaptador original OmniForge.
`dynamicTyping` fica desligado: números e booleanos exigem conversão explícita.
Na exportação, `escapeFormulae` fica ligado por padrão; desligar essa opção é
uma decisão explícita do usuário, com risco ao abrir o CSV em uma planilha.

Nenhum runtime completo do Node-RED, VS Code ou Blender foi incorporado nesta
entrega. Referências de UX e contratos não são anunciadas como compatibilidade
com seus formatos, extensões ou motores. O inventário do npm é complementado
por `core/vendor/manifest.json`, porque o arquivo não é uma dependência npm.

A versão foi fixada, verificada e testada para este uso; isso não representa
uma auditoria de vulnerabilidades de todo o componente ou da aplicação.
