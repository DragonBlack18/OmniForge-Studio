import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { exampleFlow } from '../core/catalog.mjs';
import { runFlow } from '../core/runner.mjs';

// A real local run, no fake adapter. Default workspace is a fresh TEMP folder.
const root = process.argv[2]
  ? path.resolve(process.argv[2])
  : await fs.mkdtemp(path.join(os.tmpdir(), 'omniforge-demo-'));
const result = await runFlow(exampleFlow(), { workspace: root, dryRun: false });
if (!result.ok) {
  process.stderr.write(JSON.stringify(result, null, 2) + '\n');
  process.exitCode = 1;
} else {
  process.stdout.write(`Execução real concluída (3 nós PASS).\nWorkspace: ${root}\nArquivo: ${path.join(root, '.omniforge', 'output', 'venda.json')}\n`);
}
