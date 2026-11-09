# Modelo de segurança e limitações — 0.11.0

Este documento descreve as fronteiras implementadas no código atual. Os
subtítulos com versões anteriores identificam a origem de cada componente;
não são declarações de certificação ou de aprovação de uma release.
Os resultados de testes e de empacotamento devem corresponder ao commit e
ao sistema operacional efetivamente verificados.

## Fronteiras de confiança

| Superfície | Política atual | Lacuna/expansão |
|---|---|---|
| Renderer Electron | `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, `webSecurity: true` | Validar também o artefato empacotado; sandbox do renderer não contém scripts aprovados |
| IPC | Métodos nomeados no preload; verificação da janela, frame principal e documento; limites de payload/concurrency | Fuzzing adicional e testes adversariais por método |
| Conteúdo de janela | `omni://app`, CSP de produção, bloqueio de popups, navegação, downloads e permissões da sessão | Desenvolvimento usa somente a origem local explicitamente configurada; manter gates do build e Monaco |
| Arquivos | Workspace escolhido no host, validação de caminhos/revisões, rejeição de symlinks e limites de tamanho | Races com processos hostis e reparse points exigem auditoria específica Windows |
| Grafo | Nós/portas conhecidos, DAG, configurações validadas; conexões editadas e layout não executam o fluxo | A validação estrutural não prova a correção de um processo de negócio |
| Fluxo declarativo | Processo filho supervisionado, operações conhecidas, HTTP local sujeito a aprovação | Sem sandbox de sistema operacional, cota de CPU/memória ou rollback |
| Código do workspace | Tarefas npm e arquivos Node/Python somente após confirmação nativa; revisão e ambiente conferidos | O código aprovado conserva permissões da conta e pode usar rede/arquivos |
| Terminal interativo | Shell do sistema aprovado, PTY em utility process, sessão/workspace fixados, entrada/saída limitadas e ACK | Comandos reais com permissões da conta; sem rollback, confinamento ao workspace ou garantia contra processos desvinculados |
| SQLite | Snapshot offline, processo descartável, authorizer, limites, transação controlada e cópia exclusiva | Rascunho em memória; sem banco WAL vivo ou recuperação após queda de todo o app |
| Segredos | Sem catálogo geral de credenciais; ambiente dos executores filtrado | Código aprovado ainda pode ler arquivos acessíveis à conta; recuperação de fluxo protegida disponível apenas quando o serviço Windows responde |
| Atualização | Sem atualização automática; configuração de integridade/fuses para os pacotes | Assinatura e evidências de cada artefato precisam ser verificadas separadamente |
| Industrial | Sem escrita/controladores industriais | Approval gates, simulação, segregação OT, análise funcional |

## Limites conhecidos

O aplicativo **não** é uma sandbox geral de programas do usuário. Os nós
de fluxo e extensões continuam declarativos, sem `eval` ou código livre.
As ferramentas de desenvolvimento executam código real do workspace após
autorização específica. Essa autorização não confere isolamento ao código:
ele mantém as permissões da conta que abriu o OmniForge.

O editor grava arquivos quando o usuário ordena salvar e confere a revisão
esperada para detectar conflitos. Recuperação de rascunhos não equivale a
histórico completo ou backup: use Git e backups para preservar versões
importantes. Scripts, ferramentas externas e outros processos podem alterar
os mesmos arquivos fora dos controles do editor.

Escritas em `.omniforge/` verificam diretórios e links simbólicos antes da operação. Em ambientes com concorrência maliciosa no filesystem, verificações entre `lstat` e `rename` não eliminam todas as condições de corrida; o produto exige auditoria adicional antes de manipular conteúdo hostil.

O modo simulação de **fluxos declarativos** não executa efeitos externos.
Executar arquivo, Executar testes e tarefas npm são operações reais; não
herdam um modo simulação. Para dispositivos físicos, toda operação de
controle deve exigir permissão específica, e a primeira etapa industrial
permanece exclusivamente leitura.

## IPC, coordenação e fechamento

O preload não expõe `ipcRenderer`, `child_process` ou um caminho de
executável escolhido pelo renderer. O terminal possui entrada interativa
somente para uma sessão de shell já aprovada pelo usuário. A fronteira
nativa aceita chamadas somente da janela registrada e de seu frame principal.
O limite estrutural geral é 2,2 MB, 80 mil itens e profundidade 64; validações
de cada recurso podem impor limites menores. Existem até 32 chamadas de
dados e 12 de controle em andamento. Cancelamento tem uma via de controle
para continuar disponível durante o fechamento.

Tarefas npm, execução Node/Python, fluxos manuais e scheduler compartilham
gates no host. A preparação e a confirmação de código também reservam a
operação; salvar arquivos, trocar workspace e outras mutações conflitantes
são bloqueados. Esses gates coordenam esta instância do aplicativo, não
processos externos que acessam o mesmo filesystem.

O consentimento de abertura do terminal participa do gate; a sessão aberta
pode coexistir com edição e runners. Trocar workspace exige encerrá-la.
Operações e confirmações SQLite entram no gate, e a cópia em andamento é
tratada como commit não interrompível. Alterações SQLite não salvas são
contabilizadas pelo host, independentemente de o renderer informar dirty.

O fechamento normal aguarda commits e confirmações pendentes. Havendo
execução ativa, a confirmação de saída solicita cancelamento e aguarda a
conclusão antes de encerrar. A perda do renderer solicita cancelamento;
no módulo de desenvolvimento, isso também invalida consentimento pendente
antes da criação do processo. Encerramento forçado do sistema ou do processo
principal não equivale a esse fluxo normal de fechamento.

Recarregar somente o renderer permite consultar `activeWorkspace` e reanexar
o contexto que o host já abriu. A rota é somente leitura e não seleciona
pastas nem executa programas. Uma falha de leitura do fluxo é retornada com
o contexto nativo, permitindo encerrar o terminal ou preservar uma cópia do
banco em vez de deixar essas sessões inacessíveis.

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

## Executor supervisionado v0.2.1

O fluxo declarativo é executado por `core/run-child.cjs` como processo filho do motor, não no processo privilegiado da janela. O processo recebe apenas grafo, workspace, projetos autorizados e consentimento para API local; o ambiente herdado é restrito às variáveis operacionais permitidas. Existe limite temporal padrão de 120 segundos (máximo interno 180 segundos) e cancelamento por `AbortController`. A UI não recebe acesso a `child_process`, e os eventos de progresso contêm apenas metadados de etapas.

**Limitação:** isolamento em processo NÃO é sandbox de segurança para plugins ou execução de código não confiável. Não existe limitação de memória/CPU do sistema operacional nem garantia de rollback. Cancelamento ou crash podem interromper operações não idempotentes depois de efeitos externos parciais. Os nós do grafo não executam JS/Python/PowerShell arbitrário. Execução de código Node/Python e scripts npm é uma operação distinta, com confirmação própria, descrita abaixo. Avaliar casos de desligamento forçado, crashes, assinatura do binário e comportamento do processo filho empacotado antes de qualquer classificação como pronto para produção.

### Falha do processo principal
Se o canal IPC entre o executor e o processo principal cair, o worker encerra imediatamente sem continuar etapas assíncronas. Isso reduz execuções órfãs após crash, mas não desfaz gravações ou chamadas de rede concluídas. O teste de regressão simula desconexão de IPC durante HTTP lento.

## Desenvolvimento local — Node.js, Python e tarefas npm

O módulo **Executar e testar** aceita somente arquivos `.js`, `.cjs`, `.mjs`
e `.py` salvos no workspace. A solicitação IPC contém apenas caminho relativo,
SHA-256, ação e argumentos; campos adicionais são rejeitados. A descoberta
não executa o projeto ou interpretadores, ignora symlinks, diretórios ocultos,
dependências e pastas geradas, e limita profundidade/quantidade de entradas.
Fonte acima de 1 MB, caminho protegido, revisão divergente ou arquivo não
regular não se torna um alvo executável.

Node é localizado por caminho absoluto no PATH. Python procura um ambiente
`.venv`/`venv` do workspace e depois o PATH; aliases da Windows Store não
comprovam instalação. O diálogo nativo mostra o executável, arquivo salvo,
hash e argumentos, com **Cancelar** como opção padrão. O usuário deve
confiar também no interpretador e nas dependências daquele projeto.
Encontrar um arquivo executável não comprova sua autenticidade.

O arquivo e a identidade de caminho do interpretador são conferidos de novo
após a aprovação. Isso detecta alterações comuns, mas não oferece pinning
criptográfico do conteúdo do interpretador, das bibliotecas importadas ou
de todos os arquivos do projeto. Também não elimina races entre a última
checagem e a abertura pelo sistema operacional.

O processo inicia com `shell: false` e argumentos separados. O renderer não
controla flags do interpretador, ambiente ou diretório de trabalho. O ambiente
herdado conserva apenas variáveis operacionais permitidas: `NODE_OPTIONS`,
`PYTHONPATH`, `PYTHONHOME` e credenciais arbitrárias não são repassados.
Python não grava bytecode automaticamente. A verificação Python usa AST em
modo isolado, sem importar o módulo selecionado; Node usa `--check`.
Executar testes importa/executa o código: Node usa seu test runner e Python
usa `unittest`, com falha explícita se a suíte estiver vazia.

Há limite de 120 segundos, 96 KB de saída e captura dos últimos 48 mil
caracteres. Argumentos são limitados a 64 valores, 2 KB por valor e 16 KB
no conjunto. A entrada padrão é fechada. Excesso de saída, timeout, erro de
inicialização, código de saída não zero e cancelamento aparecem como estados
distintos; nenhuma dessas situações é apresentada como sucesso.

Interromper tenta terminar a árvore normal de subprocessos usando um grupo
de processos em POSIX e `taskkill /T /F` no Windows. Isso não é um Job Object
ou sandbox nativa, e não garante contenção de processos que se desvinculem
ou sobrevivam à falha abrupta do host. Arquivos já alterados e chamadas de
rede concluídas não são revertidos. Programas interativos podem usar o
módulo Terminal, com consentimento e ciclo de vida próprios; não passam a
ser compatíveis com este runner.

Tarefas npm continuam em módulo separado e exigem confirmação do comando
definido no `package.json`, além de revisão do manifesto. O comando escolhido
é executado por `npm --ignore-scripts run`: o script solicitado ainda executa
código e pode usar o shell interno do npm, instalar dependências ou iniciar
outros processos. A flag não transforma o script aprovado em uma operação
sem efeitos. O histórico desse módulo grava metadados finais; a nova execução
direta Node/Python mantém argumentos e saída apenas na memória da sessão.
Nenhum mecanismo impede o próprio script de persistir o que desejar.

Os testes específicos cobrem Node/Python reais, saída/Unicode, argumentos
literais, sintaxe, testes que passam/falham, revisão alterada, ambiente
filtrado, conflitos, timeout, excesso de saída, cancelamento e consentimento
tardio. O smoke de desenvolvimento cobre UI → preload → IPC → processo real
em workspace/perfil temporários. Ver [DEVELOPMENT_RUNTIME.md](DEVELOPMENT_RUNTIME.md)
para comandos e requisitos. Testes Linux executados como root com um wrapper
externo `--no-sandbox` validam a funcionalidade nesse fixture, **não** a sandbox
do renderer nem o empacotamento Windows; o produto preserva `sandbox: true`.

## Terminal interativo v0.11.0

xterm.js recebe somente texto e eventos validados. O addon node-pty roda em
processo utilitário Electron, nunca no renderer ou no processo principal.
PowerShell inicia sem perfil, Prompt sem AutoRun e Bash sem rc/perfil; o
host resolve caminhos conhecidos e filtra o ambiente. Após o consentimento,
o shell executa a entrada digitada normalmente, inclusive comandos que
alteram arquivos ou acessam a rede com as permissões da conta.

Entrada, dimensões, retenção e fila de saída são limitadas. O host recebe
ACK após o parser xterm consumir a saída, e o worker pausa/retoma o PTY para
controlar o produtor. OSC 52 e OSC 8 não disparam clipboard ou navegação.
Copiar seleção é um método próprio, limitado a 64 KB e vinculado à sessão;
não relaxa a política de permissões do Chromium.

Fechar espera confirmação de término do worker. A limpeza de subprocessos
usa recursos do sistema, sem Job Object ou contêiner; processos que se
desvinculem deliberadamente não têm contenção garantida. Saída, comandos e
entrada não entram no diagnóstico persistido pelo OmniForge, mas o shell
e seus programas podem manter seus próprios históricos e arquivos.

O pacote node-pty fica fora do ASAR para carregar o addon e os auxiliares.
O helper de encerramento do addon usa o Electron instalado com RunAsNode;
essa flag não é passada ao shell. O gate do executável instalado abre um
PTY, redimensiona, escreve um arquivo e verifica o encerramento. Ver
[TERMINAL_WORKBENCH.md](TERMINAL_WORKBENCH.md).

## SQLite local v0.11.0

O host lê apenas arquivos regulares selecionados dentro do workspace, com
limite de 32 MiB. Recusa links, cabeçalho WAL e auxiliares `-wal`, `-shm` ou
`-journal`; não faz checkpoint nem remove arquivos da origem. A imagem é
validada em SQLite e conservada no processo principal. Ela não representa
uma conexão viva ou um backup consistente de um banco simultaneamente aberto.

Cada consulta/alteração executa em processo descartável com SQLite nativo.
O authorizer recusa anexos, PRAGMA do usuário, transações/savepoints próprios,
extensões e tabelas temporárias/virtuais. `trusted_schema` fica desligado;
temporários ficam em memória. Consulta é somente leitura. Aplicar executa
o script inteiro em uma transação sobre uma imagem candidata. Falha,
cancelamento ou prazo de 10 segundos descartam essa imagem, preservando a
última aceita. Resultados têm limites de linhas, colunas, bytes e prévias.

Salvar cópia exige destino novo e consentimento nativo com a revisão atual;
a gravação usa `wx` e sincronização. A origem nunca é sobrescrita. O hash
da origem identifica o snapshot lido e não é uma promessa de sincronização
com alterações externas. A sessão sobrevive à recarga do renderer, mas não
ao encerramento de todo o aplicativo. Copiar JSON usa uma rota específica
vinculada à sessão e limitada a 2 MiB. Ver
[DATABASE_WORKBENCH.md](DATABASE_WORKBENCH.md).

## Importação DXF 2D v0.2.2

A fonte é selecionada pelo diálogo nativo de arquivo e nunca por um caminho arbitrário do renderer. Extensão .dxf, tamanho até 2 MB, arquivo regular, sem symlink e UTF-8 válido. O parser não executa código nem plugins e valida unidades/geometrias antes de criar o documento em memória. Sem INSUNITS, o usuário deve aceitar explicitamente interpretar milímetros; o padrão é cancelar. A importação não grava nem substitui documentos automaticamente e usa as revisões SHA-256 existentes ao salvar.

Na 0.10.0, ARC e segmentos com bulge de LWPOLYLINE são convertidos em arcos
2D; INSERT pode expandir blocos suportados com transformações verificadas.
O importador limita grupos, camadas, entidades e expansão de blocos, rejeita
ciclos e profundidade superior a 8. Blocos dinâmicos, atributos, XREF, matrizes
de INSERT, SPLINE, DWG, paper space e geometria 3D não são aceitos. Entidade
ou transformação incompatível cancela a importação inteira, evitando que
uma importação parcial seja apresentada como desenho completo.

## Extension Hub declarativo v0.3.0

A instalação de pacote `.ofx.json` exige seleção nativa e aprovação explícita, não executa código nem baixa dependências. O manifesto permite apenas 10 operações conhecidas, sem `eval`, `Function`, imports, comandos, acesso ao OS ou conexões de rede. Os grants são específicos ao workspace real e mantidos no perfil do Electron; a instalação é desativada por padrão, a atualização invalida grants e a desinstalação preserva arquivos e fluxos.

O motor recebe um snapshot de extensões obtido **somente** no processo principal, nunca passado pelo renderer. O grafo verifica a extensão, a ação, o estado e os grants antes de executar; o worker reutiliza a autorização e somente a função de saída JSON controlada. A execução possui timeout/cancelamento como os demais nós. Um hash SHA-256 detecta adulteração no registro local, mas não atesta autenticidade/autoria nem impede um usuário com acesso pleno ao SO de alterar código/registro conjuntamente.

**Lacunas explícitas:** ausência de assinatura criptográfica de pacotes por editor confiável, sandbox de código arbitrário, limites de memória nativos, políticas empresariais de aprovação, autenticação multiusuário, atualizações automáticas, scanner de malware e serviço de suporte. Releases Windows continuam sem assinatura e sem declaração de certificação industrial.

## Scheduler local v0.4.0 — autorização, integridade e falhas

Agendas ficam em `app.getPath('userData')/local-schedules/schedules.json`, versão 1. O arquivo contém somente UUID de projeto cadastrado, frequência limitada, revisão SHA-256 do fluxo salvo, carimbos de tempo e estado mínimo; nunca o conteúdo do fluxo, resposta de API nem tokens. A pasta e o arquivo não podem ser links simbólicos. Alterações usam escrita atômica e mutex no processo principal.

A ativação ou execução imediata exige diálogo nativo com Cancelar como padrão. Scheduler executa **somente** fluxos declarativos locais: nós HTTP e chamadas de APIs de outros projetos são explicitamente recusados. Extensões declarativas continuam exigindo grants por workspace. Um fluxo atualizado no disco deixa a revisão de coincidir e é bloqueado até a aprovação de outra versão.

Existe um único executor supervisionado por instância Electron, compartilhado com a execução manual. Antes de iniciar qualquer efeito, o scheduler grava duravelmente uma claim com token; após crash interrompendo essa claim, a tarefa fica pausada na próxima abertura. Não há reexecução automática de horários perdidos. Mesmo assim, efeitos externos/arquivos já gravados antes de um crash podem permanecer e não são revertidos; por isso **não há garantia de exactly-once**. A agenda não opera com o aplicativo fechado, nem controla hardware/produção industrial.

Limitações por revisar antes de considerar produção empresarial: coordenação multiinstância, Windows Service e reinício sem login, migração e backup do registro, auditoria de clock/DST, RBAC para usuários distintos, assinatura digital de binários, failover distribuído, rollback/idempotência de conectores e métricas exportáveis.
