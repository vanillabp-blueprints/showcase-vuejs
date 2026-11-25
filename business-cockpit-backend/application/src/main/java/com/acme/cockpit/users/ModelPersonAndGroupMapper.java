package com.acme.cockpit.users;

import io.vanillabp.cockpit.support.security.usercontext.UserDetails;
import io.vanillabp.cockpit.users.model.Group;
import io.vanillabp.cockpit.users.model.Person;
import io.vanillabp.cockpit.users.model.PersonAndGroupMapper;
import java.util.Locale;
import org.springframework.stereotype.Component;

/** Turns a user or a group of the directory into the person and group the cockpit stores. */
@Component
public class ModelPersonAndGroupMapper implements PersonAndGroupMapper {

  @Override
  public Person toModelPerson(final String id) {

    final var person = new Person();
    person.setId(id);
    person.setFulltext(lower(id));
    person.setSort(lower(id));
    return person;

  }

  @Override
  public Person toModelPerson(final UserDetails user) {

    final var person = new Person();
    person.setId(user.getId());
    person.setFulltext(lower(user.getDisplay() + " " + user.getEmail() + " " + user.getId()));
    person.setSort(lower(user.getDisplay()));
    return person;

  }

  @Override
  public Group toModelGroup(final String id) {

    final var group = new Group();
    group.setId(id);
    group.setFulltext(lower(id));
    group.setSort(lower(id));
    return group;

  }

  private static String lower(final String text) {

    return text == null ? "" : text.toLowerCase(Locale.ROOT);

  }

}
