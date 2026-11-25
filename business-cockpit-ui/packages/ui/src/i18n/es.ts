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
  actions: { markRead: 'Marcar como leída', markUnread: 'Marcar como no leída', followUp: 'Seguimiento', deleteFollowUp: 'Eliminar seguimiento', tools: 'Herramientas', claim: 'Asumir', unclaim: 'Devolver', remove: 'Quitar', proposeTo: 'Proponer a', searchPerson: 'Buscar una persona', noPerson: 'Ninguna persona encontrada', editNote: 'Editar nota', note: 'Nota', save: 'Guardar', cancel: 'Cancelar', failed: 'No se pudo realizar la acción', claimFromOther: '¿Asumir esta tarea? La tiene {name}.', yes: 'Sí', no: 'No', ended: 'La tarea ha terminado', suspendedNow: 'La tarea fue suspendida', heldByOther: 'Otro usuario tiene la tarea' },
  search: { placeholder: 'Buscar', clear: 'Borrar', reset: 'Restablecer', filterBy: 'Filtrar por' },
  noTasks: 'Sin tareas',
  listNotLoaded: "No se pudo cargar la lista",
  cappedNotice: "Solo se listan las primeras {limit} entradas en el orden actual. Por favor, restrinja la lista con más criterios.",
  primaryFilter: 'Filtro principal',
  primaryFilters: { OpenTasksWithoutFollowUp: 'Abiertas', OpenTasksWithFollowUp: 'Todas abiertas', ClosedTasksOnly: 'Cerradas' },
  legend: { new: 'Nuevo', changed: 'Modificado', removed: 'Eliminado', completed: 'Completada', cancelled: 'Cancelada', suspended: 'Suspendida' },
  routes: { allTasks: '/tareas', myTasks: '/mis-tareas', cases: '/casos', notifications: '/notificaciones', task: '/tarea' },
};

export default es;
