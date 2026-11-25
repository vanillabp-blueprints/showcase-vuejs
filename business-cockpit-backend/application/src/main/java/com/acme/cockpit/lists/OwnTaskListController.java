package com.acme.cockpit.lists;

import io.vanillabp.cockpit.support.security.usercontext.UserDetails;
import io.vanillabp.cockpit.tasklist.UserTaskVisibility;
import io.vanillabp.cockpit.tasklist.api.v1.AbstractUserTaskListGuiApiController;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** The list behind {@code /my-tasks}: only the user tasks where the user is the assignee. */
@RestController
@RequestMapping(path = "/gui/api/v1/current-user")
public class OwnTaskListController extends AbstractUserTaskListGuiApiController {

  @Override
  protected UserTaskVisibility userTasksVisibleTo(final UserDetails currentUser) {
    return UserTaskVisibility.onlyWhatIsTheUsersOwn(currentUser);
  }

}
