# Modelo de segurança e limitações — 0.1.0

## Fronteiras de confiança

| Superfície | Política atual | Lacuna/expansão |
|---|---|---|
| Renderer Electron | `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` | E2E Electron ainda não testado |
| IPC | API allowlist, verificação de renderer e frame | Fuzzing de payload e limites por método |
| Conteúdo de janela | URL de app própria `omni://app`, bloqueio de popups/navegação | CSP de desenvolvimento e worker Monaco precisam ser confirmados no build |
| Arquivos | Pasta escolhida, bloqueio de `..`, symlink e arquivos grandes | Testes adversariais de races e reparse points Windows |
| Grafo | Nó/porta conhecido, DAG, config validada, recusa nós órfãos | Tipos semânticos além de JSON, schema por nó |
| Execução | Três nós declarativos; sem shell nem `eval` | Isolamento em workers na fase 0.7 |
| Segredos | Não há catálogo de credenciais nesta versão | Windows Credential Manager / keychain ou vault separado |
| Atualização | Não há atualização automática na 0.1 | Assinatura, integridade e migrações |
| Industrial | Sem escrita/controladores industriais | Approval gates, simulação, segregação OT, análise funcional |

## Limites conhecidos

O MVP **não** é uma sandbox geral de programas do usuário. `node:vm` não seria suficiente para executar código não confiável. Os nós não executam JS livremente, e a interface não apresenta uma função dessa natureza como pronta.

O editor de arquivos altera arquivos existentes quando o usuário ordena salvar. Ainda não há histórico automático de arquivos editados: abra uma pasta de testes na validação inicial, e use Git para versionar arquivos importantes.

Escritas em `.omniforge/` verificam diretórios e links simbólicos antes da operação. Em ambientes com concorrência maliciosa no filesystem, verificações entre `lstat` e `rename` não eliminam todas as condições de corrida; o produto exige auditoria adicional antes de manipular conteúdo hostil.

O modo simulação **não** executa efeitos externos, mas versões futuras precisarão definir simulações por conector. Para dispositivos físicos, toda operação de controle deve exigir permissão específica, e a primeira etapa industrial será exclusivamente leitura.

## Requisitos de implantação futura

- Esquema de segredos com criptografia, rotação e audit trail.
- RBAC e grants por projeto, conector e operação.
- Controle de rede contra SSRF, DNS rebinding e acesso não autorizado a redes internas.
- Retentativas idempotentes com limite, dead-letter, compensações explícitas.
- Assinatura de releases Windows e manifesto de hashes.
- Inventário de dependências, SBOM, checagem CVE/licenças e bloqueio de releases vulneráveis.
- Política de coleta e exportação de logs sem dados pessoais.
- Testes para symlink, NTFS junction, paths UNC, caminhos longos e locking no Windows.

## Disclaimers

A análise estrutural de grafos indica problemas conhecidos, mas não certifica a correção de uma arquitetura. Simulação não substitui testes de integração com provedores externos, validação eletromecânica ou avaliação de segurança funcional industrial.
