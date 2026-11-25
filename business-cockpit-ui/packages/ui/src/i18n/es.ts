import type { Messages } from './en';

const es: Messages = {
  myTasks: 'Mis tareas',
  allTasks: 'Todas las tareas',
  cases: 'Casos',
  notifications: 'Notificaciones',
  menu: 'Menú',
  logout: 'Cerrar sesión',
  language: 'Idioma',
  columns: { id: 'Id', businessId: 'ID de negocio', caseKind: 'Tipo de caso', title: 'Título', dueDate: 'Vence', assignee: 'Responsable', candidateUsers: 'Candidatos', note: 'Notas', followUpDate: 'Seguimiento', endedAt: 'Finalizada' },
  actions: { claim: 'Asumir', unclaim: 'Devolver', remove: 'Quitar', proposeTo: 'Proponer a', searchPerson: 'Buscar una persona', noPerson: 'Ninguna persona encontrada', editNote: 'Editar nota', note: 'Nota', save: 'Guardar', cancel: 'Cancelar', failed: 'No se pudo realizar la acción' },
  noTasks: 'Sin tareas',
  listNotLoaded: "No se pudo cargar la lista",
  primaryFilter: 'Filtro principal',
  primaryFilters: { OpenTasksWithoutFollowUp: 'Abiertas', OpenTasksWithFollowUp: 'Todas abiertas', ClosedTasksOnly: 'Cerradas' },
  legend: { new: 'Nuevo', changed: 'Modificado', removed: 'Eliminado', completed: 'Completada', cancelled: 'Cancelada', suspended: 'Suspendida' },
  routes: { allTasks: '/tareas', myTasks: '/mis-tareas', cases: '/casos', notifications: '/notificaciones', task: '/tarea' },
};

export default es;
