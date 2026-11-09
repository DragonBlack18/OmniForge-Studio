# Cotas persistentes e dimensões fixas — v0.11.0

O CAD pode guardar cotas associadas a cada objeto e usar seus valores para
controlar dimensões locais. As cotas aparecem no canvas, acompanham o histórico
de edição, são recuperáveis e permanecem no desenho salvo.

| Objeto | Cotas disponíveis | Efeito ao editar uma cota fixa |
|---|---|---|
| Linha | Comprimento | Mantém o ponto inicial e a direção; reposiciona o ponto final. |
| Retângulo | Largura e altura | Mantém o canto inicial e a orientação dos cantos; altera o tamanho em X ou Y. |
| Círculo | Raio ou diâmetro | Mantém o centro e altera o raio. Raio e diâmetro compartilham uma única cota. |
| Arco | Raio | Mantém centro e ângulos, alterando o raio do arco analítico. |

## Uso no inspetor

Selecione um objeto e abra **Cotas persistentes**. Escolha a grandeza,
o comportamento e o afastamento em milímetros; depois use **Adicionar cota**.
A cota pode ser selecionada na lista para edição ou removida pelo botão com
nome acessível. Todas essas ações participam de desfazer/refazer.
O Outliner oferece seleção de objetos por teclado, e os controles do inspetor
permitem operar as cotas sem clicar nos traços SVG. Cada traço do canvas não
introduz uma parada de tabulação. Campos inválidos preservam o texto,
associam a mensagem por `aria-describedby` e recebem foco no primeiro erro
ao submeter; a validação do domínio continua sendo a autoridade final.

- **Referência:** o valor é calculado a partir da geometria atual. Redimensionar
  o objeto atualiza a medida exibida; nenhum valor numérico desatualizado é salvo.
- **Fixa:** o valor faz parte do documento. Alterá-lo no editor de cotas atualiza
  a geometria e a intenção na mesma operação. Edições que contrariem a medida
  são recusadas sem produzir um resultado parcial.

O afastamento posiciona a anotação em relação ao objeto. Valores negativos
permitem posicioná-la do outro lado da linha de referência. A cota e sua
geometria têm o mesmo proprietário: duplicar ou criar uma matriz copia as
cotas, ocultar oculta a anotação e excluir o objeto elimina suas cotas.
Bloqueios do objeto e da camada também impedem alterar ou remover cotas.

## Dimensões fixas e transformações

O validador central confere dimensões fixas ao editar, transformar, carregar,
salvar, recuperar ou exportar um documento. As ações trabalham sobre cópias e
só retornam um novo desenho depois da validação completa.

Mover, espelhar e rotacionar uma linha preservam seu comprimento dentro da
precisão numérica indicada abaixo. Uma escala que altere uma dimensão fixa é
recusada. Uma paralela radial que copie um círculo/arco com raio fixo também
é recusada: o novo raio contrariaria a cota herdada. É possível mudar a cota
para referência antes de realizar essa operação.

Largura e altura do retângulo são medidas nos eixos X e Y, conforme a
representação atual do CAD. Uma rotação de 90° que troque medidas diferentes
fixadas é recusada. O editor de cotas permite liberar a medida explicitamente;
as operações não removem restrições automaticamente.

Não há relações entre objetos, coincidentes, tangências, fórmulas, variáveis
compartilhadas, restrições angulares nem resolução geral de um sistema de
equações. Cada dimensão usa a geometria da própria entidade.

## Documento e compatibilidade

Documentos antigos `schemaVersion:1` continuam aceitos. A primeira cota
promove o desenho para `schemaVersion:2`. Versões antigas do OmniForge recusam
esse documento em vez de ignorar silenciosamente as dimensões fixas.

O campo opcional `dimensions` pertence à entidade e contém no máximo duas
cotas, sem referências a outros objetos. Exemplo:

```json
{
  "kind": "length",
  "mode": "fixed",
  "value": 80,
  "offset": 10
}
```

Uma cota de referência não contém `value`. Tipos incompatíveis, chaves
desconhecidas, cotas repetidas e combinações redundantes de raio/diâmetro são
recusados. Remover a última cota mantém a versão 2; desfazer pode restaurar o
snapshot anterior completo, inclusive a versão 1.

A origem DXF, os identificadores, as camadas e os estados do objeto são
preservados. O histórico e a recuperação usam o desenho completo. O envelope
de recuperação continua na versão 1, contendo um desenho de versão 1 ou 2.
As revisões SHA-256 e a recusa de salvamentos concorrentes permanecem ativas.

## Precisão e limites

As dimensões usam milímetros e valores positivos com até quatro casas
decimais. O afastamento deve ser diferente de zero, entre 0,0001 e 10.000 mm
em valor absoluto. Limites de entidades, camadas, coordenadas e documento de
1,5 MB permanecem; criar uma cota também verifica o tamanho final serializado.

O comprimento de uma linha depende de dois pontos arredondados a quatro
casas. Ao conferir uma cota fixa, a tolerância é o menor valor entre
**0,00015 mm** e **0,1% do valor fixado**. A tolerância não é acumulada: cada
operação é comparada ao mesmo valor nominal armazenado. Raio, diâmetro,
largura e altura usam tolerância de `1e-8` mm para diferenças de ponto flutuante.
Valores que não podem ser representados pela geometria quantizada são
recusados; a cota não autoriza ultrapassar os limites do desenho.

Essas tolerâncias descrevem o modelo numérico do software e não qualificam
um processo de fabricação.

## Exportações e automação

**SVG** inclui linhas de cota e textos calculados. O enquadramento considera
as anotações para evitar cortá-las. As cotas não contam como geometria nos
relatórios de comprimento, área ou número de objetos.

**DXF** continua usando o subconjunto geométrico R12. Ao exportar um desenho
cotado pela interface, o aplicativo pede confirmação de **Exportar só
geometria**. Cancelar não cria nem substitui a saída. Aceitar exporta uma
cópia sem cotas e preserva o documento nativo, o histórico e as restrições.
Não são geradas entidades TEXT ou DIMENSION sem suporte de importação.

Chamadas diretas ao exportador DXF e o nó de automação de exportação recusam
desenhos com cotas, com uma explicação, em vez de descartá-las. O fluxo pode
exportar SVG para conservar a apresentação cotada. Relatórios geométricos
continuam lendo documentos v2 e medindo somente a geometria.

## Verificação

`tests/cad-dimensions.test.mjs` cobre promoção de formato, medidas de referência,
edição por cotas fixas, invariantes em todas as operações, tolerâncias,
metadados hostis, limites, bloqueios, cópias, exclusão, persistência, recuperação,
histórico, revisões divergentes, SVG e a fronteira explícita do DXF.

`scripts/smoke-cad-dimensions.mjs` usa Electron e um DXF real em workspace e
perfil temporários. Exercita controles, desenho, desfazer/refazer, cópias,
edições recusadas, salvamento/reabertura, recuperação de cota não salva,
SVG e cancelamento/aceitação da exportação de geometria DXF. Gera capturas
em 1440×900 e 1040×680 e evidência JSON em `smoke-artifacts/cad-dimensions*`.

As provas de sandbox, exclusão de instância e distribuição pertencem aos
gates Windows sem adaptações do ambiente local.
