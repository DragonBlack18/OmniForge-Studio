# Dependências incorporadas na etapa 0.10.0

O lockfile registra a versão, URL de distribuição e integridade SHA-512. Os
pacotes de origem não foram alterados; adapters e validações do OmniForge ficam
em módulos separados.

| Pacote | Versão | Uso | Licença adotada / arquivo incluído | Fonte |
|---|---|---|---|---|
| elkjs | 0.12.1 | Organização de grafos em Web Worker sob demanda | EPL-2.0; `elkjs-EPL-2.0.md` | https://github.com/kieler/elkjs |
| dxf-parser | 1.1.2 | Parser estrutural de DXF no processo nativo | MIT; `dxf-parser-LICENSE.txt` | https://github.com/gdsestimating/dxf-parser |
| loglevel | 1.9.2 | Dependência transitiva de dxf-parser | MIT; `loglevel-LICENSE.txt` | https://github.com/pimterry/loglevel |

O manifesto de elkjs declara `EPL-2.0 OR GPL-3.0-or-later`; esta integração
seleciona a opção EPL-2.0 e reproduz a licença fornecida pelo pacote. O projeto
publica o código-fonte e instruções de geração no repositório indicado. A
distribuição exata de cada pacote é reproduzível pelas URLs e hashes de
`package-lock.json`.

O catálogo de 150 referências é um mapa de adoção e propostas. Um link ali não
indica código incorporado ou permissão genérica de cópia. Guias Autodesk e
outros produtos orientam fluxos de uso; não foi incluído código proprietário
desses produtos.

As notas anteriores de Monaco e PapaParse permanecem aplicáveis. Este registro
não altera a licença do código próprio do OmniForge.
