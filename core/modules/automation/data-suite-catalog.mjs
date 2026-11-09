/** Browser-safe manifest; implementations and the CSV vendor load only in the worker. */
export const DATA_SUITE_DEFINITIONS = Object.freeze([
  {
    "type": "codec.csvRead",
    "category": "Intercâmbio",
    "label": "Interpretar CSV",
    "description": "PapaParse local: cabeçalho obrigatório, valores como texto, linhas consistentes e até 10.000 registros.",
    "fields": [
      {
        "key": "delimiter",
        "label": "Separador",
        "kind": "select",
        "default": ",",
        "options": [
          ",",
          ";",
          "tab",
          "|"
        ]
      }
    ]
  },
  {
    "type": "codec.csvWrite",
    "category": "Intercâmbio",
    "label": "Gerar CSV",
    "description": "Cabeçalhos e colunas consistentes. Protege fórmulas de planilha por padrão.",
    "fields": [
      {
        "key": "delimiter",
        "label": "Separador",
        "kind": "select",
        "default": ",",
        "options": [
          ",",
          ";",
          "tab",
          "|"
        ]
      },
      {
        "key": "formulaProtection",
        "label": "Proteger fórmulas",
        "kind": "select",
        "default": "yes",
        "options": [
          "yes",
          "no"
        ]
      }
    ]
  },
  {
    "type": "codec.ndjsonRead",
    "category": "Intercâmbio",
    "label": "Interpretar NDJSON",
    "description": "Uma estrutura JSON válida por linha; recusa a entrada inteira quando uma linha falha.",
    "fields": []
  },
  {
    "type": "codec.ndjsonWrite",
    "category": "Intercâmbio",
    "label": "Gerar NDJSON",
    "description": "Transforma uma lista em JSON separado por linhas, sem gravar arquivo automaticamente.",
    "fields": []
  },
  {
    "type": "records.distinctBy",
    "category": "Registros",
    "label": "Únicos por chave",
    "description": "Mantém o primeiro registro de cada chave simples, preservando tipos.",
    "fields": [
      {
        "key": "path",
        "label": "Campo-chave",
        "kind": "text",
        "default": "id"
      }
    ]
  },
  {
    "type": "records.countBy",
    "category": "Registros",
    "label": "Contagem por grupo",
    "description": "Retorna chave e contagem para cada categoria; sem converter tipos silenciosamente.",
    "fields": [
      {
        "key": "path",
        "label": "Campo do grupo",
        "kind": "text",
        "default": "categoria"
      }
    ]
  },
  {
    "type": "records.aggregateBy",
    "category": "Registros",
    "label": "Estatísticas por grupo",
    "description": "Calcula quantidade, soma, média, mínimo e máximo de um campo por grupo.",
    "fields": [
      {
        "key": "path",
        "label": "Campo do grupo",
        "kind": "text",
        "default": "categoria"
      },
      {
        "key": "valuePath",
        "label": "Campo numérico",
        "kind": "text",
        "default": "valor"
      }
    ]
  },
  {
    "type": "records.joinBy",
    "category": "Registros",
    "label": "Relacionar tabelas",
    "description": "Recebe {left:[],right:[]}. Relação muitos-para-um por chave; duplicatas à direita são erro.",
    "fields": [
      {
        "key": "leftKey",
        "label": "Chave esquerda",
        "kind": "text",
        "default": "id"
      },
      {
        "key": "rightKey",
        "label": "Chave direita",
        "kind": "text",
        "default": "id"
      },
      {
        "key": "mode",
        "label": "Tipo",
        "kind": "select",
        "default": "left",
        "options": [
          "left",
          "inner"
        ]
      }
    ]
  },
  {
    "type": "records.columnsToRows",
    "category": "Registros",
    "label": "Colunas para registros",
    "description": "Converte objeto de listas de igual comprimento em lista de objetos.",
    "fields": []
  },
  {
    "type": "records.rowsToColumns",
    "category": "Registros",
    "label": "Registros para colunas",
    "description": "Converte registros com as mesmas propriedades em objeto de listas.",
    "fields": []
  },
  {
    "type": "object.flattenPaths",
    "category": "Estruturas",
    "label": "Achatar objeto",
    "description": "Gera chaves com pontos. Listas e objetos vazios são preservados como valores; recusa chaves ambíguas.",
    "fields": []
  },
  {
    "type": "object.expandPaths",
    "category": "Estruturas",
    "label": "Expandir caminhos",
    "description": "Reconstrói objetos por chaves com pontos; recusa prefixos conflitantes e propriedades reservadas.",
    "fields": []
  },
  {
    "type": "object.entries",
    "category": "Estruturas",
    "label": "Objeto para pares",
    "description": "Retorna pares [chave,valor] das propriedades próprias.",
    "fields": []
  },
  {
    "type": "object.fromEntries",
    "category": "Estruturas",
    "label": "Pares para objeto",
    "description": "Constrói objeto a partir de pares; recusa chaves duplicadas ou reservadas.",
    "fields": []
  },
  {
    "type": "records.partition",
    "category": "Registros",
    "label": "Separar por valor",
    "description": "Retorna {matching:[],other:[]} conforme igualdade JSON em um campo, sem perder registros.",
    "fields": [
      {
        "key": "path",
        "label": "Campo",
        "kind": "text",
        "default": "ativo"
      },
      {
        "key": "value",
        "label": "Valor JSON",
        "kind": "json",
        "default": "true"
      }
    ]
  },
  {
    "type": "math.statistics",
    "category": "Análise",
    "label": "Estatísticas descritivas",
    "description": "Retorna soma, média, mediana, mínimo, máximo, variância e desvio padrão populacional.",
    "fields": []
  },
  {
    "type": "math.mapRange",
    "category": "Análise",
    "label": "Converter intervalo",
    "description": "Mapeia um número de um intervalo para outro. Extremos da origem não podem ser iguais.",
    "fields": [
      {
        "key": "inputMin",
        "label": "Origem mínima",
        "kind": "text",
        "default": "0"
      },
      {
        "key": "inputMax",
        "label": "Origem máxima",
        "kind": "text",
        "default": "100"
      },
      {
        "key": "outputMin",
        "label": "Destino mínimo",
        "kind": "text",
        "default": "0"
      },
      {
        "key": "outputMax",
        "label": "Destino máximo",
        "kind": "text",
        "default": "1"
      }
    ]
  },
  {
    "type": "engineering.convertUnit",
    "category": "Engenharia",
    "label": "Converter unidade",
    "description": "Converte comprimento, massa, pressão ou temperatura. Unidades incompatíveis são recusadas.",
    "fields": [
      {
        "key": "from",
        "label": "Unidade de origem",
        "kind": "select",
        "default": "mm",
        "options": [
          "mm",
          "cm",
          "m",
          "in",
          "ft",
          "g",
          "kg",
          "lb",
          "Pa",
          "kPa",
          "bar",
          "psi",
          "C",
          "F",
          "K"
        ]
      },
      {
        "key": "to",
        "label": "Unidade de destino",
        "kind": "select",
        "default": "m",
        "options": [
          "mm",
          "cm",
          "m",
          "in",
          "ft",
          "g",
          "kg",
          "lb",
          "Pa",
          "kPa",
          "bar",
          "psi",
          "C",
          "F",
          "K"
        ]
      }
    ]
  },
  {
    "type": "text.normalizeSpace",
    "category": "Texto",
    "label": "Normalizar espaços",
    "description": "Remove espaços externos e reduz sequências de espaços/quebras a um único espaço.",
    "fields": []
  },
  {
    "type": "text.slug",
    "category": "Texto",
    "label": "Gerar identificador URL",
    "description": "Normaliza acentos, usa letras/números ASCII e hífens. Resultado vazio é recusado.",
    "fields": []
  },
  {
    "type": "encoding.urlEncode",
    "category": "Codificação",
    "label": "Codificar componente URL",
    "description": "Codifica UTF-8 para uso como um componente de URL; não abre rede.",
    "fields": []
  },
  {
    "type": "encoding.urlDecode",
    "category": "Codificação",
    "label": "Decodificar componente URL",
    "description": "Decodifica porcentagens UTF-8; sequências inválidas são recusadas.",
    "fields": []
  },
  {
    "type": "date.epochConvert",
    "category": "Datas",
    "label": "Converter timestamp UTC",
    "description": "Converte milissegundos Unix e ISO UTC explícito. Não usa o fuso da máquina.",
    "fields": [
      {
        "key": "direction",
        "label": "Direção",
        "kind": "select",
        "default": "toISO",
        "options": [
          "toISO",
          "toEpoch"
        ]
      }
    ]
  },
  {
    "type": "date.difference",
    "category": "Datas",
    "label": "Diferença entre datas",
    "description": "Recebe {start,end} em ISO UTC explícito e calcula a duração, não dias de calendário locais.",
    "fields": [
      {
        "key": "unit",
        "label": "Unidade",
        "kind": "select",
        "default": "days",
        "options": [
          "milliseconds",
          "seconds",
          "minutes",
          "hours",
          "days"
        ]
      }
    ]
  },
  {
    "type": "records.coerceFields",
    "category": "Registros",
    "label": "Converter tipos de campos",
    "description": "Conversão explícita por esquema simples {campo:\"number|string|boolean\"}, sem alterar propriedades não listadas.",
    "fields": [
      {
        "key": "schema",
        "label": "Tipos por campo",
        "kind": "json",
        "default": "{\"valor\":\"number\"}"
      }
    ]
  },
  {
    "type": "encoding.stableJson",
    "category": "Codificação",
    "label": "JSON com chaves ordenadas",
    "description": "Serializa JSON com ordenação determinística das chaves; não é assinatura nem padrão de canonicalização RFC.",
    "fields": []
  }
].map(Object.freeze));
export const DATA_SUITE_CATALOG=Object.freeze(Object.fromEntries(DATA_SUITE_DEFINITIONS.map(({type,...definition})=>[type,{...definition,inputs:[{id:"in",type:"json",required:true}],outputs:[{id:"out",type:"json"}]}])));
