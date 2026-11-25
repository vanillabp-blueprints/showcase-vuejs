package com.acme.cockpit.lists;

import io.vanillabp.cockpit.support.security.usercontext.UserDetails;
import io.vanillabp.cockpit.workflowmodules.WorkflowModuleVisibility;
import io.vanillabp.cockpit.workflowmodules.api.v1.AbstractWorkflowModulesGuiApiController;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** The workflow modules the user may see, which the loader of the user interface needs. */
@RestController
@RequestMapping(path = "/gui/api/v1")
public class WorkflowModulesController extends AbstractWorkflowModulesGuiApiController {

  @Override
  protected WorkflowModuleVisibility workflowModulesVisibleTo(final UserDetails currentUser) {
    return WorkflowModuleVisibility.modulesAddressedTo(currentUser);
  }

}
