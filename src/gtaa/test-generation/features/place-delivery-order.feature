Feature: Place a delivery order across markets
  The OmniPizza user submits an order by providing delivery details, contact info, and a payment method.

    As an OmniPizza user,
    I want to complete my checkout by entering my delivery address, contact details, and selecting a payment method (credit card or cash),
    So that I can successfully place my order and receive confirmation with the correct total amount including delivery fee and country-specific tax.

  Background:
    Given the OmniPizza user is logged in as "standard_user"

  @desktop @responsive @android @ios @performance @visual @api
  Scenario Outline: Place a delivery order in <market> paying with credit card
    Given they are ordering in market "<market>"
    And they have an order with "<item>" size "<size>" quantity <qty>
    When they provide delivery details "<street>" "<zip>", "<suburb>" for "<name>" "<phone>"
    And they choose payment method "Credit Card"
    And they enter card details "<card>" expiration "<exp>" cvv "<cvv>"
    Then the order is accepted

    Examples:
      | market | item       | size   | qty | street            | zip      | suburb  | name                | phone            | card                | exp   | cvv |
      | US     | Pepperoni  | Large  |   1 | 123 Luxury Avenue |    90210 |         | Julian Casablancas  |  +1 415 555 0101 | 4242 4242 4242 4242 | 12/28 | 123 |
      | MX     | Margherita | Medium |   3 | Av. Carranza 123  |    78230 | Polanco | Guillermo Alcantara | +52 55 1234 5678 | 4242 4242 4242 4242 | 12/28 | 123 |
      | CH     | Marinara   | Small  |   1 | Bahnhofstrasse 12 |     8001 |         | Lukas Baumgartner   | +41 44 668 18 00 | 4242 4242 4242 4242 | 12/28 | 123 |
      | JP     | Pepperoni  | Family |   2 |     1-2-3 Shibuya | 150-0002 | Tokyo   | 田中 健太           |  +81 3 1234 5678 | 4242 4242 4242 4242 | 12/28 | 123 |

  @desktop @responsive @android @ios @performance @visual @api
  Scenario Outline: Place a delivery order in <market> paying with cash
    Given they are ordering in market "<market>"
    And they have an order with "<item>" size "<size>" quantity <qty>
    When they provide delivery details "<street>" "<zip>", "<suburb>" for "<name>" "<phone>"
    And they choose payment method "Cash"
    Then the order is accepted

    Examples:
      | market | item       | size   | qty | street            | zip      | suburb  | name              | phone            |
      | US     | Pepperoni  | Large  |   1 | 123 Luxury Avenue |    90210 |         | Phoebe Bridgers   |  +1 415 555 0202 |
      | MX     | Margherita | Medium |   3 | Av. Carranza 123  |    78230 | Polanco | Valentina Herrera | +52 55 9876 5432 |
      | CH     | Marinara   | Small  |   1 | Bahnhofstrasse 12 |     8001 |         | Anna Keller       | +41 44 668 19 00 |
      | JP     | Pepperoni  | Family |   2 |     1-2-3 Shibuya | 150-0002 | Tokyo   | 佐藤 明美         |  +81 3 9876 5432 |
