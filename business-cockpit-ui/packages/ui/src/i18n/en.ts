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
  routes: { allTasks: '/tasks', myTasks: '/my-tasks', cases: '/workflows', notifications: '/notifications' },
};

export type Messages = typeof en;
export default en;
