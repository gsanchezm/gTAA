Feature: Invalid login credentials surface the same auth error
  The OmniPizza login form rejects every authentication failure with a single,
  user-facing message. Whether the username, password, or both are missing, or
  the credentials simply do not match, or the user is locked out, the UI must
  always surface a message that contains "Invalid credentials" — never leak
  which side of the comparison failed.

    As an OmniPizza user,
    I want a consistent error when login fails,
    So that I cannot enumerate valid usernames by reading error text.

  Background:
    Given the OmniPizza login screen is open

  @desktop @responsive @android @ios @api @performance @visual @invalid
  Scenario Outline: Login rejected when <case>
    When the user attempts to log in with username "<username>" and password "<password>"
    Then the login error message contains "Invalid credentials"

    Examples:
      | case                  | username        | password    |
      | username is missing   |                 | pizza123    |
      | password is missing   | standard_user   |             |
      | both fields are empty |                 |             |
      | credentials are wrong | not_a_user      | not_a_pass  |
      | user is locked out    | locked_out_user | pizza123    |
