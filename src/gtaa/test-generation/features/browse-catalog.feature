Feature: Browse the OmniPizza catalog across markets
  The OmniPizza catalog presents pizzas in a localized grid grouped by category.
  Users can search by name, filter by category, and tap a card to open the
  pizza builder. Section headers, category labels, and the "Add to cart" CTA
  are translated per market language.

    As an OmniPizza user,
    I want a browsable, searchable catalog in my market's language,
    So that I can quickly find a pizza and start customizing it.

  Background:
    Given the OmniPizza user is logged in as "standard_user"

  @desktop @responsive @android @ios @visual @ui-only
  Scenario Outline: Catalog renders in <market>/<language>
    Given they are browsing the catalog in market "<market>" using language "<language>"
    Then the catalog screen is fully displayed
    And the add-to-cart label "<addToCartLabel>" is visible on a pizza card

    # addToCartLabel matches what the customizer modal's primary CTA renders.
    # OmniPizza confirmed 2026-05-24: PizzaCustomizerModal text map is
    # {en:"Add to Cart", es:"Agregar", de:"Hinzufügen", fr:"Ajouter", ja:"追加"}.
    # Earlier values "Add to cart" (lowercase c) and "カートに追加" (full phrase)
    # never matched live FE output.
    Examples:
      | market | language | addToCartLabel |
      | US     | en       | Add to Cart    |
      | MX     | es       | Agregar        |
      | CH     | de       | Hinzufügen     |
      | CH     | fr       | Ajouter        |
      | JP     | ja       | 追加            |

  @android @ios @visual @ui-only
  Scenario Outline: Catalog shows the localized section title in <market>/<language>
    Given they are browsing the catalog in market "<market>" using language "<language>"
    Then the section title "<sectionTitle>" is visible

    Examples:
      | market | language | sectionTitle |
      | US     | en       | Pizzas       |
      | MX     | es       | Pizzas       |
      | CH     | de       | Pizzen       |
      | CH     | fr       | Pizzas       |
      | JP     | ja       | ピザ         |

  @desktop @responsive @android @ios @visual @api
  Scenario Outline: Searching narrows the catalog by name in <market>
    Given they are browsing the catalog in market "<market>" using language "<language>"
    When they search the catalog for "<query>"
    Then only pizzas whose name contains "<query>" remain visible
    When they clear the catalog filters
    Then the full pizza grid is restored

    # Query must be a substring of at least one pizza name AS RETURNED by
    # /api/pizzas for that market — names are localized per `X-Language`.
    # MX returns "Margarita" (Spanish spelling, no h); JP returns katakana
    # for every name, so the only viable English-substring query is "BBQ"
    # (kept untranslated inside `BBQチキン`).
    Examples:
      | market | language | query     |
      | US     | en       | Pepperoni |
      | MX     | es       | Margarita |
      | CH     | de       | Marinara  |
      | CH     | fr       | Marinara  |
      | JP     | ja       | BBQ       |

  @desktop @responsive @android @ios @visual @api
  Scenario Outline: Filtering by category narrows the catalog in <market>
    Given they are browsing the catalog in market "<market>" using language "<language>"
    When they select the "<category>" category
    Then only pizzas in category "<category>" are visible

    Examples:
      | market | language | category |
      | US     | en       | popular  |
      | MX     | es       | meat     |
      | CH     | de       | veggie   |
      | CH     | fr       | veggie   |
      | JP     | ja       | meat     |

  @desktop @responsive @android @ios @visual @api
  Scenario Outline: Opening a pizza card launches the builder in <market>
    Given they are browsing the catalog in market "<market>" using language "<language>"
    When they open the pizza "<item>"
    Then the pizza builder is displayed for "<item>"

    Examples:
      | market | language | item       |
      | US     | en       | Pepperoni  |
      | MX     | es       | Margherita |
      | CH     | de       | Marinara   |
      | CH     | fr       | Marinara   |
      | JP     | ja       | Pepperoni  |
