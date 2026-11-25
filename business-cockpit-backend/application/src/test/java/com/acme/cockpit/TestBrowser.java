package com.acme.cockpit;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.CookieManager;
import java.net.HttpCookie;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Acts like a browser at the application: keeps cookies, asks for HTML, follows redirects only
 * when told to, and sends the login form of Keycloak.
 */
final class TestBrowser {

  static final String USER = "template-user";

  private final int port;

  private final CookieManager cookies = new CookieManager();

  private final HttpClient client = HttpClient.newBuilder()
      .cookieHandler(cookies)
      .followRedirects(HttpClient.Redirect.NEVER)
      .build();

  TestBrowser(final int port) {
    this.port = port;
  }

  String base() {
    return "http://localhost:" + port;
  }

  HttpResponse<String> get(final String path) throws Exception {
    return client.send(request(URI.create(base() + path)), HttpResponse.BodyHandlers.ofString());
  }

  /** A call of the user interface to the GUI API. */
  HttpResponse<String> getJson(final String path) throws Exception {
    return client.send(
        HttpRequest.newBuilder(URI.create(base() + path)).header("Accept", "application/json").build(),
        HttpResponse.BodyHandlers.ofString());
  }

  Optional<HttpCookie> cookie(final String name) {
    return cookies.getCookieStore().getCookies().stream()
        .filter(candidate -> candidate.getName().equals(name))
        .findFirst();
  }

  /** Follows the redirects of {@code response} to the login page of Keycloak. */
  HttpResponse<String> followToTheLoginPage(final HttpResponse<String> response) throws Exception {
    final var page = followRedirects(response);
    assertThat(page.uri().toString()).startsWith(TestKeycloak.url());
    assertThat(page.body()).contains("kc-form-login");
    return page;
  }

  /** Logs in as the template user and follows the redirects back to the application. */
  HttpResponse<String> logIn() throws Exception {
    final var loginPage = followToTheLoginPage(get("/"));
    final var action = Pattern.compile("action=\"([^\"]+)\"").matcher(loginPage.body());
    assertThat(action.find()).isTrue();
    final var form = "username=" + URLEncoder.encode(USER, StandardCharsets.UTF_8)
        + "&password=" + URLEncoder.encode(USER, StandardCharsets.UTF_8)
        + "&credentialId=";
    final var sent = client.send(
        HttpRequest.newBuilder(URI.create(action.group(1).replace("&amp;", "&")))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .POST(HttpRequest.BodyPublishers.ofString(form))
            .build(),
        HttpResponse.BodyHandlers.ofString());
    return followRedirects(sent);
  }

  HttpResponse<String> followRedirects(final HttpResponse<String> first) throws Exception {
    var response = first;
    while (response.statusCode() >= 300 && response.statusCode() < 400) {
      final var next = response.uri().resolve(response.headers().firstValue("Location").orElseThrow());
      response = client.send(request(next), HttpResponse.BodyHandlers.ofString());
    }
    return response;
  }

  private static HttpRequest request(final URI uri) {
    return HttpRequest.newBuilder(uri).header("Accept", "text/html").build();
  }

}
