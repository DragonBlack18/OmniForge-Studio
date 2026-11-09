/** Self-contained: serialized into the installed Electron executable's test payload.
 * Every application import is resolved under coreRoot (the installed app.asar).
 * The caller supplies a newly created disposable workspace, never a user project.
 */
export async function runPackagedProjectChecks(coreRoot, workspace) {
  const {default: assert} = await import('node:assert/strict');
  const {default: fs} = await import('node:fs/promises');
  const {default: path} = await import('node:path');
  const {pathToFileURL} = await import('node:url');
  const {createHash} = await import('node:crypto');
  assert.ok(path.isAbsolute(coreRoot) && path.isAbsolute(workspace));
  const load = relative => import(pathToFileURL(path.join(coreRoot, relative)).href);
  const {runSupervisedFlow} = await load('supervisor.mjs');
  const {findTemplate} = await load('templates.mjs');
  const {DATA_SUITE_CATALOG} = await load('modules/automation/data-suite-catalog.mjs');
  const {DATA_SUITE_EXECUTORS} = await load('modules/automation/data-suite.mjs');
  assert.equal(Object.keys(DATA_SUITE_CATALOG).length, 26);
  assert.deepEqual(new Set(Object.keys(DATA_SUITE_EXECUTORS)), new Set(Object.keys(DATA_SUITE_CATALOG)));
  const vendors = JSON.parse(await fs.readFile(path.join(coreRoot, 'vendor/manifest.json'), 'utf8'));
  assert.ok(vendors.some(v => v.name === 'PapaParse' && v.license === 'MIT'));
  for (const vendor of vendors) {
    assert.match(vendor.file, /^core\/vendor\/[A-Za-z0-9._-]+$/);
    assert.match(vendor.licenseFile, /^third-party-notices\/[A-Za-z0-9._-]+$/);
    const source = await fs.readFile(path.join(path.dirname(coreRoot), vendor.file));
    const license = await fs.readFile(path.join(path.dirname(coreRoot), vendor.licenseFile));
    assert.equal(createHash('sha256').update(source).digest('hex'), vendor.sha256);
    assert.equal(createHash('sha256').update(license).digest('hex'), vendor.licenseSha256);
  }
  const cases = [
    ['csv-consolidado', 'csv-consolidado.json', value => assert.deepEqual(value, [
      {key:'A',count:2,sum:140.5,min:20,max:120.5,average:70.25},
      {key:'B',count:1,sum:80,min:80,max:80,average:80}
    ])],
    ['conciliar-tabelas', 'conciliacao.json', value => assert.deepEqual(value, [
      {left:{id:1,quantidade:3},right:{id:1,descricao:'Parafuso M8'}},
      {left:{id:2,quantidade:5},right:null}
    ])],
    ['estatistica-medidas', 'estatistica-medidas.json', value => {
      assert.equal(value.count,5); assert.ok(Math.abs(value.mean-10.2)<1e-10);
      assert.equal(value.min,10); assert.equal(value.max,10.4);
    }],
    ['ndjson-inspecao', 'inspecao-ndjson.json', value => assert.deepEqual(value, {
      matching:[{id:1,ativo:true,valor:12.5}],other:[{id:2,ativo:false,valor:8}]
    })]
  ];
  const options = {workspace,dryRun:false,networkApproved:false,projects:[]};
  for (const [id, name, verify] of cases) {
    const flow = structuredClone(findTemplate(id)?.flow);
    assert.ok(flow, 'Missing shipped template: '+id);
    const result = await runSupervisedFlow(flow, options, {timeoutMs:12000});
    assert.equal(result.ok,true, JSON.stringify(result));
    assert.equal(result.steps.length,flow.nodes.length);
    assert.ok(result.steps.every(step => step.status === 'PASS'));
    assert.equal(result.artifacts.length,1);
    verify(JSON.parse(await fs.readFile(path.join(workspace,'.omniforge/output',name),'utf8')));
  }
  const invalid = structuredClone(findTemplate('csv-consolidado').flow);
  invalid.nodes[0].config.payload = JSON.stringify('id,id\n1,2');
  invalid.nodes.at(-1).config.fileName = 'rejected-csv.json';
  const rejected = await runSupervisedFlow(invalid, options, {timeoutMs:12000});
  assert.equal(rejected.ok,false);
  await assert.rejects(fs.stat(path.join(workspace,'.omniforge/output/rejected-csv.json')), {code:'ENOENT'});
  const authoring = await load('modules/ide/project-authoring.mjs');
  const {projectTemplate} = await load('modules/ide/project-templates.mjs');
  const project = await authoring.createProjectScaffold(workspace,'Criado-pelo-exe','node-cli');
  for (const [name,text] of Object.entries(projectTemplate('node-cli').files))
    assert.equal(await fs.readFile(path.join(project.workspace,name),'utf8'),text);
  const text = 'arquivo criado pelo runtime instalado\r\nPeça local\r\n';
  const created = await authoring.createAuthoredFile(project.workspace,'src/novo.txt',text,false);
  await assert.rejects(authoring.createAuthoredFile(project.workspace,'src/novo.txt','overwrite',false));
  const copy = await authoring.duplicateAuthoredFile(project.workspace,created.path,'src/copia.txt',created.revision);
  const moved = await authoring.relocateAuthoredFile(project.workspace,copy.path,'src/movido.txt',copy.revision);
  assert.equal(await fs.readFile(path.join(project.workspace,created.path),'utf8'),text);
  assert.equal(await fs.readFile(path.join(project.workspace,moved.path),'utf8'),text);
  await assert.rejects(fs.stat(path.join(project.workspace,copy.path)),{code:'ENOENT'});
  const info = await authoring.authoredFileInfo(project.workspace,moved.path);
  assert.equal(info.eol,'CRLF'); assert.equal(info.revision,created.revision);
  return {dataNodes:26,templates:cases.length,vendorHashes:true,invalidInputBlocked:true,authoring:true};
}
