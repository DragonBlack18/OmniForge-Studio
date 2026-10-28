import { randomUUID } from 'node:crypto';
import { validateFlow } from './graph.mjs';
import { writeOutputJson, verifyWorkspace } from './workspace.mjs';
import { fetchLocalJson } from './http.mjs';
const NOT_EXECUTED = Symbol('omni.http.simulation.skipped');

/** Execution is deterministic, sequential and exclusively uses registered node types. */
export async function runFlow(flow, { workspace, dryRun = true, networkApproved = false } = {}) {
  const runId = randomUUID();
  const validation = validateFlow(flow);
  if (!validation.valid) return { ok: false, runId, dryRun, stage: 'validation', ...validation, steps: [], artifacts: [] };
  await verifyWorkspace(workspace);
  const byId = new Map(flow.nodes.map(node => [node.id, node]));
  const values = new Map();
  const steps = [];
  const artifacts = [];
  for (const id of validation.order) {
    const node = byId.get(id);
    const started = Date.now();
    try {
      const edge = flow.edges.find(edge => edge.target === id);
      const input = edge ? values.get(edge.source) : undefined;
      let output;
      if (input === NOT_EXECUTED) {
        values.set(id, NOT_EXECUTED);
        steps.push({ nodeId: id, type: node.type, status: 'SKIP', elapsedMs: Date.now() - started, message: 'Dependência de HTTP não executada em simulação.' });
        continue;
      }
      if (node.type === 'trigger.manual') {
        output = JSON.parse(node.config.payload);
      } else if (node.type === 'logic.pick') {
        output = getPath(input, node.config.path);
      } else if (node.type === 'http.localJson') {
        if (dryRun) {
          values.set(id, NOT_EXECUTED);
          steps.push({ nodeId: id, type: node.type, status: 'SKIP', elapsedMs: Date.now() - started, message: 'HTTP não enviado no modo simulação.' });
          continue;
        }
        output = await fetchLocalJson(node.config, input, { networkApproved });
      } else if (node.type === 'io.writeJson') {
        const result = await writeOutputJson(workspace, node.config.fileName, input, { dryRun });
        artifacts.push(result);
        output = input;
      } else {
        throw new Error(`Executor indisponível: ${node.type}`);
      }
      values.set(id, output);
      steps.push({ nodeId: id, type: node.type, status: 'PASS', elapsedMs: Date.now() - started });
    } catch (error) {
      steps.push({ nodeId: id, type: node.type, status: 'FAIL', elapsedMs: Date.now() - started, message: String(error.message).slice(0, 250) });
      return { ok: false, runId, stage: 'execution', dryRun, steps, artifacts, error: `Falha no nó ${id}: ${error.message}` };
    }
  }
  const partialSimulation = steps.some(step => step.status === 'SKIP');
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
