import { randomUUID } from 'node:crypto';
import { validateFlow } from './graph.mjs';
import { writeOutputJson, readOutputJson, verifyWorkspace } from './workspace.mjs';
import { fetchLocalJson } from './http.mjs';
import { executeProjectCapability } from './capabilities.mjs';
import { executePureNode, PURE_CATALOG } from './pure-nodes.mjs';
const NOT_EXECUTED = Symbol('omni.node.skipped');

/** Execution is deterministic, sequential and exclusively uses registered node types. */
export async function runFlow(flow, { workspace, dryRun = true, networkApproved = false, projects = [] } = {}) {
  const runId = randomUUID();
  const validation = validateFlow(flow, { projects });
  if (!validation.valid) return { ok: false, runId, dryRun, stage: 'validation', ...validation, steps: [], artifacts: [] };
  await verifyWorkspace(workspace);
  const byId = new Map(flow.nodes.map(node => [node.id, node]));
  // Output values are indexed by (node, output-port), so true/false branches
  // cannot accidentally trigger both paths. Never infer a branch from edge order.
  const values = new Map();
  const steps = [];
  const artifacts = [];
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
        steps.push({ nodeId: id, type: node.type, status: 'SKIP', elapsedMs: Date.now() - started, message: 'Ramo não selecionado ou API ignorada na simulação.' });
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
        steps.push({ nodeId: id, type: node.type, status: 'PASS', elapsedMs: Date.now() - started, message: condition ? 'Ramo SIM selecionado.' : 'Ramo NÃO selecionado.' });
        continue;
      } else if (node.type === 'logic.combine') {
        const a = inputs.get('a'), b = inputs.get('b');
        if (a === NOT_EXECUTED && b === NOT_EXECUTED) {
          values.set(id, new Map([['out', NOT_EXECUTED]]));
          steps.push({ nodeId: id, type: node.type, status: 'SKIP', elapsedMs: Date.now() - started });
          continue;
        }
        // If branches are mutually exclusive, forward the selected value.
        // If both execute, return an object to avoid silently discarding data.
        output = a === NOT_EXECUTED ? b : b === NOT_EXECUTED ? a : { a, b };
      } else if (Object.hasOwn(PURE_CATALOG, node.type)) {
        output = await executePureNode(node.type, input, node.config);
      } else if (node.type === 'http.localJson') {
        if (dryRun) {
          values.set(id, new Map([['out', NOT_EXECUTED]]));
          steps.push({ nodeId: id, type: node.type, status: 'SKIP', elapsedMs: Date.now() - started, message: 'HTTP não enviado no modo simulação.' });
          continue;
        }
        output = await fetchLocalJson(node.config, input, { networkApproved });
      } else if (node.type === 'project.callLocalApi') {
        if (dryRun) {
          values.set(id, new Map([['out', NOT_EXECUTED]]));
          steps.push({ nodeId: id, type: node.type, status: 'SKIP', elapsedMs: Date.now() - started, message: 'API de outro projeto não acionada na simulação.' });
          continue;
        }
        output = await executeProjectCapability(node.config, input, { projects, networkApproved });
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
      steps.push({ nodeId: id, type: node.type, status: 'PASS', elapsedMs: Date.now() - started });
    } catch (error) {
      steps.push({ nodeId: id, type: node.type, status: 'FAIL', elapsedMs: Date.now() - started, message: String(error.message).slice(0, 250) });
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
