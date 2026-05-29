Feature: Customize a pizza in the builder across markets
  The OmniPizza pizza builder lets the user pick a size and one or more
  toppings, watching the estimated total update in real time, then add the
  customized pizza to the cart. Section labels and price formatting are
  translated per market language.

    As an OmniPizza user,
    I want to customize a pizza and see the price update as I choose options,
    So that I know what I'm paying before adding it to the cart.

  Background:
    Given the OmniPizza user is logged in as "standard_user"

  @desktop @responsive @android @ios @visual @ui-only
  Scenario Outline: Builder renders for <item> in <market>/<language>
    Given the pizza builder is open for "<item>" in market "<market>" using language "<language>"
    Then the size options and topping options are rendered
    And the customizer price and confirm-add-to-cart affordance are visible

    Examples:
      | market | item       | language |
      | US     | Pepperoni  | en       |
      | MX     | Margherita | es       |
      | CH     | Marinara   | de       |
      | CH     | Marinara   | fr       |
      | JP     | Pepperoni  | ja       |

  @android @ios @visual @ui-only
  Scenario Outline: Builder section and total labels are translated for <item> in <market>/<language>
    Given the pizza builder is open for "<item>" in market "<market>" using language "<language>"
    Then the section labels "<sizeSection>" and "<toppingsSection>" are visible
    And the estimated total label "<totalLabel>" is visible

    Examples:
      | market | item       | language | sizeSection | toppingsSection | totalLabel       |
      | US     | Pepperoni  | en       | Size        | Toppings        | Estimated total  |
      | MX     | Margherita | es       | Tamaño      | Ingredientes    | Total estimado   |
      | CH     | Marinara   | de       | Grösse      | Beläge          | Geschätzt total  |
      | CH     | Marinara   | fr       | Taille      | Garnitures      | Total estimé     |
      | JP     | Pepperoni  | ja       | サイズ      | トッピング       | 概算合計          |

  @desktop @responsive @android @ios @visual
  Scenario Outline: Selecting a size updates the estimated total for <item> in <market>
    Given the pizza builder is open for "<item>" in market "<market>" using language "<language>"
    When they select size "<size>"
    Then the estimated total reflects the price of size "<size>"

    Examples:
      | market | item       | language | size   |
      | US     | Pepperoni  | en       | Large  |
      | MX     | Margherita | es       | Medium |
      | CH     | Marinara   | de       | Small  |
      | CH     | Marinara   | fr       | Small  |
      | JP     | Pepperoni  | ja       | Family |

  @desktop @responsive @android @ios @visual
  Scenario Outline: Selecting toppings updates the estimated total for <item> in <market>
    Given the pizza builder is open for "<item>" in market "<market>" using language "<language>"
    And they select size "<size>"
    When they add toppings "<toppings>"
    Then the estimated total reflects size "<size>" plus toppings "<toppings>"

    # Topping ids match the real catalog enumerated in
    # frontend/src/constants/pizza.js (OmniPizza confirmed 2026-05-24 — the
    # earlier QA fixtures referenced topping ids that have never shipped:
    # extra-cheese / olives / jalapeño do not exist; closest real ids are
    # mozzarella / black_olives, and JP doesn't carry jalapeño at all).
    Examples:
      | market | item       | language | size   | toppings              |
      | US     | Pepperoni  | en       | Large  | mozzarella            |
      | MX     | Margherita | es       | Medium | mushrooms,black_olives |
      | CH     | Marinara   | de       | Small  | mozzarella            |
      | CH     | Marinara   | fr       | Small  | mushrooms             |
      | JP     | Pepperoni  | ja       | Family | mozzarella,pineapple  |

  @desktop @responsive @android @ios @visual @api
  Scenario Outline: Confirming add to cart closes the builder and increments the navbar cart count in <market>
    Given the pizza builder is open for "<item>" in market "<market>" using language "<language>"
    And they select size "<size>"
    And the navbar cart count is "<initialCount>"
    When they confirm add to cart
    Then the pizza builder is closed
    And the navbar cart count is "<expectedCount>"

    Examples:
      | market | item       | language | size   | initialCount | expectedCount |
      | US     | Pepperoni  | en       | Large  | 0            | 1             |
      | MX     | Margherita | es       | Medium | 0            | 1             |
      | CH     | Marinara   | de       | Small  | 0            | 1             |
      | CH     | Marinara   | fr       | Small  | 0            | 1             |
      | JP     | Pepperoni  | ja       | Family | 0            | 1             |
