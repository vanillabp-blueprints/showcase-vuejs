package com.acme.cockpit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;

/**
 * A browser that went away, for example a closed tab with an open update stream, is no error. The
 * library before 1.0.0 does not handle this itself, so its catch-all would log a warning.
 */
@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
class ClientWentAway {

  private static final Logger log = LoggerFactory.getLogger(ClientWentAway.class);

  /** Returns nothing, because there is nobody left to answer. */
  @ExceptionHandler(AsyncRequestNotUsableException.class)
  void ignore(final AsyncRequestNotUsableException clientIsGone) {
    log.debug("The client went away: {}", clientIsGone.getMessage());
  }

}
