// Fills a running cockpit backend with demo data, the way a workflow module reports to it (BPMS API v1_1):
// it registers the three conformance modules of the module kit and reports cases and user tasks for each, so every
// list, the page of a user task and the extension points of the modules show something.
//
// The modules must be served already: `PORT=4173 node serve.mjs` in the conformance folder of the kit,
// see "Trying it by hand" in the README.md of the workspace.
//
// Usage: node scripts/demo-data.mjs
//   BC_BACKEND_URL    the cockpit backend, default http://localhost:8080
//   BC_MODULES_URL    where the modules are served, default http://localhost:4173 (the browser reaches them through /wm/<id>/)
//   BC_BPMS_USER      the BPMS API user, default local
//   BC_BPMS_PASSWORD  its password, default local
//   BC_USER           the user who is assignee and candidate, default template-user
//   BC_GROUP          the group which may see the modules and cases, default template-group
//
// Running it again reports the same ids once more; a task or case which is completed stays completed.
const backend = process.env.BC_BACKEND_URL ?? 'http://localhost:8080';
const modulesAt = process.env.BC_MODULES_URL ?? 'http://localhost:4173';
const user = process.env.BC_USER ?? 'template-user';
const group = process.env.BC_GROUP ?? 'template-group';
const headers = {
  'content-type': 'application/json',
  authorization: 'Basic ' + Buffer.from(`${process.env.BC_BPMS_USER ?? 'local'}:${process.env.BC_BPMS_PASSWORD ?? 'local'}`).toString('base64'),
};

const modules = ['react-module', 'vue-module', 'angular-module'];
const days = (count) => new Date(Date.now() + count * 86_400_000).toISOString();

async function report(path, body) {
  const answer = await fetch(backend + '/bpms/api/v1_1' + path, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!answer.ok) throw new Error(`${path} answered ${answer.status}: ${await answer.text()}`);
}

for (const module of modules) {
  await report(`/workflow-module/${module}`, { uri: `${modulesAt}/wm/${module}`, accessibleToGroups: [group] });

  // three rides per module: one open and claimed by the user, one open and only offered, one finished
  const rides = [
    { key: 'claimed', title: 'Taxi ride to the airport', open: true, assignee: user, dueDate: days(2) },
    { key: 'offered', title: 'Taxi ride to the station', open: true, dueDate: days(5) },
    { key: 'finished', title: 'Taxi ride home', open: false },
  ];
  for (const ride of rides) {
    const workflowId = `demo-${module}-${ride.key}`;
    const taskId = `${workflowId}-task`;
    const shared = {
      workflowModuleId: module, bpmnProcessId: 'TaxiRide', workflowId, businessId: `ride-${module}-${ride.key}`,
      uiUriType: 'ES_MODULES', uiUriPath: '/bc-manifest.json',
    };
    const created = days(-3);
    await report('/workflow/created', {
      ...shared, id: `${workflowId}-created`, timestamp: created, title: { en: ride.title },
      accessibleToGroups: [group], details: { rider: 'Ada Lovelace', module },
    });
    const task = {
      ...shared, userTaskId: taskId, taskDefinition: 'confirmRide', title: { en: `Confirm ride (${module})` },
      workflowTitle: { en: ride.title }, candidateUsers: [user], ...(ride.assignee ? { assignee: ride.assignee } : {}),
      ...(ride.dueDate ? { dueDate: ride.dueDate } : {}),
    };
    await report('/usertask/created', { ...task, id: `${taskId}-created`, timestamp: created });
    if (!ride.open) {
      await report(`/usertask/${taskId}/completed`, { ...task, id: `${taskId}-completed`, timestamp: days(-1), createdAt: created });
      await report(`/workflow/${workflowId}/completed`, {
        ...shared, id: `${workflowId}-completed`, timestamp: days(-1), createdAt: created, title: { en: ride.title }, accessibleToGroups: [group],
      });
    }
  }
  console.log(`${module}: registered, 3 cases and 3 user tasks reported`);
}
