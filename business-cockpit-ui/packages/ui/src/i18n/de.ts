import type { Messages } from './en';

const de: Messages = {
  myTasks: 'Meine Aufgaben',
  allTasks: 'Alle Aufgaben',
  cases: 'Vorgänge',
  notifications: 'Benachrichtigungen',
  menu: 'Menü',
  logout: 'Abmelden',
  language: 'Sprache',
  columns: { id: 'Id', businessId: 'Geschäfts-ID', caseKind: 'Vorgangsart', title: 'Titel', dueDate: 'Fällig', assignee: 'Bearbeiter', candidateUsers: 'Kandidaten', note: 'Notizen', followUpDate: 'Wiedervorlage', endedAt: 'Beendet' },
  noTasks: 'Keine Aufgaben',
  listNotLoaded: "Die Liste konnte nicht geladen werden",
  primaryFilter: 'Primärfilter',
  primaryFilters: { OpenTasksWithoutFollowUp: 'Offen', OpenTasksWithFollowUp: 'Alle offenen', ClosedTasksOnly: 'Erledigt' },
  legend: { new: 'Neu', changed: 'Geändert', removed: 'Entfernt', completed: 'Erledigt', cancelled: 'Abgebrochen', suspended: 'Ausgesetzt' },
  routes: { allTasks: '/aufgaben', myTasks: '/meine-aufgaben', cases: '/vorgaenge', notifications: '/benachrichtigungen', task: '/aufgabe' },
};

export default de;
