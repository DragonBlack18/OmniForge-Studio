/** One additive v1 document contract shared by authoring and protected recovery. */
export const FLOW_LIMITS = Object.freeze({ name:120, nodes:400, edges:800, bytes:2_000_000, coordinate:1_000_000 });
export function assertFlowName(name) {
  if (typeof name !== 'string' || !name.trim() || name.length > FLOW_LIMITS.name || /[\u0000-\u001f\u007f]/.test(name))
    throw new Error('Use um nome de 1 a 120 caracteres, sem caracteres de controle.');
  return name;
}
