import { randomUUID } from 'node:crypto';
import { validateFlow } from './graph.mjs';
import { writeOutputJson, readOutputJson, verifyWorkspace } from '../workspace/workspace.mjs';
import { fetchLocalJson } from '../integrations/http.mjs';
import { executeProjectCapability } from '../integrations/capabilities.mjs';
import { cadStats, cadEntityMetrics } from '../cad/cad2d.mjs';
import { loadCadDocument, exportCadSketch } from '../cad/cad-store.mjs';
import { executePureNode, PURE_CATALOG } from './pure-nodes.mjs';
import { runExtensionAction } from '../extensions/extension-runtime.mjs';
const NOT_EXECUTED = Symbol('omni.node.skipped');

/** Execution is deterministic, sequential and exclusively uses registered node types. */
export async function runFlow(flow, { workspace, dryRun = true, networkApproved = false, projects = [], extensions = [], onStep } = {}) {
  const runId = randomUUID();
  const validation = validateFlow(flow, { projects, extensions });
  if (!validation.valid) return { ok: false, runId, dryRun, stage: 'validation', ...validation, steps: [], artifacts: [] };
  await verifyWorkspace(workspace);
  const byId = new Map(flow.nodes.map(node => [node.id, node]));
  // Output values are indexed by (node, output-port), so true/false branches
  // cannot accidentally trigger both paths. Never infer a branch from edge order.
  const values = new Map();
  const steps = [];
  const artifacts = [];
  const recordStep = step => {
    steps.push(step);
    if (typeof onStep === 'function') {
      try {
        // Progress includes only bounded artifact metadata; never file contents or
        // absolute paths. This makes timeout/cancel history auditable after a write.
        onStep({
          nodeId:step.nodeId,type:step.type,status:step.status,elapsedMs:step.elapsedMs,
          artifacts:artifacts.slice(-100).map(a=>({
            relativePath:a.relativePath,bytes:a.bytes,simulated:a.simulated===true
          }))
        });
      }
      catch { /* listeners may not influence workflow execution */ }
    }
  };
  for (const id of validation.order) {
    const node = byId.get(id);
    const started = Date.now();
    try {
      const inputEdges = flow.edges.filter(edge => edge.target === id);
      const inputs = new Map(inputEdges.map(edge => [edge.targetHandle, values.get(edge.source)?.get(edge.sourceHandle)]));
      const input = inputs.get('in');
      const skipped = [...inputs.values()].some(value => value === NOT_EXECUTED);
      const ports = node.type === 'logic.if' ? ['yes', 'no'] : ['out'];
      if (skipped && node.type !== 'logic.combine') {
        values.set(id, new Map(ports.map(port => [port, NOT_EXECUTED])));
        recordStep({ nodeId: id, type: node.type, status: 'SKIP', elapsedMs: Date.now() - started, message: 'Ramo não selecionado ou API ignorada na simulação.' });
        continue;
      }
      let output;
      if (node.type === 'trigger.manual') {
        output = JSON.parse(node.config.payload);
      } else if (node.type === 'logic.pick') {
        output = getPath(input, node.config.path);
      } else if (node.type === 'logic.if') {
        const condition = await executePureNode(node.type, input, node.config);
        values.set(id, new Map([['yes', condition ? input : NOT_EXECUTED], ['no', condition ? NOT_EXECUTED : input]]));
        recordStep({ nodeId: id, type: node.type, status: 'PASS', elapsedMs: Date.now() - started, message: condition ? 'Ramo SIM selecionado.' : 'Ramo NÃO selecionado.' });
        continue;
      } else if (node.type === 'logic.combine') {
        const a = inputs.get('a'), b = inputs.get('b');
        if (a === NOT_EXECUTED && b === NOT_EXECUTED) {
          values.set(id, new Map([['out', NOT_EXECUTED]]));
          recordStep({ nodeId: id, type: node.type, status: 'SKIP', elapsedMs: Date.now() - started });
          continue;
        }
        // If branches are mutually exclusive, forward the selected value.
        // If both execute, return an object to avoid silently discarding data.
        output = a === NOT_EXECUTED ? b : b === NOT_EXECUTED ? a : { a, b };
      } else if (Object.hasOwn(PURE_CATALOG, node.type)) {
        output = await executePureNode(node.type, input, node.config);
      } else if(node.type==='extension.call') {
        const performed=await runExtensionAction(node.config,input,{extensions,workspace,dryRun});
        output=performed.output;
        if(performed.artifact)artifacts.push(performed.artifact);
      } else if (node.type === 'http.localJson') {
        if (dryRun) {
          values.set(id, new Map([['out', NOT_EXECUTED]]));
          recordStep({ nodeId: id, type: node.type, status: 'SKIP', elapsedMs: Date.now() - started, message: 'HTTP não enviado no modo simulação.' });
          continue;
        }
        output = await fetchLocalJson(node.config, input, { networkApproved });
      } else if (node.type === 'project.callLocalApi') {
        if (dryRun) {
          values.set(id, new Map([['out', NOT_EXECUTED]]));
          recordStep({ nodeId: id, type: node.type, status: 'SKIP', elapsedMs: Date.now() - started, message: 'API de outro projeto não acionada na simulação.' });
          continue;
        }
        output = await executeProjectCapability(node.config, input, { projects, networkApproved });
      } else if (node.type === 'cad.sketchReport' || node.type === 'cad.exportDrawing') {
        const document = await loadCadDocument(workspace);
        if (!document.revision) throw new Error('Salve primeiro um desenho CAD no workspace.');
        if (node.type === 'cad.sketchReport') {
          const summary = cadStats(document.sketch);
          output = { units: 'mm', ...summary, layers: document.sketch.layers.map(layer => ({
            id: layer.id, name: layer.name,
            entities: document.sketch.entities.filter(e => e.layerId === layer.id).length,
            visible: layer.visible,
            lengthMm: Number(document.sketch.entities.filter(e => e.layerId === layer.id)
              .reduce((sum,e) => sum + cadEntityMetrics(e).length, 0).toFixed(4))
          })) };
        } else {
          const format = node.config?.format;
          if (!['svg','dxf'].includes(format)) throw new Error('Formato CAD inválido.');
          const relativePath = `.omniforge/output/cad-sketch.${format}`;
          if (dryRun) {
            artifacts.push({ relativePath, simulated: true, bytes: 0 });
            output = { format, relativePath, simulated: true };
          } else {
            const exported = await exportCadSketch(workspace, format, document.sketch);
            artifacts.push(exported);
            output = { format, relativePath: exported.relativePath, bytes: exported.bytes, simulated: false };
          }
        }
      } else if (node.type === 'io.readJson') {
        output = await readOutputJson(workspace, node.config.fileName);
      } else if (node.type === 'io.writeJson') {
        const result = await writeOutputJson(workspace, node.config.fileName, input, { dryRun });
        artifacts.push(result);
        output = input;
      } else {
        throw new Error(`Executor indisponível: ${node.type}`);
      }
      values.set(id, new Map([['out', output]]));
      recordStep({ nodeId: id, type: node.type, status: 'PASS', elapsedMs: Date.now() - started });
    } catch (error) {
      recordStep({ nodeId: id, type: node.type, status: 'FAIL', elapsedMs: Date.now() - started, message: String(error.message).slice(0, 250) });
      return { ok: false, runId, stage: 'execution', dryRun, steps, artifacts, error: `Falha no nó ${id}: ${error.message}` };
    }
  }
  // SKIP on a genuine Se/Senão branch does not mean partial simulation.
  const partialSimulation = dryRun && steps.some(step => step.status === 'SKIP' &&
    (step.type === 'http.localJson' || step.type === 'project.callLocalApi'));
  return { ok: true, runId, dryRun, partialSimulation, stage: 'completed', steps, artifacts, warnings: validation.warnings };
}

function getPath(value, dotted) {
  let current = value;
  for (const key of dotted.split('.')) {
    if (current === null || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, key)) {
      throw new Error(`Campo ausente: ${dotted}`);
    }
    current = current[key];
  }
  return current;
}
