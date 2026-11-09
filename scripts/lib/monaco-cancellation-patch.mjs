/**
 * Narrow MIT upstream backport for the locked Monaco 0.55.1 build.
 * Source: microsoft/vscode@864824b432e6fb153a3b4dfa1e0f96744ebcf6a4,
 * src/vs/editor/contrib/wordHighlighter/browser/wordHighlighter.ts.
 * The three Delayer promises must handle cancellation at their creation site.
 * No global error handler is installed and no occurrence feature is disabled.
 */
import {createHash} from 'node:crypto';
export const MONACO_PATCH_VERSION = '0.55.1';
export const MONACO_PATCH_TARGET = '/monaco-editor/esm/vs/editor/contrib/wordHighlighter/browser/wordHighlighter.js';
const digest = value => createHash('sha256').update(value).digest('hex');
const callSites = [
  /this\.runDelayer\.trigger\(\(\)\s*=>\s*\{\s*this\._onPositionChanged\(e\);?\s*\}\);/g,
  /this\.runDelayer\.trigger\(\(\)\s*=>\s*\{\s*this\._run\(\);?\s*\}\);/g,
  /this\.runDelayer\.trigger\(\(\)\s*=>\s*\{\s*this\._run\(false,\s*delay\);?\s*\}\);/g
];
export function patchMonacoCancellation(source, version) {
  if (version !== MONACO_PATCH_VERSION) throw new Error('Reavaliar backport Monaco: versão não aprovada.');
  if (typeof source !== 'string' || !/import\s*\{[^}]*\bonUnexpectedError\b[^}]*\}\s*from\s*['"][^'"]*\/errors\.js['"]/.test(source))
    throw new Error('Backport Monaco: importação esperada ausente.');
  let code = source;
  for (const expression of callSites) {
    if ([...code.matchAll(expression)].length !== 1)
      throw new Error('Backport Monaco: contrato alterado; não aplicar parcialmente.');
    code = code.replace(expression, match => match.slice(0, -1) + '.catch(onUnexpectedError);');
  }
  return {code, report: {
    id: 'monaco-word-highlighter-cancellation', version, changes: 3,
    upstream: 'microsoft/vscode@864824b432e6fb153a3b4dfa1e0f96744ebcf6a4',
    sourceFile: MONACO_PATCH_TARGET.slice(1), sourceSha256: digest(source), patchedSha256: digest(code),
    license: 'MIT', scope: 'Three local Delayer promises; unexpected errors retain the upstream handler'
  }};
}
export function monacoCancellationPatch(version) {
  let report = null;
  return {
    name: 'omniforge-monaco-cancellation-backport', enforce: 'pre',
    transform(source, id) {
      if (!id.split('?')[0].replaceAll('\\', '/').endsWith(MONACO_PATCH_TARGET)) return null;
      const patched = patchMonacoCancellation(source, version);
      if (report && report.sourceSha256 !== patched.report.sourceSha256)
        throw new Error('Backport Monaco: duas fontes diferentes no mesmo build.');
      report = patched.report;
      return {code: patched.code, map: null};
    },
    generateBundle() {
      if (!report) throw new Error('Backport Monaco não foi exercitado no build.');
      this.emitFile({type: 'asset', fileName: 'vendor-patches.json', source: JSON.stringify([report], null, 2) + '\n'});
    }
  };
}
