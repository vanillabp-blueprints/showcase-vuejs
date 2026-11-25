import { ref } from 'vue';

export const languages = ['en', 'de', 'fr', 'es'] as const;
export type Language = (typeof languages)[number];

type Messages = {
  myTasks: string;
  allTasks: string;
  // the one word for a case of Q-WORDING, in the plural, and nowhere else in the user interface
  cases: string;
  notifications: string;
  menu: string;
  logout: string;
  language: string;
  routes: { allTasks: string; myTasks: string; cases: string; notifications: string };
};

const messages: Record<Language, Messages> = {
  en: {
    myTasks: 'My tasks', allTasks: 'All tasks', cases: 'Cases', notifications: 'Notifications',
    menu: 'Menu', logout: 'Log out', language: 'Language',
    routes: { allTasks: '/tasks', myTasks: '/my-tasks', cases: '/workflows', notifications: '/notifications' },
  },
  de: {
    myTasks: 'Meine Aufgaben', allTasks: 'Alle Aufgaben', cases: 'Vorgänge', notifications: 'Benachrichtigungen',
    menu: 'Menü', logout: 'Abmelden', language: 'Sprache',
    routes: { allTasks: '/aufgaben', myTasks: '/meine-aufgaben', cases: '/vorgaenge', notifications: '/benachrichtigungen' },
  },
  fr: {
    myTasks: 'Mes tâches', allTasks: 'Toutes les tâches', cases: 'Dossiers', notifications: 'Notifications',
    menu: 'Menu', logout: 'Se déconnecter', language: 'Langue',
    routes: { allTasks: '/taches', myTasks: '/mes-taches', cases: '/dossiers', notifications: '/notifications' },
  },
  es: {
    myTasks: 'Mis tareas', allTasks: 'Todas las tareas', cases: 'Casos', notifications: 'Notificaciones',
    menu: 'Menú', logout: 'Cerrar sesión', language: 'Idioma',
    routes: { allTasks: '/tareas', myTasks: '/mis-tareas', cases: '/casos', notifications: '/notificaciones' },
  },
};

export const language = ref<Language>('en');

export const text = (): Messages => messages[language.value];
