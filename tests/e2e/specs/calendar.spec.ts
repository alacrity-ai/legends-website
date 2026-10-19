/**
 * /calendar (LGD-40): the month grid finds a show, and buying from the calendar
 * lands in the same ticket modal as the homepage.
 *
 * The default project is a phone, where a day is one tap target and the cards
 * below do the selling; a desktop block at the end covers the titled chips.
 */
import { expect, test, type Page } from '@playwright/test';
import { createShow, deleteShow, type Show } from '../lib/api.ts';
import { dialog } from '../lib/buyer.ts';

// Mid-month so leftover fixtures from other specs (all on the 1st) never pile
// onto this show's day and push it behind "+N more".
const SHOW_DAY = '2027-06-15';
const SHOW_MONTH = 'June 2027';

const thisMonth = () => new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

let show: Show;
test.beforeAll(async () => {
  show = await createShow({ capacity: 120, name: 'Calendar Night', startTime: `${SHOW_DAY}T19:30:00-04:00` });
});
test.afterAll(async () => {
  await deleteShow(show.id);
});

const monthTitle = (page: Page) => page.getByRole('heading', { level: 2 });
const nextBtn = (page: Page) => page.getByRole('button', { name: /next month|no shows scheduled beyond/i });
const prevBtn = (page: Page) => page.getByRole('button', { name: /previous month|earlier months/i });

async function pageTo(page: Page, label: string): Promise<void> {
  for (let i = 0; i < 36; i++) {
    if ((await monthTitle(page).textContent())?.trim() === label) return;
    await nextBtn(page).click();
  }
  throw new Error(`never reached ${label}`);
}

test('opens on this month, cannot go back, and runs forward to the farthest show', async ({ page }) => {
  await page.goto('/calendar', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { level: 1, name: 'Show Calendar' })).toBeVisible();
  await expect(monthTitle(page)).toHaveText(thisMonth());
  await expect(prevBtn(page)).toBeDisabled();
  await pageTo(page, SHOW_MONTH);
  await expect(nextBtn(page)).toBeDisabled();
  await expect(prevBtn(page)).toBeEnabled();
  await expect(page.locator(`[data-date="${SHOW_DAY}"] [data-show="${show.id}"]`)).toBeVisible();
  // No horizontal overflow on a phone.
  const widths = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
  expect(widths.doc).toBeLessThanOrEqual(widths.win);
});

test('phone: tapping the day jumps to its card, and Buy Tickets opens the ticket modal', async ({ page }) => {
  await page.goto('/calendar', { waitUntil: 'networkidle' });
  await pageTo(page, SHOW_MONTH);
  await page.locator(`button[data-date="${SHOW_DAY}"]`).click();
  const card = page.locator(`li[data-show="${show.id}"]`);
  await expect(card).toBeInViewport();
  await expect(card.getByText(show.showName)).toBeVisible();
  await card.getByRole('button', { name: 'Buy Tickets' }).click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).locator('button', { hasText: /^Buy 1 · \$39\.95/ })).toBeVisible();
});

test('deep link /calendar?event= opens the show on its month', async ({ page }) => {
  await page.goto(`/calendar?event=${show.id}`, { waitUntil: 'networkidle' });
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByText(show.showName)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await expect(monthTitle(page)).toHaveText(SHOW_MONTH);
});

test('header anchors go home from the calendar', async ({ page }) => {
  await page.goto('/calendar', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/#about');
  await expect(page.getByRole('link', { name: 'Calendar' })).toHaveAttribute('aria-current', 'page');
});

test('subscribe and add-to-calendar menus point at the feed and the one-show file (LGD-41)', async ({ page, request }) => {
  await page.goto('/calendar', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Subscribe to this calendar' }).click();
  const menu = page.getByRole('menu', { name: 'Subscribe to this calendar' });
  await expect(menu.getByRole('menuitem', { name: /Google Calendar/ })).toHaveAttribute('href', `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(`webcal://localhost:8797/api/calendar.ics`)}`);
  await expect(menu.getByRole('menuitem', { name: /Apple Calendar \/ Outlook/ })).toHaveAttribute('href', 'webcal://localhost:8797/api/calendar.ics');
  await expect(menu.getByText('http://localhost:8797/api/calendar.ics')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  // The feed itself, and the one-show file the card links to.
  const feed = await request.get('http://localhost:8797/api/calendar.ics');
  expect(feed.headers()['content-type']).toBe('text/calendar; charset=utf-8');
  expect(await feed.text()).toContain(`UID:${show.id}@djkmdlegends.com`);

  await pageTo(page, SHOW_MONTH);
  const card = page.locator(`li[data-show="${show.id}"]`);
  await card.getByRole('button', { name: `Add ${show.showName} to your calendar` }).click();
  const add = page.getByRole('menu', { name: `Add ${show.showName} to your calendar` });
  const google = new URL((await add.getByRole('menuitem', { name: 'Google Calendar' }).getAttribute('href'))!);
  expect(google.searchParams.get('text')).toBe(`${show.showName} — DJKMD Legends`);
  expect(google.searchParams.get('dates')).toBe('20270615T193000/20270615T223000');
  expect(google.searchParams.get('ctz')).toBe('America/New_York');
  await expect(add.getByRole('menuitem', { name: /Apple Calendar, Outlook/ })).toHaveAttribute('href', `http://localhost:8797/api/events/${show.id}/calendar.ics`);
  const one = await request.get(`http://localhost:8797/api/events/${show.id}/calendar.ics`);
  expect(one.headers()['content-disposition']).toMatch(/^attachment; filename="calendar-night-/);
});

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

  test('a titled chip sits on the day and opens the ticket modal', async ({ page }) => {
    await page.goto('/calendar', { waitUntil: 'networkidle' });
    await pageTo(page, SHOW_MONTH);
    const chip = page.locator(`[data-date="${SHOW_DAY}"] button[data-show="${show.id}"]`);
    await expect(chip).toBeVisible();
    await expect(chip).toContainText(show.showName);
    await expect(chip).toContainText('7:30 PM · Billerica Elks');
    await chip.click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).locator('button', { hasText: /^Buy 1 · \$39\.95/ })).toBeVisible();
  });

  test('arrow keys page months', async ({ page }) => {
    await page.goto('/calendar', { waitUntil: 'networkidle' });
    await page.keyboard.press('ArrowRight');
    await expect(monthTitle(page)).not.toHaveText(thisMonth());
    await page.keyboard.press('ArrowLeft');
    await expect(monthTitle(page)).toHaveText(thisMonth());
  });

  test('the homepage links to the calendar from the hero and Upcoming Shows', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.getByRole('link', { name: 'Show Calendar' })).toHaveAttribute('href', '/calendar');
    await expect(page.getByRole('link', { name: 'View Full Calendar' })).toHaveAttribute('href', '/calendar');
  });
});
