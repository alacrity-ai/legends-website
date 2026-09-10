/**
 * Live occupancy at the door (P4): List | Chart toggle, sold / arrived seats,
 * tap-a-seat check-in, a second phone catching up by polling, print sheet
 * seats, and the Manage Shows seating modal.
 */
import { expect, test } from '@playwright/test';
import { createShow, deleteShow, purchase, seatedShow, type Show } from '../lib/api.ts';
import { chart, openAdmin, openDoorRoster, seatsIn } from '../lib/admin.ts';
import { shot } from '../lib/shots.ts';

let show: Show;
test.beforeAll(async () => {
  show = await seatedShow();
  await purchase(show.id, 3, { name: 'Frank Sinatra' }); // T2 1–3
  await purchase(show.id, 2, { name: 'Dean Martin' }); // T2 4–5
});
test.afterAll(async () => {
  await deleteShow(show.id);
});

test('the roster lists seats per party and the Chart view shows them sold', async ({ page }, testInfo) => {
  await openDoorRoster(page, show.showName);
  await expect(page.getByRole('button', { name: /Frank Sinatra/ })).toContainText('T2-1, T2-2, T2-3');
  await expect(page.getByText('0 / 5 seats arrived').first()).toBeVisible();
  await page.getByRole('button', { name: 'Chart', exact: true }).click();
  await expect(chart(page)).toBeVisible();
  await expect(seatsIn(page, 'sold')).toHaveCount(5);
  await expect(seatsIn(page, 'checkedIn')).toHaveCount(0);
  await expect(seatsIn(page, 'available')).toHaveCount(58 - 5);
  await expect(page.getByText('Tap a sold seat to check its party in.')).toBeVisible();
  await shot(page, testInfo, 'door-chart');
});

test('tap a seat → the right party → check in → seat turns green at once; a second phone sees it within 8 s', async ({ page, browser }, testInfo) => {
  await openDoorRoster(page, show.showName);
  await page.getByRole('button', { name: 'Chart', exact: true }).click();
  await expect(seatsIn(page, 'sold')).toHaveCount(5);

  // Second phone, already looking at the chart.
  const other = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone2 = await other.newPage();
  await openDoorRoster(phone2, show.showName);
  await phone2.getByRole('button', { name: 'Chart', exact: true }).click();
  await expect(seatsIn(phone2, 'checkedIn')).toHaveCount(0);

  await chart(page).locator('[data-seat-id="o_2.2"]').click();
  const modal = page.getByRole('dialog');
  await expect(modal.getByRole('heading', { name: 'Frank Sinatra' })).toBeVisible();
  await expect(modal.getByTestId('party-seats')).toHaveText('Seats: T2-1, T2-2, T2-3');
  await modal.getByRole('button', { name: /^Check in Frank Sinatra/ }).click();
  await expect(seatsIn(page, 'checkedIn')).toHaveCount(3);
  await expect(page.getByText('3 / 5 seats arrived').first()).toBeVisible();
  await shot(page, testInfo, 'checked-in');

  await expect(seatsIn(phone2, 'checkedIn')).toHaveCount(3, { timeout: 9_000 });
  await expect(phone2.getByText('3 / 5 seats arrived').first()).toBeVisible();
  await other.close();

  // Undo from the list view keeps everything consistent.
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await page.getByRole('button', { name: /Frank Sinatra/ }).click();
  await page.getByRole('button', { name: 'Undo check-in' }).click();
  await page.getByRole('button', { name: 'Chart', exact: true }).click();
  await expect(seatsIn(page, 'checkedIn')).toHaveCount(0);
});

test('the view choice survives a reload, and general-admission shows have no toggle', async ({ page }) => {
  await openDoorRoster(page, show.showName);
  await page.getByRole('button', { name: 'Chart', exact: true }).click();
  await expect(chart(page)).toBeVisible();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(show.showName) }).first().click();
  await expect(chart(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Chart', exact: true })).toHaveAttribute('aria-pressed', 'true');

  const ga = await createShow({ capacity: 40, name: 'GA Night' });
  try {
    await openDoorRoster(page, ga.showName);
    await expect(page.getByRole('button', { name: 'Chart', exact: true })).toHaveCount(0);
    await expect(page.getByText('seats arrived')).toHaveCount(0);
  } finally {
    await deleteShow(ga.id);
  }
});

test('Manage Shows → Seating chart opens the live room and stops polling when closed', async ({ page }, testInfo) => {
  await openAdmin(page, '/events');
  const card = page.locator('li', { hasText: show.showName }).first();
  await expect(card.getByRole('button', { name: 'Re-sync chart' })).toHaveCount(0); // moved into the modal
  await card.getByRole('button', { name: 'Seating chart' }).click();
  const modal = page.getByRole('dialog', { name: /Seating chart/ });
  await expect(modal).toBeVisible();
  await expect(modal.getByText('0 / 5 seats arrived')).toBeVisible();
  await expect(modal.locator('[data-seat-id][data-seat-state="sold"]')).toHaveCount(5);
  await expect(modal.getByRole('button', { name: 'Re-sync from layout' })).toHaveCount(0); // tickets have sold
  await shot(page, testInfo, 'manage-shows-seating-modal');

  const polls: number[] = [];
  page.on('request', (r) => {
    if (r.url().endsWith(`/api/admin/events/${show.id}/guests`)) polls.push(Date.now());
  });
  await page.waitForTimeout(9_000);
  expect(polls.length).toBeGreaterThanOrEqual(1);
  await modal.getByRole('button', { name: 'Close' }).click();
  await expect(modal).toHaveCount(0);
  const after = polls.length;
  await page.waitForTimeout(9_000);
  expect(polls.length).toBe(after);
});

test('the printed door sheet carries a Seats column', async ({ page }) => {
  await openDoorRoster(page, show.showName);
  // Printing builds a standalone document in a hidden iframe; capture it instead of printing.
  await page.evaluate(() => {
    const w = window as unknown as { __sheets: string[] };
    w.__sheets = [];
    const original = document.body.appendChild.bind(document.body);
    document.body.appendChild = ((el: Node) => {
      if (el instanceof HTMLIFrameElement) {
        w.__sheets.push(el.srcdoc);
        return el;
      }
      return original(el);
    }) as typeof document.body.appendChild;
  });
  await page.getByRole('button', { name: 'Print list' }).click();
  const html = await page.evaluate(() => (window as unknown as { __sheets: string[] }).__sheets[0] ?? '');
  expect(html).toContain('<th class="col-seats">Seats</th>');
  expect(html).toContain('<td class="seats">T2-1, T2-2, T2-3</td>');
  expect(html).toContain('<td class="seats">T2-4, T2-5</td>');
  expect(html).toContain('colspan="6"');
});
