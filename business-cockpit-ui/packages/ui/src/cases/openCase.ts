import { ref, shallowRef } from 'vue';
import { OfficialWorkflowlistApi, type Workflow } from '../generated/official-gui-api';

/** The case the page shows, as the server answered last; the header and the page read it. */
export const openCase = shallowRef<Workflow>();
export const openCaseFailed = ref(false);

/** Loads the case of the page. */
export async function loadCase(workflowId: string): Promise<void> {
  try {
    openCase.value = await new OfficialWorkflowlistApi().getWorkflow({ workflowId });
    openCaseFailed.value = false;
  } catch {
    openCaseFailed.value = true;
  }
}
