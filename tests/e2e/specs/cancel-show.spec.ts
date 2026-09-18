/**
 * Cancelling a show from Manage Shows: the warning modal with the ticket
 * holders download, the Cancelled badge (which wins over Live), what the
 * public site shows, and restoring the show.
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { api, createShow, deleteShow, purchase, type Show } from '../lib/api.ts';
import { openAdmin } from '../lib/admin.ts';
import { dialog } from '../lib/buyer.ts';
import { shot } from '../lib/shots.ts';

let show: Show;
test.beforeAll(async () => {
  show = await createShow({ name: `Cancelled Night ${Date.now()}` });
  await purchase(show.id, 3, { name: 'Frank Sinatra', email: 'frank@example.com' });
  await purchase(show.id, 2, { name: 'Dean Martin', email: 'dean@example.com' });
});
test.afterAll(async () => {
  await deleteShow(show.id);
});

test('cancel → warned about refunds, list downloaded, badge Cancelled, site stops selling; restore puts it back', async ({ page, browser }, testInfo) => {
  await openAdmin(page, '/events');
  const card = page.locator('li', { has: page.getByRole('heading', { name: show.showName, exact: true }) });
  await expect(card.getByText('Live', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Cancel show' }).click();

  const modal = page.getByRole('alertdialog');
  await expect(modal.getByRole('heading', { name: `Cancel “${show.showName}”?` })).toBeVisible();
  await expect(modal.getByText('5 tickets across 2 orders are still out there.')).toBeVisible();
  await expect(modal.getByText(/Refunds are yours to issue in Square/)).toBeVisible();
  await shot(page, testInfo, 'cancel-modal');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    modal.getByRole('button', { name: /Download ticket holders/ }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^ticket-holders-cancelled-night-.*\.csv$/);
  const csv = readFileSync(await download.path(), 'utf8');
  expect(csv).toContain('"Name","Email","Phone","Tickets"');
  expect(csv).toContain('"Frank Sinatra","frank@example.com"');
  expect(csv).toContain('"Dean Martin","dean@example.com"');

  // "Keep show" backs out without touching anything.
  await modal.getByRole('button', { name: 'Keep show' }).click();
  await expect(modal).toBeHidden();
  await expect(card.getByText('Live', { exact: true })).toBeVisible();

  await card.getByRole('button', { name: 'Cancel show' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel show' }).click();
  await expect(card.getByText('Cancelled', { exact: true })).toBeVisible();
  await expect(card.getByText('Live', { exact: true })).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Mark sold out' })).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Ticket holders' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Restore show' })).toBeVisible();
  await shot(page, testInfo, 'cancelled-card');

  // The public site keeps the night, marked off, and sells nothing.
  const visitor = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const site = await visitor.newPage();
  await site.goto(`/?event=${show.id}`, { waitUntil: 'networkidle' });
  await expect(dialog(site).getByText('This show has been cancelled')).toBeVisible();
  await expect(dialog(site).getByRole('button', { name: /^Buy / })).toHaveCount(0);
  await shot(site, testInfo, 'site-cancelled');
  await visitor.close();
  const refused = await api(`/api/events/${show.id}/checkout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketType: 'Show Only', quantity: 1 }) });
  expect(refused.status).toBe(409);

  // Restore.
  await card.getByRole('button', { name: 'Restore show' }).click();
  const restore = page.getByRole('alertdialog');
  await expect(restore.getByText('The show goes back on sale on the website right away.')).toBeVisible();
  await restore.getByRole('button', { name: 'Restore show' }).click();
  await expect(card.getByText('Live', { exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Cancel show' })).toBeVisible();
  const again = await api(`/api/events/${show.id}/checkout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketType: 'Show Only', quantity: 1 }) });
  expect(again.status).toBe(200);
});
