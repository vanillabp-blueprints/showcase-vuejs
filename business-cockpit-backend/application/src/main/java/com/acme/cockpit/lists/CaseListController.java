package com.acme.cockpit.lists;

import io.vanillabp.cockpit.support.security.usercontext.UserDetails;
import io.vanillabp.cockpit.workflowlist.WorkflowVisibility;
import io.vanillabp.cockpit.workflowlist.api.v1.AbstractWorkflowListGuiApiController;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** The case list: the cases which are addressed to the user or to a group of the user. */
@RestController
@RequestMapping(path = "/gui/api/v1")
public class CaseListController extends AbstractWorkflowListGuiApiController {

  @Override
  protected WorkflowVisibility workflowsVisibleTo(final UserDetails currentUser) {
    return WorkflowVisibility.workflowsAddressedTo(currentUser);
  }

}
