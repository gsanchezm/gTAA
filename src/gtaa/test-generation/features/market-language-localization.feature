Feature: Market-driven language localization across login + post-login UI
  The OmniPizza UI adapts its language to the selected market+language combo.
  After login, the Logout label must reflect the chosen locale.

    As an OmniPizza user,
    I want the UI translated end-to-end (login screen and post-login chrome),
    So that I can use the app in my native language without surprises.

  @desktop @visual @localized
  Scenario Outline: Logout label is translated to <language> after market <market>
    Given the OmniPizza login screen is open
    When the user selects the "<market>" market with language "<language>"
    And they log in as "standard_user"
    Then the logout button label is "<logoutLabel>"

    Examples:
      | market | language | logoutLabel |
      | US     | English  | Logout      |
      | MX     | Spanish  | Salir       |
      | CH     | German   | Abmelden    |
      | CH     | French   | Déconnexion |
      | JP     | Japanese | ログアウト    |
