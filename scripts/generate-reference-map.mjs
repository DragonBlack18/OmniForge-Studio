import fs from 'node:fs/promises';
import {REFERENCE_CATALOG,REFERENCE_GROUPS,REFERENCE_STATUS} from '../core/modules/workspace/reference-catalog.mjs';
const file=new URL('../docs/REFERENCE_MAP.md',import.meta.url);
let content='# Mapa das 150 referências\n\nGerado por `npm run verify:references` a partir do mesmo catálogo exibido no aplicativo. Para regenerar: `node scripts/generate-reference-map.mjs`.\n\n'+
  'O estado **Integrado** identifica um componente efetivamente utilizado, incluindo ferramentas de teste/build. **Referência de produto** orienta a experiência. **Planejado** descreve uma possibilidade ainda indisponível. **Alternativa em avaliação** concorre com outra solução para a mesma função. Não são 150 dependências instaladas.\n\n';
for(const group of REFERENCE_GROUPS){
  content+='## '+group.label+'\n\n| Nº | Fonte | Estado | Aplicação / decisão | Evidência |\n|---|---|---|---|---|\n';
  for(const row of REFERENCE_CATALOG.filter(row=>row.group===group.id))content+=`| ${row.id} | [${row.name}](${row.url}) | ${REFERENCE_STATUS[row.status]} | ${row.proposal} | ${row.evidence??'Próxima etapa / referência'} |\n`;
  content+='\n';
}
content=content.trimEnd()+'\n';
if(process.argv.includes('--check')){
  if(await fs.readFile(file,'utf8')!==content)throw Error('REFERENCE_MAP.md diverge do catálogo. Regere o documento.');
  console.log('PASS reference ledger: 150 entries / 144 repositories / 6 guides.');
}else{await fs.writeFile(file,content);console.log('Updated docs/REFERENCE_MAP.md');}
