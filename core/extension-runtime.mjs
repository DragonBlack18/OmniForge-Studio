import { executeExtensionSteps, resolveExtensionAction } from './extension-contract.mjs';
import { writeOutputJson } from './workspace.mjs';

/** Side effects are permitted only through an existing bounded host function. */
export async function runExtensionAction(config,input,{extensions=[],workspace,dryRun=true}={}) {
  const {action}=resolveExtensionAction(config,extensions);
  const output=executeExtensionSteps(action,input);
  const artifact=action.outputFile
    ? await writeOutputJson(workspace,action.outputFile,output,{dryRun})
    : null;
  return {output,artifact};
}
