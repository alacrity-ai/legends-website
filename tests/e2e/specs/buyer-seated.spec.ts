/**
 * Reserved seating from the buyer's phone: seats are chosen for the party,
 * told in one plain sentence (no seat-chart picture — LGD-34: buyers tried to
 * tap it), held while they pay; "Change table" and "Back" are the only other
 * moves. Every dead end has a message and a way back. Which seats are held is
 * checked in D1, since the page no longer draws them.
 */
import { expect, test } from '@playwright/test';
import { activeHolds, createChart, createShow, deleteChart, deleteShow, heldSeatIds, seatStatuses, stageBusyNight, stageSoldOut, stageThreeLeft, type Show } from '../lib/api.ts';
import { dialog, interceptCheckout, openAndBuy, sheet } from '../lib/buyer.ts';
import { shot } from '../lib/shots.ts';

let chartId: string;
let show: Show;
test.beforeAll(async () => {
  chartId = await createChart();
});
test.beforeEach(async () => {
  show = await createShow({ seatingChartId: chartId });
});
test.afterEach(async () => {
  await deleteShow(show.id);
});
test.afterAll(async () => {
  await deleteChart(chartId);
});

test('party of 3, empty room: seated together at the front table, then checkout carries the hold', async ({ page }, testInfo) => {
  const captured = await interceptCheckout(page);
  await openAndBuy(page, show.id, 3);
  const s = await sheet(page);
  await expect(s.title).toHaveText("We've saved seats for your party together at Table 2.");
  await expect(s.subtitle).toContainText('Seats T2-1, T2-2, T2-3');
  await expect(s.subtitle).toContainText('3 × Show Only · $119.85');
  // Just the sentence and the two buttons: no seat chart, nothing to tap but the buttons.
  await expect(s.diagram).toHaveCount(0);
  await expect(s.seatDots).toHaveCount(0);
  await expect(s.legend).toHaveCount(0);
  await expect(dialog(page).locator('svg')).toHaveCount(0);
  await expect(s.continueBtn).toBeVisible();
  await expect(s.changeBtn).toBeVisible();
  await expect(dialog(page).getByText('Held for you for 10 minutes.')).toBeVisible();
  expect(heldSeatIds(show.id)).toEqual(['o_2.1', 'o_2.2', 'o_2.3']);
  await shot(page, testInfo, 'sheet');

  await s.continueBtn.click();
  await page.waitForURL(/purchase=intercepted/);
  expect(captured.bodies).toHaveLength(1);
  expect(captured.bodies[0]).toMatchObject({ ticketType: 'Show Only', quantity: 3 });
  expect(captured.bodies[0].holdId).toMatch(/^h_[a-f0-9]{12}$/);
  // The hold must survive the hop to Square.
  expect(activeHolds(show.id)).toBe(1);
  const status = seatStatuses(show.id);
  expect(['o_2.1', 'o_2.2', 'o_2.3'].every((id) => status[id] === 'held')).toBe(true);
});

test('Change table lists only tables that seat the party, nearest first, and moving frees the old seats', async ({ page }, testInfo) => {
  await openAndBuy(page, show.id, 4);
  const s = await sheet(page);
  await expect(s.title).toContainText('Table 2');
  await s.changeBtn.click();
  await expect(dialog(page).getByText('Pick a table for your party of 4')).toBeVisible();
  await expect(s.tableRows.first()).toBeVisible();
  const rows = (await s.tableRows.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  expect(rows).toHaveLength(6); // every other table + the row can take 4
  expect(rows[0]).toMatch(/^Table [13] nearest the stage · 8 seats free/);
  expect(rows.some((r) => r.startsWith('Table 2'))).toBe(false);
  expect(rows[rows.length - 1]).toMatch(/^Row A/);
  await shot(page, testInfo, 'change-table');

  await s.tableRows.filter({ hasText: 'Table 6' }).click();
  await expect(s.title).toHaveText("We've saved seats for your party together at Table 6.");
  await expect(s.diagram).toHaveCount(0);
  expect(heldSeatIds(show.id)).toEqual(['o_6.1', 'o_6.2', 'o_6.3', 'o_6.4']);
  expect(activeHolds(show.id)).toBe(1);

  await s.changeBtn.click();
  await dialog(page).locator('button', { hasText: 'Keep Table 6' }).click();
  await expect(s.title).toContainText('Table 6');
});

test('Back to tickets releases the hold', async ({ page }) => {
  await openAndBuy(page, show.id, 2);
  const s = await sheet(page);
  expect(activeHolds(show.id)).toBe(1);
  await s.backBtn.click();
  await expect(dialog(page).locator('button[aria-label="Increase Show Only quantity"]')).toBeVisible();
  await expect.poll(() => activeHolds(show.id)).toBe(0);
  expect(Object.values(seatStatuses(show.id)).every((st) => st === 'available')).toBe(true);
});

test('closing the modal releases the hold', async ({ page }) => {
  await openAndBuy(page, show.id, 2);
  await sheet(page);
  await dialog(page).locator('button[aria-label="Close"]').click();
  await expect(dialog(page)).toHaveCount(0);
  await expect.poll(() => activeHolds(show.id)).toBe(0);
});

test('busy night: a pair still sits at the front, and Change table lists only tables with room', async ({ page }, testInfo) => {
  stageBusyNight(show.id);
  await openAndBuy(page, show.id, 2);
  const s = await sheet(page);
  await expect(s.title).toHaveText("We've saved seats for your party together at Table 2.");
  await expect(s.subtitle).toContainText('Seats T2-7, T2-8');
  await expect(s.diagram).toHaveCount(0);
  expect(heldSeatIds(show.id)).toEqual(['o_2.7', 'o_2.8']);
  await shot(page, testInfo, 'busy-night');
  await s.changeBtn.click();
  await expect(s.tableRows.first()).toBeVisible();
  const rows = (await s.tableRows.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  expect(rows.map((r) => r.split(' ').slice(0, 2).join(' '))).toEqual(['Table 4', 'Table 6', 'Row A']);
});

test('no single table can take 6: the party is split across neighbouring tables and told so', async ({ page }, testInfo) => {
  stageBusyNight(show.id);
  await openAndBuy(page, show.id, 6);
  const s = await sheet(page);
  await expect(s.title).toHaveText("We've saved seats for your party at Table 4 and Row A, right beside each other.");
  await expect(s.subtitle).toContainText('Seats T4-5, T4-6, T4-7, T4-8, A9, A10');
  await expect(s.diagram).toHaveCount(0);
  expect(heldSeatIds(show.id)).toEqual(['o_4.5', 'o_4.6', 'o_4.7', 'o_4.8', 'o_r.9', 'o_r.10']);
  await shot(page, testInfo, 'split');
  await expect(s.continueBtn).toBeEnabled();
});

test('only 3 seats left, party of 5: an honest message and a way back', async ({ page }, testInfo) => {
  stageThreeLeft(show.id);
  await openAndBuy(page, show.id, 5);
  const s = await sheet(page);
  await expect(s.title).toHaveText("Sorry — we can't seat a party of 5 together right now");
  await expect(dialog(page).getByText('Only 3 seats are left for this show — try 3 or fewer tickets.')).toBeVisible();
  await shot(page, testInfo, 'not-enough');
  expect(activeHolds(show.id)).toBe(0);
  await s.backBtn.click();
  await expect(dialog(page).locator('button[aria-label="Increase Show Only quantity"]')).toBeVisible();
  // …and a party of 2 still gets the pair at the front.
  await openAndBuy(page, show.id, 2);
  const s2 = await sheet(page);
  await expect(s2.subtitle).toContainText('Seats T2-7, T2-8');
});

test('sold out: an honest message', async ({ page }) => {
  stageSoldOut(show.id);
  await openAndBuy(page, show.id, 1);
  const s = await sheet(page);
  await expect(s.title).toHaveText('Sorry — this show has just sold out');
  await expect(s.backBtn).toBeVisible();
});

test('checkout refused because the hold lapsed: the message shows and the sheet stays usable', async ({ page }) => {
  await interceptCheckout(page, { status: 409, error: 'Your seats are no longer held — go back and we will find you seats again.' });
  await openAndBuy(page, show.id, 2);
  const s = await sheet(page);
  await s.continueBtn.click();
  await expect(dialog(page).getByRole('alert')).toHaveText('Your seats are no longer held — go back and we will find you seats again.');
  await expect(s.continueBtn).toBeEnabled();
  await expect(s.backBtn).toBeEnabled();
});

test('hold service failure: the buyer is told and can go back', async ({ page }) => {
  await page.route('**/seats/hold', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Seats are going fast — please try again.' }) }));
  await openAndBuy(page, show.id, 2);
  const s = await sheet(page);
  await expect(s.title).toHaveText("Sorry — we can't seat a party of 2 together right now");
  await expect(dialog(page).getByText('Seats are going fast — please try again.')).toBeVisible();
  await s.backBtn.click();
  await expect(dialog(page).locator('button[aria-label="Increase Show Only quantity"]')).toBeVisible();
});
