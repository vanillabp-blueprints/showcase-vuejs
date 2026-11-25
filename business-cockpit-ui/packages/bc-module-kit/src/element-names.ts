/** Turns a module id into the prefix of its web components: `TaxiRide` gives `taxi-ride`, `4711` gives `wm-4711`. */
export function elementPrefix(workflowModuleId: string): string {
  const prefix = hyphenated(workflowModuleId);
  return /^[a-z]/.test(prefix) ? prefix : `wm-${prefix}`;
}

function hyphenated(text: string): string {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const SEGMENT = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function segmentOf(bpmnId: string): string {
  const segment = hyphenated(bpmnId).replace(/-+/g, '-');
  if (!segment) throw new TypeError(`the BPMN id "${bpmnId}" has neither a letter nor a digit`);
  return segment;
}

function plainSegment(kind: string, value: string): string {
  if (!SEGMENT.test(value)) throw new TypeError(`the ${kind} "${value}" is no segment: lower case letters and digits, one hyphen between words, no "--"`);
  return value;
}

export interface ElementNames {
  workflow(bpmnProcessId: string, part: string): string;
  userTask(bpmnProcessId: string, taskDefinition: string, part: string): string;
  custom(shortName: string): string;
}

/** The functions which build the whole names `<prefix>-<build>-<short name>`. */
export function createElementNames(workflowModuleId: string, buildId: string): ElementNames {
  const head = `${elementPrefix(workflowModuleId)}-${plainSegment('build id', buildId)}-`;
  return {
    workflow: (process, part) => `${head}${segmentOf(process)}--${plainSegment('part', part)}`,
    userTask: (process, task, part) => `${head}${segmentOf(process)}--${segmentOf(task)}--${plainSegment('part', part)}`,
    custom: (shortName) => `${head}${plainSegment('short name', shortName)}`,
  };
}
