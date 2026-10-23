/**
 * Partial check-in at the door: a party of 3 where one guest arrives early,
 * then the other two. The list, stats, chart, second visit and print sheet
 * all follow the count; a party of 1 keeps the one-tap check-in.
 */
import { expect, test } from '@playwright/test';
import { deleteShow, guests, purchase, seatedShow, type Show } from '../lib/api.ts';
import { chart, openDoorRoster, seatsIn } from '../lib/admin.ts';
import { shot } from '../lib/shots.ts';

let show: Show;
test.beforeAll(async () => {
  show = await seatedShow();
  await purchase(show.id, 3, { name: 'Frank Sinatra' }); // T2 1–3
  await purchase(show.id, 1, { name: 'Dean Martin' }); // T2 4
});
test.afterAll(async () => {
  await deleteShow(show.id);
});

test('one of three arrives early, then the other two', async ({ page }, testInfo) => {
  await openDoorRoster(page, show.showName);
  const list = page.getByRole('button', { name: 'List', exact: true });
  if (await list.count()) await list.click();

  // First guest: open the party, count down to 1, check in.
  await page.getByRole('button', { name: /Frank Sinatra/ }).click();
  let modal = page.getByRole('dialog');
  await expect(modal.getByText('How many are here?')).toBeVisible();
  await expect(modal.getByTestId('arriving-count')).toHaveText('3');
  await expect(modal.getByRole('button', { name: /^Check in Frank Sinatra/ })).toBeVisible();
  await modal.getByRole('button', { name: 'One fewer' }).click();
  await modal.getByRole('button', { name: 'One fewer' }).click();
  await expect(modal.getByTestId('arriving-count')).toHaveText('1');
  await expect(modal.getByRole('button', { name: 'One fewer' })).toBeDisabled();
  await shot(page, testInfo, 'partial-picker');
  await modal.getByRole('button', { name: 'Check in 1 of 3' }).click();
  await expect(modal).toHaveCount(0);

  const row = page.getByRole('button', { name: /Frank Sinatra/ });
  await expect(row.getByTestId('party-arrived')).toHaveText('1 of 3 here');
  await expect(page.getByText('1 / 4 tickets').first()).toBeVisible();
  await expect(page.getByText('0 / 2 parties · 1 partly here').first()).toBeVisible();
  await expect(page.getByText('1 / 4 seats arrived').first()).toBeVisible();
  expect((await guests(show.id)).arrived).toMatchObject({ [(await frankId())]: 1 });
  await shot(page, testInfo, 'partial-row');

  // The chart lights one of Frank's three seats.
  await page.getByRole('button', { name: 'Chart', exact: true }).click();
  await expect(seatsIn(page, 'checkedIn')).toHaveCount(1);
  await expect(chart(page).locator('[data-seat-id="o_2.1"][data-seat-state="checkedIn"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'List', exact: true }).click();

  // Print sheet: no tick yet, "1 of 3".
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
  expect(html).toContain('<td class="arrived"><strong>1</strong> of 3</td>');
  expect(html).toContain('1 of 3 checked in, first');

  // The other two: the picker now offers the 2 still expected.
  await row.click();
  modal = page.getByRole('dialog');
  await expect(modal.getByTestId('party-arrived-status')).toContainText('1 of 3 here');
  await expect(modal.getByText('Arriving now')).toBeVisible();
  await expect(modal.getByTestId('arriving-count')).toHaveText('2');
  await modal.getByRole('button', { name: 'Check in 2 more' }).click();
  await expect(modal).toHaveCount(0);
  await expect(row.getByTestId('party-arrived')).toHaveCount(0);
  await expect(page.getByText('3 / 4 tickets').first()).toBeVisible();
  await expect(page.getByText('1 / 2 parties').first()).toBeVisible();
  expect((await guests(show.id)).arrived).toMatchObject({ [(await frankId())]: 3 });

  // Fully in: only Undo is offered, and it clears everyone.
  await row.click();
  modal = page.getByRole('dialog');
  await expect(modal.getByText(/Checked in at/)).toBeVisible();
  await expect(modal.getByRole('button', { name: /^Check in/ })).toHaveCount(0);
  await modal.getByRole('button', { name: 'Undo check-in' }).click();
  await expect(page.getByText('0 / 4 tickets').first()).toBeVisible();
  expect((await guests(show.id)).arrived).toEqual({});
});

test('a party of one keeps the one-tap check-in (no picker)', async ({ page }) => {
  await openDoorRoster(page, show.showName);
  const list = page.getByRole('button', { name: 'List', exact: true });
  if (await list.count()) await list.click();
  await page.getByRole('button', { name: /Dean Martin/ }).click();
  const modal = page.getByRole('dialog');
  await expect(modal.getByTestId('arriving-count')).toHaveCount(0);
  await modal.getByRole('button', { name: /^Check in Dean Martin/ }).click();
  await expect(page.getByText('1 / 4 tickets').first()).toBeVisible();
  await page.getByRole('button', { name: /Dean Martin/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Undo check-in' }).click();
  await expect(page.getByText('0 / 4 tickets').first()).toBeVisible();
});

async function frankId(): Promise<string> {
  const g = await guests(show.id);
  return (g.parties as { id: string; firstName: string }[]).find((p) => p.firstName === 'Frank')!.id;
}
