# OmniForge Studio v0.3.0 — Extension Hub / OFX v1

**Contrato:** `schemaVersion=1` · **Status:** em desenvolvimento; a aprovação depende do CI, E2E Electron e pacote Windows. Código original, sem copiar código-fonte ou binários de terceiros.

## Objetivo de engenharia

Disponibilizar extensibilidade local no mesmo workspace que já possui editor de código, CAD 2D, catálogo de projetos, APIs locais e automações. Adicionar ações sem editar o motor para cada novo caso específico, mas **sem executar código não confiável**. Os pacotes OFX v1 são documentos JSON que descrevem uma sequência de operações já implementadas no core, não bibliotecas carregadas dinamicamente.

### Referências técnicas e critérios

1. **Eclipse Theia:** extensões em processos dedicados e APIs definidas; adotamos a separação entre contratos declarativos e o motor, mas **não** incluímos o host VS Code/Theia, LSP ou Open VSX. https://theia-ide.org/docs/extensions/
2. **Node-RED:** nós com propósito claro, entradas e saídas consistentes, limites e falhas tratadas; adotamos a ideia de catálogo de ações e validação por nó, não seu runtime. https://nodered.org/docs/creating-nodes/
3. **Electron Security:** manter `contextIsolation`, `sandbox`, `nodeIntegration:false`, IPC allowlist com verificação de origem, navegação bloqueada e diálogos nativos. https://www.electronjs.org/docs/latest/tutorial/security/
4. **Open VSX:** ecossistema futuro sujeito a compatibilidade e licenciamento de cada extensão, **não** fonte de pacotes OFX v1. https://www.eclipse.org/legal/open-vsx-registry-faq/
5. **Electron utilityProcess:** mecanismo a considerar para executar programas de terceiros em sandbox de processos no futuro; processo isolado *sozinho* não cria uma sandbox de segurança. https://www.electronjs.org/docs/latest/api/utility-process

## Formato do manifesto

Um arquivo chamado `nome.ofx.json` precisa conter:

```json
{
  "schemaVersion": 1,
  "id": "br.omniforge.engenharia",
  "version": "1.0.0",
  "name": "Engenharia de dados",
  "description": "Transformações de engenharia com dados reais.",
  "permissions": ["workflow.transform", "workspace.output.write"],
  "actions": [
    {
      "id": "kg-para-gramas",
      "name": "Converter kg em gramas",
      "description": "Recebe JSON com massaKg, calcula massaGramas.",
      "steps": [
        {"op": "pick", "path": "massaKg"},
        {"op": "number.scale", "factor": 1000},
        {"op": "number.round", "digits": 3},
        {"op": "wrap", "key": "massaGramas"}
      ],
      "outputFile": "massa-convertida.json"
    }
  ]
}
```

O arquivo de exemplo completo fica em `examples/engenharia.ofx.json` e implementa **duas ações reais**. O mesmo pacote pode ser instalado diretamente pela UI com **Instalar exemplo funcional**, sem simular respostas.

### Operações permitidas pelo OFX v1

| Operação | Contrato | Efeito |
|---|---|---|
| `pick` | `path` seguro, por exemplo `massaKg` | Seleciona campo existente do JSON de entrada |
| `wrap` | `key` seguro | Cria um objeto contendo o valor atual |
| `number.scale` | `factor` numérico finito | Multiplica número e limita overflow |
| `number.round` | `digits` inteiro 0–6 | Arredonda o número |
| `text.trim` | Sem argumentos | Remove espaços do começo/fim |
| `text.upper` | Sem argumentos | Converte texto para maiúsculas (pt-BR) |
| `text.lower` | Sem argumentos | Converte texto para minúsculas (pt-BR) |
| `text.template` | `template` com `{{campo.subcampo}}` | Gera texto usando dados de entrada, sem interpretar JavaScript |
| `array.length` | Sem argumentos | Quantidade de itens na lista |
| `json.stringify` | Sem argumentos | Serializa o JSON atual em string |

Não são aceitos campos desconhecidos no manifesto, operações fora dessa tabela, chaves `__proto__` / `constructor` / `prototype`, caminhos arbitrários, nomes de saída fora do padrão ou etapas que carreguem bibliotecas. Os valores de entrada/saída devem ser serializáveis como JSON e ter até 128 KB.

### Permissões

- **workflow.transform:** autoriza transformar o valor do fluxo. O pacote instalado ou ativado não recebe a permissão automaticamente.
- **workspace.output.write:** permite gravar o resultado **somente** em `.omniforge/output/<nome>.json` do workspace aberto, utilizando a API de gravação existente e sua proteção de symlink/limite. Não concede acesso de escrita a outros arquivos do usuário.
- Cada permissão é concedida ou revogada por **workspace canônico**, identificado por SHA-256 do caminho resolvido. Uma autorização do projeto A não vale para o projeto B.
- Revogar uma permissão impede novas execuções, mas não remove artefatos gravados em execuções anteriores.
- Instalar um pacote é uma operação diferente de ativar o pacote e de conceder cada permissão. **Atualizar** um manifesto com conteúdo diferente desativa-o e revoga as autorizações antigas em todos os workspaces.
- Instalar e conceder uma permissão exige confirmação nativa no Electron. O padrão do diálogo é **Cancelar**.
- O runtime pega a lista de manifestos/grants do registro do processo principal antes de executar. O renderer nunca pode enviar um manifesto de extensão como permissão implícita para o executor. Modificações no registro são bloqueadas enquanto um fluxo está em execução.

## Persistência

- Registro global: diretório `extension-hub/extensions.json` dentro do `app.getPath('userData')` do Electron. Versão do schema = 1. Gravação atômica, limite de 2 MB e permissões locais restritas.
- Não há cópia nem modificação dos diretórios originais dos projetos no ato da instalação, desinstalação ou grant.
- A integridade SHA-256 do pacote é verificada a cada leitura do registro. **SHA-256 não prova quem publicou o pacote**, nem impede um administrador local de modificar programa e registro juntos.
- O arquivo `.omniforge/flows/principal.json` permanece na mesma versão de schema. Fluxos antigos continuam compatíveis. Nós `extension.call` inválidos são bloqueados explicitamente se a extensão for removida ou ficar sem permissão.

## Execução real e simulação

Um fluxo pode usar `trigger.manual → extension.call`. O nó declara `extensionId` e `actionId` e é submetido às validações de tipos, DAG e concessões de acesso. No worker supervisionado, a sequência de operações é processada com limites de tamanho e tempo. Se a ação declarar `outputFile`, somente a função existente `writeOutputJson()` produz o artefato. `dryRun` calcula a transformação real, mas o artefato é marcado `simulated=true` e nenhum arquivo é criado.

Fluxos `extension.call` não conseguem realizar HTTP, rodar executáveis, ler arquivos arbitrários, invocar CAD 3D, instalar pacotes de outras fontes nem acessar credenciais. Os logs armazenam status, tempo e caminhos relativos de artefatos, não valores JSON de entrada ou a saída textual gerada.

## Limites explícitos

| Item | Limite |
|---|---|
| Extensões instaladas | 40 |
| Ações por extensão | 16 |
| Etapas por ação | 24 |
| Tamanho do manifesto | 128 KB |
| Tamanho máximo de um valor JSON em execução | 128 KB |
| Registro de extensões | 2 MB |
| Tempo de uma execução | 120 s por padrão, máximo interno de 180 s |
| Formato de pacote | `.ofx.json`, arquivo local selecionado |
| Scripts de terceiros | **Não suportados** |
| Saída persistida | JSON somente em `.omniforge/output` mediante grant |

## Operações do usuário na interface

1. Abrir o projeto.
2. Sidebar → **Extensões** → **Instalar exemplo funcional** ou importar um arquivo `.ofx.json`.
3. **Gerenciar** → **Ativar**.
4. Marcar `workflow.transform` e confirmar o diálogo nativo. Marcar `workspace.output.write` somente se uma ação precisar gravar resultado.
5. Clicar em **Adicionar ao fluxo** na ação. O OmniForge insere um nó real, selecionável e configurável.
6. Conectar a entrada JSON ao nó e usar **Validar**, **Simular** e **Executar**.
7. Conferir o resultado, o histórico e, se autorizado, o arquivo em `.omniforge/output`.
8. Revogar o grant ou desativar/desinstalar sem destruir os dados históricos.

## Evidências de teste e release gates

- Testes Node: rejeição de manifesto com operações desconhecidas, paths perigosos, duplicatas, permissões inválidas, adulteração de hash, symlink, atualização, isolamento de workspace, revogação e preservação de arquivos.
- Integração real Node: executar pelo worker separado, verificar bytes JSON no disco e histórico de metadados, e confirmar que o modo simulação não gera diretórios/artefatos físicos.
- Electron E2E Windows: instalar o pacote nativo, instalar o exemplo funcional, ativar, conceder grants em diálogo real, validar e executar fluxo, verificar o arquivo real, adicionar ao canvas, revogar e desinstalar.
- Compatibilidade: smoke original do Electron, CAD DXF, Node Windows/Linux e build Vite.
- Pré-release: somente após Windows Portable/Setup, teste de instalação/desinstalação, hashes SHA-256 e checks verdes no **mesmo commit**.

## Para chegar a uma plataforma de produção completa

O OFX v1 soluciona a extensibilidade **declarativa**. Ainda faltam: host de código assinado e sandbox do sistema operacional para módulos de terceiros, Theia/VSIX, CAD 3D paramétrico, credenciais, agendamento persistente, workflow recovery distribuído, plugins de rede e OT, SBOM, assinaturas de instalador, testes de recuperação de desastres, QA em hardware real e políticas de autorização empresarial. Essas funcionalidades **não** são declaradas prontas ou seguras apenas porque existe um botão na UI.
