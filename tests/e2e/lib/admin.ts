/** Page helpers for the admin PWA (door check-in + manage shows). */
import { expect, type Page } from '@playwright/test';
import { ADMIN, PASSCODE } from '../playwright.config.ts';

/** Sign in once per page by seeding the stored passcode, then open a route. */
export async function openAdmin(page: Page, path: string): Promise<void> {
  await page.goto(`${ADMIN}/`);
  await page.evaluate((code) => localStorage.setItem('guestlist:passcode', code), PASSCODE);
  await page.goto(`${ADMIN}${path}`, { waitUntil: 'networkidle' });
}

/** Door Check-in → pick a show by name. */
export async function openDoorRoster(page: Page, showName: string): Promise<void> {
  await openAdmin(page, '/checkin');
  await page.getByRole('button', { name: showName }).first().click();
  await expect(page.getByRole('heading', { name: showName, exact: true })).toBeVisible();
}

export const chart = (page: Page) => page.getByTestId('occupancy-chart');
export const seatsIn = (page: Page, state: string) => chart(page).locator(`[data-seat-id][data-seat-state="${state}"]`);
