Feature: Order success screen surfaces tracking & courier per market
  After a successful checkout, OmniPizza lands on the success screen with
  a live tracking badge, an estimated delivery window, the courier card
  (name, vehicle, rating) and a "view order details" affordance. The
  status title and order-details label are translated per market language.

    As an OmniPizza user,
    I want a clear confirmation screen after placing an order,
    So that I know my order is in motion and who is delivering it.

  Background:
    Given the OmniPizza user is logged in as "standard_user"

  @desktop @responsive @android @ios @visual @ui-only
  Scenario Outline: Order success screen in <market>/<language> shows tracking + courier
    Given a placed order exists in market "<market>" using language "<language>"
    When they open the order success screen
    Then the order success screen is fully displayed with status "<outForDelivery>"
    And the tracking information, courier details, and order details "<orderDetails>" are visible

    Examples:
      | market | language | outForDelivery        | orderDetails           |
      | US     | en       | Out for delivery      | ORDER DETAILS          |
      | MX     | es       | En camino             | DETALLES DEL PEDIDO    |
      | CH     | de       | In Zustellung         | BESTELLDETAILS         |
      | CH     | fr       | En cours de livraison | DÉTAILS DE LA COMMANDE |
      | JP     | ja       | 配達中                  | 注文詳細                 |
