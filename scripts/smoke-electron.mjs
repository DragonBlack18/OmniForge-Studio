/** Windows gate: boots the production renderer in a real Electron process. */
import { _electron as electron } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'omniforge-electron-smoke-'));
let client;
let testServer;

async function bootAndOpen() {
  client = await electron.launch({
    args: ['.'], cwd: projectRoot, timeout: 45_000,
    env: { ...process.env, ELECTRON_RENDERER_URL: '' }
  });
  const page = await client.firstWindow({ timeout: 45_000 });
  page.setDefaultTimeout(25_000);
  page.on('pageerror', error => process.stderr.write(`[renderer] ${error.message}\n`));
  await page.getByText('OMNIFORGE', { exact: false }).first().waitFor();
  await client.evaluate(({ dialog }, directory) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
  }, workspace);
  await page.getByRole('button', { name: 'Abrir projeto' }).click();
  await page.getByText('Projeto aberto:', { exact: false }).waitFor();
  return page;
}

try {
  await fs.writeFile(path.join(workspace, 'exemplo.py'), 'print("real")\n', 'utf8');
  let page = await bootAndOpen();
  await page.getByRole('button', { name: 'Salvar fluxo' }).click();
  await page.getByText('Fluxo gravado em', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Simular' }).click();
  await page.getByText('Simulação concluída', { exact: false }).waitFor();
  await assert.rejects(fs.stat(path.join(workspace, '.omniforge', 'output', 'venda.json')), { code: 'ENOENT' });
  await page.getByRole('button', { name: '▶ Executar' }).click();
  await page.getByText('Execução real concluída', { exact: false }).waitFor();
  const result = JSON.parse(await fs.readFile(path.join(workspace, '.omniforge', 'output', 'venda.json'), 'utf8'));
  assert.equal(result.id, 1001);
  // The directory opened through the legacy command is also in the new local catalog.
  await page.getByRole('button', { name: 'Catálogo de projetos' }).click();
  await page.getByText('Meus projetos (1)').waitFor();
  const catalog = await page.evaluate(() => window.omni.listProjects());
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].available, true);
  await page.getByRole('button', { name: 'Abrir', exact: true }).click();
  await page.getByRole('button', { name: 'Histórico de execuções' }).click();
  await page.getByText('Histórico de execuções', { exact: true }).waitFor();
  const savedHistory = await page.evaluate(async () => window.omni.listRunHistory());
  assert.ok(savedHistory.length >= 2, 'Simulação e execução real precisam persistir no histórico');
  const details = await page.evaluate(async id => window.omni.readRunHistory(id), savedHistory[0].id);
  assert.ok(details.steps.length >= 3);
  assert.ok(!JSON.stringify(details).includes('Exemplo'), 'Histórico não deve guardar payload');
  await page.getByRole('button', { name: 'ARQUIVOS', exact: true }).click();
  await page.getByText('exemplo.py').click();
  await page.getByText('exemplo.py', { exact: false }).first().waitFor();
  const loaded = await page.evaluate(async () => window.omni.readFile('exemplo.py'));
  assert.equal(loaded.content, 'print("real")\n');
  await client.close();
  client = null;

  // Real application restart: flow and the user's code must still be there.
  page = await bootAndOpen();
  const document = JSON.parse(await fs.readFile(path.join(workspace, '.omniforge', 'flows', 'principal.json'), 'utf8'));
  assert.equal(document.nodes.length, 3);
  const afterRestart = await page.evaluate(async () => window.omni.listRunHistory());
  const catalogAfterRestart = await page.evaluate(() => window.omni.listProjects());
  assert.equal(catalogAfterRestart.length, 1, 'Cadastro de projeto deve persistir após reinício.');
  assert.ok(afterRestart.length >= 2, 'Histórico deve persistir depois de reiniciar o desktop');
  assert.equal(await page.getByRole('button', { name: 'Salvar fluxo' }).isDisabled(), true);
  await page.getByRole('button', { name: 'Validar' }).click();
  await page.getByText('Estrutura válida', { exact: false }).waitFor();
  // v0.1.5: two independently registered folders, real local API, native consent,
  // typed contract and persisted metadata. The service is a REAL local HTTP server.
  const backendFolder = path.join(workspace, 'servico-externo');
  await fs.mkdir(backendFolder);
  testServer = http.createServer((req, res) => {
    apiRequests += 1;
    let content = '';
    req.on('data', chunk => { content += chunk; });
    req.on('end', () => {
      const input = JSON.parse(content);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ confirmado: input.venda.id === 1234 }));
    });
  });
  let apiRequests = 0;
  await new Promise(resolve => testServer.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${testServer.address().port}/v1/vendas`;
  await client.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
  }, backendFolder);
  await page.getByRole('button', { name: 'Conectores de projetos' }).click();
  // Use native project registration; the back-end folder is never opened or edited.
  await page.getByRole('button', { name: 'Catálogo de projetos' }).click();
  await page.getByRole('button', { name: '+ Adicionar projeto' }).click();
  await page.getByText('Meus projetos (2)').waitFor();
  const projects = await page.evaluate(() => window.omni.listProjects());
  const canonicalBackend = await fs.realpath(backendFolder);
  const backend = projects.find(p => path.normalize(p.path).toLowerCase() === path.normalize(canonicalBackend).toLowerCase());
  assert.ok(backend?.id);
  await page.getByRole('button', { name: 'Conectores de projetos' }).click();
  await page.getByLabel('Projeto que oferece a API').selectOption(backend.id);
  await page.getByLabel('URL HTTP local').fill(url);
  await page.getByLabel('Identificador único').fill('registrar-venda');
  await page.getByLabel('Schema de entrada (JSON, subconjunto tipado)').fill('{"type":"object","required":["venda"],"properties":{"venda":{"type":"object","required":["id"],"properties":{"id":{"type":"integer"}}}}}');
  await page.getByLabel('Schema de saída (JSON, subconjunto tipado)').fill('{"type":"object","required":["confirmado"],"properties":{"confirmado":{"type":"boolean"}}}');
  await page.getByRole('button', { name: 'Registrar API local' }).click();
  await page.getByText('Capacidade local registrada', { exact: false }).waitFor();
  const makeNode = (id, type, x, config) => ({ id, type, position: { x, y: 200 }, config });
  const linkedFlow = {
    schemaVersion: 1, name: 'E2E projetos conectados',
    nodes: [
      makeNode('inicio', 'trigger.manual', 0, { payload: '{"venda":{"id":1234}}' }),
      makeNode('api', 'project.callLocalApi', 240, { projectId: backend.id, capabilityId: 'registrar-venda' }),
      makeNode('saida', 'io.writeJson', 480, { fileName: 'integracao.json' })
    ], edges: [
      { id:'x', source:'inicio', target:'api', sourceHandle:'out', targetHandle:'in' },
      { id:'y', source:'api', target:'saida', sourceHandle:'out', targetHandle:'in' }
    ]
  };
  const valid = await page.evaluate(f => window.omni.validateFlow(f), linkedFlow);
  assert.equal(valid.valid, true, valid.errors?.join(';'));
  const simulated = await page.evaluate(f => window.omni.executeFlow(f, true), linkedFlow);
  assert.equal(simulated.partialSimulation, true); assert.equal(apiRequests, 0);
  await client.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0 }); });
  await assert.rejects(page.evaluate(f => window.omni.executeFlow(f, false), linkedFlow));
  assert.equal(apiRequests, 0, 'Nenhum POST pode sair antes do consentimento.');
  await client.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); });
  const execution = await page.evaluate(f => window.omni.executeFlow(f, false), linkedFlow);
  assert.equal(execution.ok, true, execution.error);
  assert.equal(apiRequests, 1);
  const output = JSON.parse(await fs.readFile(path.join(workspace, '.omniforge', 'output', 'integracao.json'), 'utf8'));
  assert.deepEqual(output.data, { confirmado: true });
  assert.deepEqual(await fs.readdir(backendFolder), [], 'Projeto de destino deve permanecer intacto.');
  await client.close(); client = null;
  page = await bootAndOpen();
  const persistedProjects = await page.evaluate(() => window.omni.listProjects());
  assert.equal(persistedProjects.length, 2);
  assert.equal(persistedProjects.find(x => x.id === backend.id)?.capabilities?.[0]?.id, 'registrar-venda');
  // v0.1.10: real renderer validates catalog search and a built-in model.
  await page.getByRole('button', { name:'Modelos de fluxo' }).click();
  await page.getByText('Biblioteca de fluxos', { exact:true }).waitFor();
  assert.equal(await page.getByRole('button',{name:'Usar modelo'}).count(),5);
  await page.evaluate(() => { window.confirm = () => true; });
  await page.getByRole('button',{name:'Usar modelo'}).last().click();
  await page.getByText('Modelo carregado: Normalizar texto.',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Validar',exact:true}).click();
  await page.getByText('Estrutura válida',{exact:false}).waitFor();
  await page.getByRole('button',{name:'BLOCOS',exact:true}).click();
  await page.getByLabel('Buscar blocos').fill('somar lista');
  assert.equal(await page.locator('.catalog-item').count(),1);
  await page.getByLabel('Buscar blocos').fill('');
  assert.ok((await page.locator('.catalog-item').count()) > 40);

  // CAD v0.2.0: draw actual line on the SVG canvas, save a versioned
  // sketch, export DXF/SVG, and verify real files before native exit.
  await page.getByRole('button',{name:'CAD Sketch 2D'}).click();
  await page.getByTestId('cad-workbench').waitFor();
  await page.getByRole('button',{name:'Linha',exact:true}).click();
  const sketchCanvas = page.getByTestId('cad-canvas');
  const rect = await sketchCanvas.boundingBox();
  assert.ok(rect?.width > 250 && rect?.height > 200, 'CAD viewport precisa estar visível');
  await page.mouse.move(rect.x+rect.width*.32,rect.y+rect.height*.43);
  await page.mouse.down();
  await page.mouse.move(rect.x+rect.width*.65,rect.y+rect.height*.62,{steps:5});
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('[data-testid=\"cad-entity-count\"]')?.textContent?.trim() === '1');
  await page.getByTestId('cad-save').click();
  await page.getByText('Desenho salvo:',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Exportar DXF'}).click();
  await page.getByRole('button',{name:'Exportar SVG'}).click();
  const cadFolder=path.join(workspace,'.omniforge','cad');
  assert.equal(JSON.parse(await fs.readFile(path.join(cadFolder,'sketch.json'),'utf8')).entities.length,1);
  assert.match(await fs.readFile(path.join(workspace,'.omniforge','output','cad-sketch.dxf'),'utf8'),/\nLINE\n/);
  assert.match(await fs.readFile(path.join(workspace,'.omniforge','output','cad-sketch.svg'),'utf8'),/<line /);
  const cadBeforeRestart=await page.evaluate(()=>window.omni.loadCadSketch());
  assert.equal(cadBeforeRestart.sketch.entities.length,1);
  // The native exit confirmation should also cover unsaved CAD edits.
  await page.getByRole('button',{name:'Círculo',exact:true}).click();
  await page.mouse.move(rect.x+rect.width*.42,rect.y+rect.height*.4);
  await page.mouse.down();
  await page.mouse.move(rect.x+rect.width*.46,rect.y+rect.height*.4,{steps:3});
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('[data-testid=\"cad-entity-count\"]')?.textContent?.trim() === '2');

  // v0.1.6 Windows gate: native close must respond (including dirty buffers),
  // rather than silently trapping the renderer through beforeunload.
  await page.evaluate(() => window.omni.setUnsavedChanges(true));
  await client.evaluate(({ dialog, BrowserWindow }) => {
    dialog.showMessageBox = async () => ({ response: 0 });
    BrowserWindow.getAllWindows()[0].close();
  });
  await page.waitForTimeout(250);
  assert.equal(page.isClosed(), false, 'Cancelar deve manter a janela aberta.');
  const nativeProcess = client.process();
  const exited = new Promise((resolve, reject) => {
    if (nativeProcess.exitCode !== null) return resolve(nativeProcess.exitCode);
    const timer = setTimeout(() => reject(new Error('Electron permaneceu aberto após aceitar Sair.')), 12_000);
    nativeProcess.once('exit', code => { clearTimeout(timer); resolve(code); });
  });
  await client.evaluate(({ dialog, BrowserWindow }) => {
    dialog.showMessageBox = async () => ({ response: 1 });
    BrowserWindow.getAllWindows()[0].close();
  }).catch(() => {});
  await exited;
  client = null;
  // Restart after an unsaved CAD edit: the previously saved one-entity
  // drawing must remain intact; the unsaved circle must not persist.
  page=await bootAndOpen();
  await page.getByRole('button',{name:'CAD Sketch 2D'}).click();
  await page.waitForFunction(() => document.querySelector('[data-testid=\"cad-entity-count\"]')?.textContent?.trim() === '1');
  assert.equal((await page.evaluate(()=>window.omni.loadCadSketch())).sketch.entities.length,1);
  await client.close();client=null;
  console.log('PASS Electron E2E: automation, project APIs, CAD draw/save/export/restart and native close');
} catch (error) {
  if (client) {
    try {
      const pages = client.windows();
      if (pages.length) await pages[0].screenshot({ path: path.join(process.cwd(), 'smoke-failure.png') });
    } catch { /* never hide the original error */ }
  }
  console.error(error);
  process.exitCode = 1;
} finally {
  if (client) await client.close().catch(() => {});
  if (testServer) { testServer.closeAllConnections(); await new Promise(resolve => testServer.close(resolve)); }
  await fs.rm(workspace, { recursive: true, force: true });
}
