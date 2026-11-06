import type { Command, AdmittedSelected, AdmittedBackup, ComparisonOutcome, Draft, Head, UndoHandle,
  ModelBundlePureAPI, ModelBundleSession, LegacyCalculatorAPI, OwnedContext, State, Instant, Id,
  Content, EditorForm, EnginePin, Input, RecordedRun } from './types.js';
import { makeBackup, makeSelected, parseBackup } from './graph.mjs';
import { compileEditorContent, editorFormFromContent } from './content.mjs';
import { createPureSessionBridge } from './pure.mjs';
import { createModelBundleController } from './session.mjs';
declare const selected: AdmittedSelected;
declare const backup: AdmittedBackup;
declare const comparison: ComparisonOutcome;
declare const draft: Draft;
declare const head: Head;
declare const undo: UndoHandle;
const commands: Command[] = [
  { kind: 'save-draft', draft }, { kind: 'freeze', draft }, { kind: 'copy-reproduced', selected, comparison },
  { kind: 'new-draft', discardCurrentDraft: true }, { kind: 'amend-draft', sourceModelId: 'source-model', source: head, discardCurrentDraft: true },
  { kind: 'copy-selected-draft', selected, comparison, purpose: 'comparison-mismatch-or-refusal', acknowledge: 'Copy inputs to a new draft without a reproduction claim.' },
  { kind: 'copy-selected-draft', selected, comparison, purpose: 'intentional-new-branch', acknowledge: 'Copy inputs to a new draft without a reproduction claim.' },
  { kind: 'copy-local-draft', sourceModelId: 'source-model', source: head },
  { kind: 'restore', backup, discardLocal: true }, { kind: 'clear', discardLocal: true }, { kind: 'undo', undo }
];
// @ts-expect-error A selected handle is not a successful comparison-outcome handle.
const wrongHandle: Command = { kind: 'copy-reproduced', selected, comparison: selected };
// @ts-expect-error Draft-only selection copy requires the exact acknowledgement.
const wrongAck: Command = { kind: 'copy-selected-draft', selected, comparison, purpose: 'intentional-new-branch', acknowledge: 'verified' };
// @ts-expect-error Structural caller verification is never authority.
const forgery: Command = { kind: 'copy-reproduced', selected: { verified: true }, comparison };
// @ts-expect-error No origin field is accepted in a selected-copy command.
const originOverride: Command = { kind: 'copy-reproduced', selected, comparison, origin: null };
// @ts-expect-error Clear must explicitly discard local state.
const implicitClear: Command = { kind: 'clear' };
// @ts-expect-error Old generic copy-selected command was not part of the frozen contract.
const openCommand: Command = { kind: 'copy-selected', selected, comparison };
const exports: Pick<ModelBundlePureAPI, 'makeBackup' | 'makeSelected' | 'parseBackup'> = { makeBackup, makeSelected, parseBackup };
const compiler: (form: EditorForm, calculation: { enginePin: EnginePin; input: Input; run: RecordedRun }) => Promise<Content> = compileEditorContent;
const projector: (content: Content, amendmentReason?: string) => Promise<EditorForm> = editorFormFromContent;
const pureFactory: () => { readonly api: ModelBundlePureAPI } = createPureSessionBridge;
const sessionFactory: () => { readonly session: ModelBundleSession } = createModelBundleController;
export type ExactImplementations = { pure: ModelBundlePureAPI; session: ModelBundleSession; legacy: LegacyCalculatorAPI;
  context: OwnedContext; state: State; time: Instant; id: Id };
void [commands, wrongHandle, wrongAck, forgery, originOverride, implicitClear, openCommand, exports, compiler, projector, pureFactory, sessionFactory];
