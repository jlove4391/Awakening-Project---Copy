import { assembleCoreContext as assembleCoreContextRecord } from './contextAssembler.js';
import { setActiveCoreExecutionContext } from './executionContextStore.js';
import type { AssembleCoreContextInput } from './contextTypes.js';

export { coreCommandStates } from './commandTypes.js';
export type {
  CoreCommandAuthority,
  CoreCommandAuthorityDecision,
  CoreCommandEvent,
  CoreCommandLinks,
  CoreCommandRecord,
  CoreCommandState,
  CoreCommandTerminalState,
  CoreCommandTransitionPatch,
  CreateCoreCommandInput,
} from './commandTypes.js';
export {
  assertCoreCommandTransition,
  clearCoreCommandsForTesting,
  createCoreCommand,
  decideInitialCommandAuthority,
  getCoreCommand,
  listCoreCommands,
  transitionCoreCommand,
} from './commandStore.js';

export async function assembleCoreContext(input: AssembleCoreContextInput) {
  const bundle = await assembleCoreContextRecord(input);
  setActiveCoreExecutionContext(bundle);
  return bundle;
}

export {
  getCoreContextBundle,
  renderCoreContextForInstructions,
} from './contextAssembler.js';
export {
  clearActiveCoreExecutionContext,
  clearActiveCoreExecutionContextsForTesting,
  getActiveCoreExecutionContext,
  setActiveCoreExecutionContext,
} from './executionContextStore.js';
export type { ActiveCoreExecutionContext } from './executionContextStore.js';
export {
  clearCoreIdentityCacheForTesting,
  getCoreIdentity,
  updateCoreIdentity,
} from './identityStore.js';
export type {
  AssembleCoreContextInput,
  CoreContextBundle,
  CoreContextCommandReference,
  CoreContextContinuity,
  CoreContextReceiptReference,
  CoreContextReferences,
  CoreContextTaskReference,
  CoreExecutionEnvelope,
  CoreExecutionScopeLimit,
  CoreIdentityRecord,
  CoreValidationRequirement,
} from './contextTypes.js';
