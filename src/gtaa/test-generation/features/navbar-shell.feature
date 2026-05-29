Feature: Navbar shell — links, branding, and language switching per market
  The OmniPizza navbar provides persistent navigation across the authenticated
  app: logo, catalog / checkout / profile links, a responsive hamburger menu,
  and (on CH only) a header language switcher. The navbar must render
  consistently in every market the user is signed into.

    As an OmniPizza user,
    I want a consistent navbar that adapts to my market,
    So that I can move across the app without losing context.

  Background:
    Given the OmniPizza user is logged in as "standard_user"

  @desktop @visual @ui-only
  Scenario Outline: Desktop navbar links are present in <market>
    Given they are on the catalog screen in market "<market>" using language "<language>"
    Then the navbar logo, catalog, checkout, and profile links are visible

    Examples:
      | market | language |
      | US     | en       |
      | MX     | es       |
      | CH     | de       |
      | CH     | fr       |
      | JP     | ja       |

  @responsive @android @ios @visual @ui-only
  Scenario Outline: Mobile navbar exposes the same links in <market>
    Given they are on the catalog screen in market "<market>" using language "<language>"
    When they open the mobile navigation menu
    Then the mobile menu shows catalog, checkout, profile, and logout entries

    Examples:
      | market | language |
      | US     | en       |
      | MX     | es       |
      | CH     | de       |
      | CH     | fr       |
      | JP     | ja       |

  @desktop @visual
  Scenario Outline: Header language switcher updates the locale in CH (<sourceLanguage> → <targetLanguage>)
    Given they are on the catalog screen in market "CH" using language "<sourceLanguage>"
    When they switch the header language to "<targetLanguage>"
    Then the catalog add-to-cart label reflects "<addToCartLabel>"

    Examples:
      | sourceLanguage | targetLanguage | addToCartLabel |
      | de             | fr             | Ajouter        |
      | fr             | de             | Hinzufügen     |
