# Componentes incorporados na etapa 0.11.0

Os pacotes permanecem sem modificações. O lockfile contém versões exatas,
distribuições oficiais do npm e hashes de integridade. O código de integração
do OmniForge vive em módulos separados.

| Componente | Versão | Uso | Licença preservada | Fonte |
|---|---|---|---|---|
| @xterm/xterm | 6.0.0 | Emulação de terminal no renderer | MIT; `xterm-LICENSE.txt` | https://github.com/xtermjs/xterm.js |
| @xterm/addon-fit | 0.11.0 | Ajuste das linhas/colunas à superfície disponível | MIT; `xterm-addon-fit-LICENSE.txt` | https://github.com/xtermjs/xterm.js |
| node-pty | 1.1.0 | PTY em processo utilitário separado | MIT; `node-pty-LICENSE.txt` | https://github.com/microsoft/node-pty |
| node-addon-api | Versão transitiva fixada no lockfile | Interface Node-API do addon nativo | MIT; `node-addon-api-LICENSE.md` | https://github.com/nodejs/node-addon-api |
| winpty | Arquivos distribuídos no pacote node-pty | Componente legado preservado no pacote de origem | MIT; `winpty-LICENSE.txt` | https://github.com/rprichard/winpty |

O terminal Windows usa ConPTY do sistema. Os arquivos nativos oficiais do
node-pty são mantidos fora do ASAR, incluindo os componentes que acompanham o
pacote. O build não modifica nem substitui seus binários. O gate de distribuição
deve executar o PTY real com o runtime instalado; a presença de arquivos não
prova compatibilidade.

SQLite é utilizado pela API `node:sqlite` já incluída no runtime Node do
Electron. Não foram adicionados sql.js ou better-sqlite3. As licenças do runtime
e de seus componentes permanecem na distribuição do Electron; esta etapa não
altera essas condições. Documentação do runtime verificado:
https://nodejs.org/download/release/v24.22.1/docs/api/sqlite.html.

As 150 referências anteriores foram preservadas e o guia oficial Node SQLite
foi acrescentado como fonte 151. Cotas por entidade usam fórmulas delimitadas do
próprio módulo CAD; não incluem código nem um solver do SolveSpace.
