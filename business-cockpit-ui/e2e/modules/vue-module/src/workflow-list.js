export const workflowListColumns = () => [{ id: 'ride', title: { en: 'Ride', de: 'Fahrt' }, valueOf: (workflow) => workflow.details?.ride ?? '' }];
