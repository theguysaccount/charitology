import type { EditorForm } from './types.js';
import type { createModelBundleController } from './session.mjs';
import type { ModelFilePlatform } from './file-lane.mjs';
export function illustrativeEditorForm(): EditorForm;
export function readEditorForm(root: HTMLElement): EditorForm;
export type MountedModelBundles = { readonly ready: Promise<unknown>; dispose(): void };
export function mountModelBundles(root: HTMLElement): Promise<MountedModelBundles>;
export function mountModelBundlesForTesting(root: HTMLElement, options: { controller: ReturnType<typeof createModelBundleController>; filePlatform?: ModelFilePlatform }): MountedModelBundles;
