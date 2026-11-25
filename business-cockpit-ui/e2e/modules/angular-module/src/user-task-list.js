export const userTaskListColumns = () => [{ id: 'region', title: { en: 'Region', de: 'Region' }, valueOf: (task) => task.details?.region ?? '' }];
