import type { Messages } from './en';

const fr: Messages = {
  myTasks: 'Mes tâches',
  allTasks: 'Toutes les tâches',
  cases: 'Dossiers',
  notifications: 'Notifications',
  menu: 'Menu',
  logout: 'Se déconnecter',
  language: 'Langue',
  columns: { id: 'Id', businessId: 'ID métier', caseKind: 'Type de dossier', title: 'Titre', dueDate: 'Échéance', assignee: 'Responsable', candidateUsers: 'Candidats', note: 'Notes', followUpDate: 'Rappel', endedAt: 'Terminée' },
  actions: { markRead: 'Marquer comme lu', markUnread: 'Marquer comme non lu', followUp: 'Rappel', deleteFollowUp: 'Supprimer le rappel', tools: 'Outils', claim: 'Prendre', unclaim: 'Rendre', remove: 'Retirer', proposeTo: 'Proposer à', searchPerson: 'Chercher une personne', noPerson: 'Aucune personne trouvée', editNote: 'Modifier la note', note: 'Note', save: 'Enregistrer', cancel: 'Annuler', failed: "L'action a échoué", claimFromOther: 'Prendre cette tâche ? Elle est chez {name}.', yes: 'Oui', no: 'Non', ended: 'La tâche est terminée', suspendedNow: 'La tâche a été suspendue', heldByOther: 'Un autre utilisateur détient la tâche' },
  noTasks: 'Aucune tâche',
  listNotLoaded: "La liste n'a pas pu être chargée",
  primaryFilter: 'Filtre principal',
  primaryFilters: { OpenTasksWithoutFollowUp: 'Ouvertes', OpenTasksWithFollowUp: 'Toutes ouvertes', ClosedTasksOnly: 'Terminées' },
  legend: { new: 'Nouveau', changed: 'Modifié', removed: 'Supprimé', completed: 'Terminée', cancelled: 'Annulée', suspended: 'Suspendue' },
  routes: { allTasks: '/taches', myTasks: '/mes-taches', cases: '/dossiers', notifications: '/notifications', task: '/tache' },
};

export default fr;
