/** Page helpers for the public ticket modal + seat sheet. */
import { expect, type Page } from '@playwright/test';

export const dialog = (page: Page) => page.locator('[role="dialog"]');

const PRICE_CENTS: Record<string, number> = { 'Show Only': 3995, 'Dinner + Show': 5995 };

/** "$119.85" / "$40" — the site's own price formatting. */
export function price(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

/** Open a show, set the quantity, tap that ticket type's Buy button. */
export async function openAndBuy(page: Page, showId: string, qty: number, ticketType = 'Show Only'): Promise<void> {
  await page.goto(`/?event=${showId}`, { waitUntil: 'networkidle' });
  const plus = dialog(page).locator(`button[aria-label="Increase ${ticketType} quantity"]`);
  await expect(plus).toBeVisible();
  for (let i = 1; i < qty; i++) await plus.click();
  await dialog(page).getByRole('button', { name: `Buy ${qty} · ${price(PRICE_CENTS[ticketType] * qty)}`, exact: true }).click();
}

/** The seat sheet once the hold has landed. */
export async function sheet(page: Page) {
  const d = dialog(page);
  const title = d.locator('h3').first();
  await expect(title).toBeVisible({ timeout: 15_000 });
  return {
    title,
    subtitle: d.locator('h3 + p').first(),
    diagram: d.locator('[aria-label="Where your seats are"]'),
    seats: (state: 'selected' | 'sold' | 'available') => d.locator(`[data-seat-id][data-seat-state="${state}"]`),
    legend: d.getByText(/your seats/),
    continueBtn: d.locator('button', { hasText: 'Looks good, continue' }),
    changeBtn: d.locator('button', { hasText: 'Change table' }),
    backBtn: d.locator('button', { hasText: '← Back to tickets' }),
    tableRows: d.locator('li button'),
  };
}

export interface CapturedCheckout {
  bodies: Array<Record<string, unknown>>;
}

/**
 * Stand in for Square: answer the checkout call with a redirect back to the
 * site so the test can prove what the buyer's browser sent.
 */
export async function interceptCheckout(page: Page, opts: { status?: number; error?: string } = {}): Promise<CapturedCheckout> {
  const captured: CapturedCheckout = { bodies: [] };
  await page.route('**/api/events/*/checkout', async (route) => {
    captured.bodies.push(JSON.parse(route.request().postData() || '{}'));
    if (opts.status && opts.status !== 200) {
      await route.fulfill({ status: opts.status, contentType: 'application/json', body: JSON.stringify({ error: opts.error ?? 'nope' }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ checkoutUrl: `${new URL(page.url()).origin}/?purchase=intercepted` }) });
  });
  return captured;
}
