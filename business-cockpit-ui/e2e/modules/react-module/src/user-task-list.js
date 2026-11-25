export const userTaskListColumns = () => [{ id: 'risk', title: { en: 'Risk', de: 'Risiko' }, valueOf: (task) => task.details?.risk ?? '' }];
