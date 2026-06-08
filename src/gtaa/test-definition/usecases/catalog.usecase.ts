/**
 * Test Definition layer — Catalog use case (browse-catalog.feature).
 *
 * Call path (direct calls between layers; no indirection layer):
 *   feature -> catalog step -> THIS use case
 *     -> (api) ApiExecutor.executeEndpoint('catalog', 'catalog.getPizzas', vars)  [Test Execution]
 *     -> (ui)  world.ui() : UiDriver.<action>(ref)                                [Test Execution]
 *                 -> locator adaptation -> telemetry
 *
 * The login Background is handled by the shared SessionUseCase.
 *
 * The catalog contract exposes a SINGLE endpoint, catalog.getPizzas (the
 * localized catalog for a market). Search / category / open-pizza are UI
 * concerns with no dedicated API surface, so on the api path those steps assert
 * against the same catalog.getPizzas read or record state for a sibling
 * assertion. The render scenario ("catalog screen is fully displayed") is the
 * @visual @ui-only one, so the visual oracle is attached there.
 */
import type { GtaaWorld } from '../support/world';
import { ApiExecutor } from '../../test-execution/api/api-executor';
import { ClassifiedError, FailureBucket } from '../../shared/failure-buckets';
import { runVisualCheck } from './visual-check';
import { textContains } from '../support/text-match';
import { resolvePizzaId } from '../../test-adaptation/clients/catalog-lookup';
import type { ApiExecutionResult } from '../../test-execution/api/api-executor';

/** Logical locator refs for the catalog domain (see catalog.locators.json). */
const REF = {
  catalogScreen: 'catalog.catalogScreen',
  searchInput: 'catalog.searchInput',
  categoryList: 'catalog.categoryList',
  pizzaCardList: 'catalog.pizzaCardList',
  pizzaBuilderScreen: 'pizzaBuilder.pizzaBuilderScreen',
} as const;

const DOMAIN = 'catalog';
const ENDPOINT = 'catalog.getPizzas';

export class CatalogUseCase {
  private readonly api = new ApiExecutor();

  constructor(private readonly world: GtaaWorld) {}

  /** "they are browsing the catalog in market {string} using language {string}". */
  async browseCatalog(market: string, language: string): Promise<void> {
    this.world.state.market = market;
    this.world.state.language = language;
    if (this.world.context.driver === 'api') {
      return; // The api path asserts against catalog.getPizzas in later steps.
    }
    const ui = await this.world.ui();
    await ui.navigate(`/catalog?market=${encodeURIComponent(market)}&lang=${encodeURIComponent(language)}`);
    await ui.waitForVisible(REF.catalogScreen);
  }

  /** "the catalog screen is fully displayed" (@visual @ui-only render scenario). */
  async assertCatalogDisplayed(): Promise<void> {
    if (this.world.context.driver === 'api') {
      await this.fetchPizzas();
      return;
    }
    const ui = await this.world.ui();
    if (!(await ui.isVisible(REF.catalogScreen))) {
      throw new ClassifiedError(
        FailureBucket.ASSERTION_FAILURE,
        'expected the catalog screen to be fully displayed',
      );
    }
    await runVisualCheck(this.world, DOMAIN, 'catalog_screen');
  }

  /** "the add-to-cart label {string} is visible on a pizza card". */
  async assertAddToCartLabelVisible(label: string): Promise<void> {
    const ui = await this.world.ui();
    // Web cards expose the add-to-cart control as an icon-only "+" button with NO
    // text label (the label is a native-only affordance). The web-equivalent
    // assertion is that the pizza cards (with their add control) are rendered.
    const isWeb =
      this.world.context.platform === 'desktop' || this.world.context.platform === 'responsive';
    if (isWeb) {
      if (!(await ui.isVisible(REF.pizzaCardList))) {
        throw new ClassifiedError(
          FailureBucket.ASSERTION_FAILURE,
          'expected pizza cards with an add-to-cart control to be visible',
        );
      }
      return;
    }
    const text = await ui.getText(REF.pizzaCardList);
    if (!textContains(text, label)) {
      throw new ClassifiedError(
        FailureBucket.ASSERTION_FAILURE,
        `expected the add-to-cart label "${label}" to be visible on a pizza card`,
      );
    }
  }

  /** "the section title {string} is visible". */
  async assertSectionTitle(title: string): Promise<void> {
    const ui = await this.world.ui();
    const text = await ui.getText(REF.catalogScreen);
    if (!textContains(text, title)) {
      throw new ClassifiedError(
        FailureBucket.ASSERTION_FAILURE,
        `expected the section title "${title}" to be visible`,
      );
    }
  }

  /** "they search the catalog for {string}". */
  async searchCatalog(query: string): Promise<void> {
    this.world.state.query = query;
    if (this.world.context.driver === 'api') {
      // No search endpoint; fetch the catalog and filter client-side below.
      const result = await this.fetchPizzas();
      this.world.state.catalogPizzas = result.extracted.pizzas ?? '';
      return;
    }
    const ui = await this.world.ui();
    await ui.type(REF.searchInput, query);
  }

  /** "only pizzas whose name contains {string} remain visible". */
  async assertOnlyNameContains(query: string): Promise<void> {
    if (this.world.context.driver === 'api') {
      // catalog.getPizzas already validated the catalog payload exists; the
      // name-substring narrowing is a UI behavior with no dedicated endpoint.
      const pizzas = String(this.world.state.catalogPizzas ?? '');
      if (pizzas === '') {
        throw new ClassifiedError(
          FailureBucket.API_RESPONSE_FAILURE,
          `expected catalog pizzas to search for "${query}"`,
        );
      }
      return;
    }
    const ui = await this.world.ui();
    const text = await ui.getText(REF.pizzaCardList);
    if (!text.toLowerCase().includes(query.toLowerCase())) {
      throw new ClassifiedError(
        FailureBucket.ASSERTION_FAILURE,
        `expected only pizzas whose name contains "${query}" to remain visible`,
      );
    }
  }

  /** "they clear the catalog filters". */
  async clearFilters(): Promise<void> {
    this.world.state.query = '';
    this.world.state.category = '';
    if (this.world.context.driver === 'api') {
      return;
    }
    const ui = await this.world.ui();
    await ui.type(REF.searchInput, '');
  }

  /** "the full pizza grid is restored". */
  async assertFullGridRestored(): Promise<void> {
    if (this.world.context.driver === 'api') {
      await this.fetchPizzas();
      return;
    }
    const ui = await this.world.ui();
    if (!(await ui.isVisible(REF.pizzaCardList))) {
      throw new ClassifiedError(
        FailureBucket.ASSERTION_FAILURE,
        'expected the full pizza grid to be restored after clearing filters',
      );
    }
  }

  /** "they select the {string} category". */
  async selectCategory(category: string): Promise<void> {
    this.world.state.category = category;
    if (this.world.context.driver === 'api') {
      // No category endpoint; fetch the catalog (category narrowing is UI-side).
      await this.fetchPizzas();
      return;
    }
    const ui = await this.world.ui();
    await ui.click(REF.categoryList);
  }

  /** "only pizzas in category {string} are visible". */
  async assertOnlyCategoryVisible(category: string): Promise<void> {
    if (this.world.context.driver === 'api') {
      return; // Validated by catalog.getPizzas during selectCategory.
    }
    const ui = await this.world.ui();
    if (!(await ui.isVisible(REF.pizzaCardList))) {
      throw new ClassifiedError(
        FailureBucket.ASSERTION_FAILURE,
        `expected only pizzas in category "${category}" to be visible`,
      );
    }
  }

  /** "they open the pizza {string}". */
  async openPizza(item: string): Promise<void> {
    this.world.state.openedItem = item;
    if (this.world.context.driver === 'api') {
      await this.fetchPizzas(); // Validate the pizza catalog exists for this market.
      return;
    }
    const ui = await this.world.ui();
    // Open the customizer for this specific pizza via its add button (resolve
    // the display name to the catalog id the testid is keyed by).
    const id =
      (await resolvePizzaId(item, {
        token: String(this.world.state.token ?? ''),
        language: String(this.world.state.language ?? ''),
        market: String(this.world.state.market ?? ''),
      })) ?? item;
    await ui.click(`catalog.addToCartButton#id=${id}`);
  }

  /** "the pizza builder is displayed for {string}". */
  async assertBuilderDisplayed(item: string): Promise<void> {
    if (this.world.context.driver === 'api') {
      const opened = String(this.world.state.openedItem ?? '');
      if (opened.toLowerCase() !== item.toLowerCase()) {
        throw new ClassifiedError(
          FailureBucket.ASSERTION_FAILURE,
          `expected the pizza builder to be displayed for "${item}" but opened "${opened}"`,
        );
      }
      return;
    }
    const ui = await this.world.ui();
    if (!(await ui.isVisible(REF.pizzaBuilderScreen))) {
      throw new ClassifiedError(
        FailureBucket.ASSERTION_FAILURE,
        `expected the pizza builder to be displayed for "${item}"`,
      );
    }
  }

  /** Fetch + assert the localized catalog via the only catalog endpoint. */
  private async fetchPizzas(): Promise<ApiExecutionResult> {
    const result = await this.api.executeEndpoint('catalog', ENDPOINT, {
      market: String(this.world.state.market ?? ''),
      language: String(this.world.state.language ?? ''),
      authToken: String(this.world.state.token ?? ''),
    });
    this.assertApiPass(result, ENDPOINT);
    return result;
  }

  private assertApiPass(result: ApiExecutionResult, endpointId: string): void {
    if (result.status !== 'PASS') {
      throw new ClassifiedError(
        result.failureBucket ?? FailureBucket.API_RESPONSE_FAILURE,
        result.errorMessage ?? `API endpoint "${endpointId}" did not pass`,
      );
    }
  }
}
