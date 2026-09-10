/**
 * "I never got my email": the party card says when the confirmation went out
 * and lets staff send it again (LGD-24).
 */
import { expect, test } from '@playwright/test';
import { createShow, deleteShow, purchase, sentMail, type Show } from '../lib/api.ts';
import { openDoorRoster } from '../lib/admin.ts';

let show: Show;
test.beforeAll(async () => {
  show = await createShow({ capacity: 40, name: 'GA Night' });
  await purchase(show.id, 2, { name: 'Sammy Davis', email: 'sammy@example.com' });
});
test.afterAll(async () => {
  await deleteShow(show.id);
});

test('the party card shows when the confirmation was emailed and can resend it', async ({ page }) => {
  const before = (await sentMail()).filter((m) => m.to === 'sammy@example.com').length;
  expect(before).toBe(1);

  await openDoorRoster(page, show.showName);
  await page.getByRole('button', { name: /Sammy Davis/ }).click();
  await expect(page.getByTestId('party-confirmation')).toContainText('Emailed');
  await page.getByRole('button', { name: 'Resend confirmation email' }).click();
  await expect(page.getByRole('button', { name: 'Confirmation sent ✓' })).toBeVisible();
  await expect(page.getByTestId('party-confirmation')).toHaveText('Sent just now');

  const after = (await sentMail()).filter((m) => m.to === 'sammy@example.com');
  expect(after).toHaveLength(2);
  expect(after[1].text).toContain('At the door: give the name "Sammy Davis"');
  expect(after[1].text).toContain('first come, first served');
});
