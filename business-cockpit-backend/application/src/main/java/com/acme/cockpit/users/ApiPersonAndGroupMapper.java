package com.acme.cockpit.users;

import io.vanillabp.cockpit.gui.api.v1.Group;
import io.vanillabp.cockpit.gui.api.v1.Person;
import io.vanillabp.cockpit.support.security.usercontext.UserDetails;
import io.vanillabp.cockpit.users.model.PersonAndGroupApiMapper;
import org.springframework.stereotype.Component;

/** Turns a user or a group into the {@code Person} and {@code Group} of the GUI API. */
@Component
public class ApiPersonAndGroupMapper implements PersonAndGroupApiMapper {

  @Override
  public Person userToApiPerson(final UserDetails user) {

    return new Person()
        .id(user.getId())
        .display(user.getDisplay())
        .displayShort(user.getDisplayShort())
        .email(user.getEmail());

  }

  @Override
  public Person personToApiPerson(final io.vanillabp.cockpit.users.model.Person person) {

    return toApiPerson(person.getId());

  }

  @Override
  public Person toApiPerson(final String id) {

    return new Person().id(id).display(id).displayShort(id);

  }

  @Override
  public Group groupToApiGroup(final io.vanillabp.cockpit.users.model.Group group) {

    return authorityToApiGroup(group.getId());

  }

  @Override
  public Group authorityToApiGroup(final String authority) {

    return new Group().id(authority).display(authority);

  }

}
