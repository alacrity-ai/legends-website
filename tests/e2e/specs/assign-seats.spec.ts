/**
 * Staff seat assignment (P5): a party whose payment landed after its hold
 * lapsed shows up as "needs seats"; staff give it seats from the chart in a
 * few taps; a seated party can be moved; a seat taken meanwhile is named.
 */
import { expect, test } from '@playwright/test';
import { deleteShow, expireHold, guests, markSold, purchase, seatedShow, seatStatuses, type Show } from '../lib/api.ts';
import { chart, openAdmin, openDoorRoster, seatsIn } from '../lib/admin.ts';
import { shot } from '../lib/shots.ts';

let show: Show;
test.beforeAll(async () => {
  show = await seatedShow();
  // Ella pays late: her hold (T2 1–2) lapsed and someone else bought those seats first.
  await purchase(show.id, 2, { name: 'Ella Fitzgerald' }, 'Show Only', (holdId) => {
    expireHold(holdId!);
    markSold(show.id, ['o_2.1', 'o_2.2'], `party:${show.id}:walkup`);
  });
  await purchase(show.id, 3, { name: 'Nat Cole' }); // T2 3–5, seated normally
});
test.afterAll(async () => {
  await deleteShow(show.id);
});

test('a late payer is flagged and can be given seats from the chart in a few taps', async ({ page }, testInfo) => {
  const roster = await guests(show.id);
  expect(roster.parties.find((p: { firstName: string }) => p.firstName === 'Ella').seatStatus).toBe('unassigned');

  await openDoorRoster(page, show.showName);
  await expect(page.getByRole('button', { name: /Ella Fitzgerald/ })).toContainText('needs seats');
  await page.getByRole('button', { name: 'Chart', exact: true }).click();
  await expect(page.getByText('1 party needs seats')).toBeVisible();
  await shot(page, testInfo, 'needs-seats-banner');
  await page.getByRole('button', { name: 'Assign seats' }).click();

  const sheet = page.getByRole('dialog', { name: 'Seats for Ella Fitzgerald' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId('assign-picked')).toHaveText('No seats chosen — tap seats on the room.');
  const assignChart = sheet.getByTestId('assign-chart');
  await expect(assignChart.locator('[data-seat-id="o_2.1"][data-seat-state="sold"]')).toHaveCount(1); // the walk-up's
  await assignChart.locator('[data-seat-id="o_6.1"]').click();
  await assignChart.locator('[data-seat-id="o_6.2"]').click();
  await expect(sheet.getByTestId('assign-picked')).toHaveText('Chosen: T6-1, T6-2');
  // A third tap is refused politely — she has two tickets.
  await assignChart.locator('[data-seat-id="o_6.3"]').click();
  await expect(sheet.getByText('This party has 2 tickets — tap a chosen seat to swap it.')).toBeVisible();
  await shot(page, testInfo, 'assign-seats-sheet');
  await sheet.getByRole('button', { name: 'Save 2 seats' }).click();
  await expect(sheet).toHaveCount(0);

  await expect(page.getByText('needs seats')).toHaveCount(0);
  await expect(chart(page).locator('[data-seat-id="o_6.1"][data-seat-state="sold"]')).toHaveCount(1);
  await expect(seatsIn(page, 'sold')).toHaveCount(7); // 2 walk-up + 3 Nat + 2 Ella
  const status = seatStatuses(show.id);
  expect(status['o_6.1']).toBe('sold');
  expect(status['o_6.2']).toBe('sold');
  const after = await guests(show.id);
  expect(after.parties.find((p: { firstName: string }) => p.firstName === 'Ella')).toMatchObject({ seatLabels: ['T6-1', 'T6-2'], seatStatus: 'assigned' });
});

test('Change seats from the party modal moves a seated party; Best available picks for you', async ({ page }) => {
  await openDoorRoster(page, show.showName);
  await page.getByRole('button', { name: /Nat Cole/ }).click();
  const modal = page.getByRole('dialog');
  await expect(modal.getByTestId('party-seats')).toHaveText('Seats: T2-3, T2-4, T2-5');
  await modal.getByRole('button', { name: 'Change seats' }).click();
  const sheet = page.getByRole('dialog', { name: 'Seats for Nat Cole' });
  await expect(sheet.getByTestId('assign-picked')).toHaveText('Chosen: T2-3, T2-4, T2-5');
  // Deselect all three, then let the system choose.
  for (const id of ['o_2.3', 'o_2.4', 'o_2.5']) await sheet.getByTestId('assign-chart').locator(`[data-seat-id="${id}"]`).click();
  await expect(sheet.getByTestId('assign-picked')).toContainText('No seats chosen');
  await sheet.getByRole('button', { name: 'Best available' }).click();
  await expect(sheet.getByTestId('assign-picked')).toHaveText('Chosen: T2-3, T2-4, T2-5'); // his own seats are still the best
  await sheet.getByTestId('assign-chart').locator('[data-seat-id="o_2.5"]').click();
  await sheet.getByTestId('assign-chart').locator('[data-seat-id="o_1.1"]').click();
  await sheet.getByRole('button', { name: 'Save 3 seats' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Nat Cole/ })).toContainText('T2-3, T2-4, T1-1');
  const status = seatStatuses(show.id);
  expect(status['o_2.5']).toBe('available');
  expect(status['o_1.1']).toBe('sold');
});

test('a seat taken meanwhile is named, and the party keeps what it had', async ({ page }) => {
  await openAdmin(page, '/events');
  await page.locator('li', { hasText: show.showName }).first().getByRole('button', { name: 'Seating chart' }).click();
  const modal = page.getByRole('dialog', { name: /Seating chart/ });
  await modal.locator('[data-seat-id="o_6.1"]').click(); // Ella
  await page.getByRole('dialog').filter({ hasText: 'Ella Fitzgerald' }).getByRole('button', { name: 'Change seats' }).click();
  const sheet = page.getByRole('dialog', { name: 'Seats for Ella Fitzgerald' });
  await sheet.getByTestId('assign-chart').locator('[data-seat-id="o_6.1"]').click();
  await sheet.getByTestId('assign-chart').locator('[data-seat-id="o_6.2"]').click();
  await sheet.getByTestId('assign-chart').locator('[data-seat-id="o_4.1"]').click();
  await sheet.getByTestId('assign-chart').locator('[data-seat-id="o_4.2"]').click();
  // Someone buys T4-2 between the tap and the save.
  markSold(show.id, ['o_4.2'], `party:${show.id}:walkup2`);
  await sheet.getByRole('button', { name: 'Save 2 seats' }).click();
  await expect(sheet.getByRole('alert')).toHaveText('Seat T4-2 was just taken — pick again.');
  const status = seatStatuses(show.id);
  expect(status['o_6.1']).toBe('sold');
  expect(status['o_6.2']).toBe('sold');
  expect(status['o_4.1']).toBe('available');
  await sheet.getByRole('button', { name: 'Cancel' }).click();
  await expect(modal.locator('[data-seat-id="o_4.2"][data-seat-state="sold"]')).toHaveCount(1);
  await expect(modal.getByText('needs seats')).toHaveCount(0);
});
