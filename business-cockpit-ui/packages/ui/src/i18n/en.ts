// The texts of the default language (Q-LANGUAGE-DEFAULT). Every other language file has these keys.
const en = {
  myTasks: 'My tasks',
  allTasks: 'All tasks',
  // the one word for a case of Q-WORDING, in the plural, and nowhere else in the user interface
  cases: 'Cases',
  notifications: 'Notifications',
  menu: 'Menu',
  logout: 'Log out',
  language: 'Language',
  columns: { id: 'Id', businessId: 'Business ID', caseKind: 'Case kind', title: 'Title', dueDate: 'Due', assignee: 'Assignee', candidateUsers: 'Candidate users', note: 'Notes', followUpDate: 'Follow-up', endedAt: 'Ended' },
  actions: { markRead: 'Mark as read', markUnread: 'Mark as unread', followUp: 'Follow-up', deleteFollowUp: 'Delete follow-up', tools: 'Tools', claim: 'Claim', unclaim: 'Give back', remove: 'Remove', proposeTo: 'Propose to', searchPerson: 'Search a person', noPerson: 'No person found', editNote: 'Edit note', note: 'Note', save: 'Save', cancel: 'Cancel', failed: 'The action could not be done' },
  noTasks: 'No tasks',
  listNotLoaded: "The list could not be loaded",
  primaryFilter: 'Primary filter',
  primaryFilters: { OpenTasksWithoutFollowUp: 'Open', OpenTasksWithFollowUp: 'All open', ClosedTasksOnly: 'Closed' },
  legend: { new: 'New', changed: 'Changed', removed: 'Removed', completed: 'Completed', cancelled: 'Cancelled', suspended: 'Suspended' },
  routes: { allTasks: '/tasks', myTasks: '/my-tasks', cases: '/workflows', notifications: '/notifications', task: '/tasks' },
};

export type Messages = typeof en;
export default en;
