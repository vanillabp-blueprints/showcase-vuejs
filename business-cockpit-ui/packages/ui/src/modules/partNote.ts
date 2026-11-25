import { BcManifestError, elementPrefix } from '@acme/bc-module-kit';
import { ElementCreateFailed, ElementNotDefined, ModuleNameError, ModuleUpdated } from '@acme/bc-module-host';
import { text } from '../i18n/messages';

export type NoteKind = 'ask-failed' | 'load-failed' | 'not-defined' | 'create-failed' | 'name-refused' | 'module-updated' | 'manifest-refused';
/** The step of a part which failed: asking its data entry, or loading its visual entry. */
export type Step = 'ask' | 'load' | 'draw';

/** The note which tells the user what failed in a part of a module, in the words of the language in use. */
export function noteOf(error: unknown, step: Step, workflowModuleId: string, entry: string): { kind: NoteKind; message: string } {
  const notes = text().partNotes;
  const fill = (template: string, element = '') => template
    .replace('{module}', workflowModuleId).replace('{entry}', error instanceof ElementNotDefined ? error.entry : entry).replace('{element}', element).replace('{prefix}', elementPrefix(workflowModuleId));
  if (error instanceof ModuleNameError) return { kind: 'name-refused', message: fill(notes.nameRefused, error.element) };
  if (error instanceof ModuleUpdated) return { kind: 'module-updated', message: fill(notes.moduleUpdated, error.element) };
  if (error instanceof BcManifestError) return { kind: 'manifest-refused', message: fill(notes.manifestRefused) };
  if (error instanceof ElementNotDefined) return { kind: 'not-defined', message: fill(notes.notDefined, error.element) };
  if (error instanceof ElementCreateFailed) return { kind: 'create-failed', message: fill(notes.createFailed, error.element) };
  return step === 'ask' ? { kind: 'ask-failed', message: fill(notes.askFailed) } : { kind: 'load-failed', message: fill(notes.loadFailed) };
}
