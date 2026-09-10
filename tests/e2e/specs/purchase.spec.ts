/**
 * The whole money path in one browser: Buy → seat sheet → (stub) Square →
 * webhook → the party is on the door roster with its seats. No mocks in the
 * browser; the only stand-in is the Square stub.
 */
import { expect, test } from '@playwright/test';
import { createShow, deleteShow, guests, seatedShow, seatStatuses, sentMail, type Show } from '../lib/api.ts';
import { openAndBuy, sheet } from '../lib/buyer.ts';

test('reserved seating: pay on the (stub) Square page and land back on the site with the seats sold', async ({ page }) => {
  const show: Show = await seatedShow();
  try {
    await openAndBuy(page, show.id, 2, 'Dinner + Show');
    const s = await sheet(page);
    await expect(s.title).toContainText('Table 2');
    await s.continueBtn.click();
    await page.waitForURL(/localhost:8798\/pay\//);
    await expect(page.getByTestId('item')).toContainText('Dinner + Show × 2 · Table 2, seats 1–2');
    await expect(page.getByTestId('amount')).toHaveText('$119.90');
    await page.getByTestId('name').fill('Dean Martin');
    await page.getByTestId('pay').click();
    await page.waitForURL(/purchase=success/);

    await expect.poll(async () => (await guests(show.id)).parties.length, { timeout: 10_000 }).toBe(1);
    const roster = await guests(show.id);
    expect(roster.parties[0]).toMatchObject({ firstName: 'Dean', lastName: 'Martin', quantity: 2, seatLabels: ['T2-1', 'T2-2'], seatStatus: 'assigned' });
    expect(roster.seating.seats['o_2.1']).toEqual({ status: 'sold', partyId: roster.parties[0].id });
    const status = seatStatuses(show.id);
    expect(status['o_2.1']).toBe('sold');
    expect(status['o_2.2']).toBe('sold');

    // The buyer's Legends confirmation (LGD-24): venue + map, seats, calendar file.
    const mail = (await sentMail()).filter((m) => m.to === 'buyer@example.com' && m.subject.includes(show.showName));
    expect(mail).toHaveLength(1);
    expect(mail[0].from).toBe('DJKMD Legends <tickets@mg.e2e>');
    expect(mail[0].subject).toBe(`Your tickets: ${show.showName} — Jun 1, 2027, 8:00 PM`);
    expect(mail[0].text).toContain('14 Webb Brook Rd, Billerica, MA 01821');
    expect(mail[0].text).toContain('https://www.google.com/maps/search/?api=1&query=');
    expect(mail[0].text).toContain('2 × Dinner + Show');
    expect(mail[0].text).toContain('Total paid: $119.90');
    expect(mail[0].text).toContain('Your seats: Table 2, seats 1–2.');
    expect(mail[0].text).toContain('At the door: give the name "Dean Martin"');
    expect(mail[0].attachments.map((a) => a.filename)).toEqual(['djkmd-legends-show.ics']);
    expect(mail[0].attachments[0].content).toContain('LOCATION:Billerica Elks');
    expect((await guests(show.id)).parties[0].confirmationSentAt).toBeTruthy();

    // The next buyer sees those seats taken and is placed beside them.
    await openAndBuy(page, show.id, 2);
    const s2 = await sheet(page);
    await expect(s2.seats('sold')).toHaveCount(2);
    await expect(s2.subtitle).toContainText('Seats T2-3, T2-4');
  } finally {
    await deleteShow(show.id);
  }
});

test('general admission: pay on the (stub) Square page; the roster party has no seats', async ({ page }) => {
  const show = await createShow({ capacity: 50 });
  try {
    await openAndBuy(page, show.id, 3);
    await page.waitForURL(/localhost:8798\/pay\//);
    await expect(page.getByTestId('item')).toContainText('Show Only × 3 ·');
    await expect(page.getByTestId('item')).not.toContainText('Table');
    await page.getByTestId('name').fill('Sammy Davis');
    await page.getByTestId('pay').click();
    await page.waitForURL(/purchase=success/);
    await expect.poll(async () => (await guests(show.id)).parties.length, { timeout: 10_000 }).toBe(1);
    const roster = await guests(show.id);
    expect(roster.parties[0]).toMatchObject({ firstName: 'Sammy', lastName: 'Davis', quantity: 3 });
    expect(roster.parties[0].seatStatus).toBeUndefined();
    expect(roster.seating).toBeUndefined();
  } finally {
    await deleteShow(show.id);
  }
});
