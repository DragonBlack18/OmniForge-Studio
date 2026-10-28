# Regras de alteração

- Não editar repositórios externos por impulso. Trabalho limitado a este projeto.
- Uma funcionalidade por mudança; `develop` recebe testes antes de merge para `main`.
- Alterações do catálogo não podem mudar sem migração a semântica dos nós já existentes.
- Executores devem ser testados com resultado real, falhas e casos adversariais.
- Não armazenar credenciais, endpoints sensíveis, IPs de máquinas industriais ou certificados no Git.
- O editor não deve destruir arquivos sem uma ação explícita do usuário.
- A implementação de qualquer comando de controle OT, IA com ações ou execução de código passa por revisão de segurança.
- Gerar histórico de release com funcionalidades, risco, testes e impacto de migração.
- Toda release deve ter evidência de UI/desktop testada além de unitários do core.
