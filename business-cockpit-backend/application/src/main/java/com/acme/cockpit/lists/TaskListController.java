package com.acme.cockpit.lists;

import io.vanillabp.cockpit.support.security.usercontext.UserDetails;
import io.vanillabp.cockpit.tasklist.UserTaskVisibility;
import io.vanillabp.cockpit.tasklist.api.v1.AbstractUserTaskListGuiApiController;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The list behind {@code /tasks}: every user task the user may work on, which is what is assigned
 * to the user, what names the user as a candidate and what a group of the user may take.
 */
@RestController
@RequestMapping(path = "/gui/api/v1")
public class TaskListController extends AbstractUserTaskListGuiApiController {

  @Override
  protected UserTaskVisibility userTasksVisibleTo(final UserDetails currentUser) {
    return UserTaskVisibility.everythingTheUserMayWorkOn(currentUser);
  }

}
