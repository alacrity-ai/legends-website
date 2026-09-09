/**
 * General admission must be untouched by reserved seating: Buy goes straight
 * to Square with the body the worker has always received.
 */
import { expect, test } from '@playwright/test';
import { createShow, deleteShow, type Show } from '../lib/api.ts';
import { dialog, interceptCheckout, openAndBuy } from '../lib/buyer.ts';

let show: Show;
test.beforeAll(async () => {
  show = await createShow({ capacity: 120 });
});
test.afterAll(async () => {
  await deleteShow(show.id);
});

test('the show is on the calendar and its link opens the ticket modal', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.getByText(show.showName).first()).toBeVisible();
  await page.goto(`/?event=${show.id}`, { waitUntil: 'networkidle' });
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).locator('button', { hasText: /^Buy 1 · \$39\.95/ })).toBeVisible();
});

test('Buy goes straight to checkout with the legacy body and no seating calls', async ({ page }) => {
  const captured = await interceptCheckout(page);
  const seatingCalls: string[] = [];
  page.on('request', (r) => {
    if (/\/seating|\/seats\/hold/.test(r.url())) seatingCalls.push(r.url());
  });
  await openAndBuy(page, show.id, 2);
  await page.waitForURL(/purchase=intercepted/);
  expect(captured.bodies).toEqual([{ ticketType: 'Show Only', quantity: 2 }]);
  expect(seatingCalls).toEqual([]);
});

test('the second ticket type checks out at its own price and name', async ({ page }) => {
  const captured = await interceptCheckout(page);
  await openAndBuy(page, show.id, 3, 'Dinner + Show');
  await page.waitForURL(/purchase=intercepted/);
  expect(captured.bodies).toEqual([{ ticketType: 'Dinner + Show', quantity: 3 }]);
});

test('a checkout failure is shown inside the modal, with Buy available again', async ({ page }) => {
  await interceptCheckout(page, { status: 409, error: 'Sold out' });
  await openAndBuy(page, show.id, 1);
  await expect(dialog(page).getByText('Sold out')).toBeVisible();
  await expect(dialog(page).getByRole('button', { name: 'Buy 1 · $39.95', exact: true })).toBeEnabled();
});
