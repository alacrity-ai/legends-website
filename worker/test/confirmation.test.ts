/**
 * Legends-branded ticket confirmation email (LGD-24). Square's receipt only
 * knows our single Location, so this is the buyer's real record of where,
 * when, what and which seats. It must never get in the way of the sale.
 */
import { describe, expect, it } from 'vitest';
import { env, fetchMock } from 'cloudflare:test';
import { admin, api, checkout, createEvent, expireHold, hold, mockSquareCheckout, mockSquarePaid, paymentUpdated, seatedShow } from './helpers.ts';
import { deliverWebhook } from './webhook-driver.ts';
import { parseMultipart, type FormPart } from './multipart.ts';

const MAILGUN = 'https://api.mailgun.net';
const SHOW_ONLY = { ticketType: 'Show Only' };

interface Mail {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  attachments: { filename: string; content: string }[];
}

function toMail(parts: FormPart[]): Mail {
  const field = (n: string) => parts.find((p) => p.name === n && p.filename === undefined)?.value ?? '';
  return {
    from: field('from'),
    to: field('to'),
    subject: field('subject'),
    text: field('text'),
    html: field('html'),
    replyTo: field('h:Reply-To') || undefined,
    attachments: parts.filter((p) => p.name === 'attachment').map((p) => ({ filename: p.filename ?? '', content: p.value })),
  };
}

/** Intercept Mailgun; returns the messages it received, in order. */
function mockMailgun(status = 200): Mail[] {
  const sent: Mail[] = [];
  fetchMock
    .get(MAILGUN)
    .intercept({ method: 'POST', path: '/v3/mg.test/messages' })
    .reply(status, (opts) => {
      const ct = (opts.headers as Record<string, string>)['content-type'] ?? (opts.headers as Record<string, string>)['Content-Type'] ?? '';
      sent.push(toMail(parseMultipart(String(opts.body), ct)));
      return status === 200 ? { id: '<queued@mg.test>', message: 'Queued. Thank you.' } : { message: 'Mailgun is down' };
    })
    .persist();
  return sent;
}

async function party(eventId: string, paymentId: string): Promise<any> {
  return env.GUESTLIST.get(`party:${eventId}:${paymentId}`, 'json');
}

describe('confirmation email on a completed payment', () => {
  it('general admission: venue + map link, tickets + total, first-come seating, name at the door, .ics attached', async () => {
    mockSquareCheckout();
    const mail = mockMailgun();
    const ga = await createEvent({ capacity: 120 });
    await checkout(ga.id, { ...SHOW_ONLY, quantity: 2 });
    mockSquarePaid({ orderId: 'ORD1', paymentId: 'PAYMENT001', note: `legends-event:${ga.id}:Show Only:2` });
    expect((await deliverWebhook(paymentUpdated('PAYMENT001', 'ORD1'))).status).toBe(200);

    expect(mail).toHaveLength(1);
    const m = mail[0];
    expect(m.to).toBe('frank@example.com');
    expect(m.from).toBe('DJKMD Legends <tickets@mg.test>');
    expect(m.subject).toBe(`Your tickets: ${ga.showName} — Jun 1, 2027, 8:00 PM`);
    expect(m.text).toContain('Hi Frank,');
    expect(m.text).toContain('Billerica Elks');
    expect(m.text).toContain('14 Webb Brook Rd, Billerica, MA 01821');
    expect(m.text).toContain('https://www.google.com/maps/search/?api=1&query=Billerica%20Elks%2C%2014%20Webb%20Brook%20Rd');
    expect(m.text).toContain('2 × Show Only');
    expect(m.text).toContain('Total paid: $79.90');
    expect(m.text).toContain('first come, first served');
    expect(m.text).toContain('At the door: give the name "Frank Sinatra"');
    expect(m.text).toContain('Payment reference: PAYMENT001');
    expect(m.text).toContain(`http://localhost:5173/?event=${ga.id}`);
    expect(m.html).toContain('Open in Google Maps');
    expect(m.html).toContain('14 Webb Brook Rd, Billerica, MA 01821');
    expect(m.attachments).toHaveLength(1);
    expect(m.attachments[0].filename).toBe('djkmd-legends-show.ics');
    const ics = m.attachments[0].content;
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('DTSTART:20270602T000000Z');
    expect(ics).toContain('DTEND:20270602T030000Z');
    expect(ics).toContain('LOCATION:Billerica Elks\\, 14 Webb Brook Rd\\, Billerica\\, MA 01821');
    expect(ics).toContain('UID:PAYMENT001@djkmdlegends.com');

    const p = await party(ga.id, 'PAYMENT001');
    expect(typeof p.confirmationSentAt).toBe('string');
    const roster = await admin(`/api/admin/events/${ga.id}/guests`);
    expect(roster.body.parties[0].confirmationSentAt).toBe(p.confirmationSentAt);
  });

  it('reserved seating: names the table and seats', async () => {
    mockSquareCheckout();
    const mail = mockMailgun();
    const show = await seatedShow();
    const h = await hold(show.id, { ...SHOW_ONLY, quantity: 2 });
    await checkout(show.id, { ...SHOW_ONLY, quantity: 2, holdId: h.body.holdId });
    mockSquarePaid({ orderId: 'ORD1', paymentId: 'PAYMENT002', note: `legends-event:${show.id}:Show Only:2` });
    await deliverWebhook(paymentUpdated('PAYMENT002', 'ORD1'));

    expect(mail).toHaveLength(1);
    expect(mail[0].text).toContain('Your seats: Table 2, seats 1–2.');
    expect(mail[0].text).not.toContain('first come');
    expect(mail[0].attachments[0].content).toContain('Table 2\\, seats 1');
  });

  it('a late payer who lost the seats is told staff will seat them', async () => {
    mockSquareCheckout();
    const mail = mockMailgun();
    const show = await seatedShow();
    const h = await hold(show.id, { ...SHOW_ONLY, quantity: 2 });
    await checkout(show.id, { ...SHOW_ONLY, quantity: 2, holdId: h.body.holdId });
    await expireHold(h.body.holdId);
    await hold(show.id, { ...SHOW_ONLY, quantity: 2 }); // someone else now holds T2 1–2
    mockSquarePaid({ orderId: 'ORD1', paymentId: 'PAYMENT003', note: `legends-event:${show.id}:Show Only:2` });
    await deliverWebhook(paymentUpdated('PAYMENT003', 'ORD1'));

    expect(mail).toHaveLength(1);
    expect(mail[0].text).toContain('Our staff will seat your party when you arrive');
    expect(mail[0].text).not.toContain('Your seats:');
  });

  it('no email on the payment: nothing is sent and the party still lands', async () => {
    mockSquareCheckout();
    const mail = mockMailgun();
    const ga = await createEvent({ capacity: 120 });
    await checkout(ga.id, { ...SHOW_ONLY, quantity: 1 });
    mockSquarePaid({ orderId: 'ORD1', paymentId: 'PAYMENT004', note: `legends-event:${ga.id}:Show Only:1`, email: '' });
    await deliverWebhook(paymentUpdated('PAYMENT004', 'ORD1'));
    expect(mail).toHaveLength(0);
    const p = await party(ga.id, 'PAYMENT004');
    expect(p).toBeTruthy();
    expect(p.confirmationSentAt).toBeUndefined();
  });

  it('Mailgun down: the sale is unaffected and the party is marked as never confirmed', async () => {
    mockSquareCheckout();
    mockMailgun(500);
    const ga = await createEvent({ capacity: 120 });
    await checkout(ga.id, { ...SHOW_ONLY, quantity: 1 });
    mockSquarePaid({ orderId: 'ORD1', paymentId: 'PAYMENT005', note: `legends-event:${ga.id}:Show Only:1` });
    expect((await deliverWebhook(paymentUpdated('PAYMENT005', 'ORD1'))).status).toBe(200);
    const p = await party(ga.id, 'PAYMENT005');
    expect(p.firstName).toBe('Frank');
    expect(p.confirmationSentAt).toBeUndefined();
    const roster = await admin(`/api/admin/events/${ga.id}/guests`);
    expect(roster.body.parties[0].confirmationSentAt).toBeUndefined();
  });

  it('a redelivered webhook does not send a second email', async () => {
    mockSquareCheckout();
    const mail = mockMailgun();
    const ga = await createEvent({ capacity: 120 });
    await checkout(ga.id, { ...SHOW_ONLY, quantity: 1 });
    mockSquarePaid({ orderId: 'ORD1', paymentId: 'PAYMENT006', note: `legends-event:${ga.id}:Show Only:1` });
    await deliverWebhook(paymentUpdated('PAYMENT006', 'ORD1'));
    await deliverWebhook(paymentUpdated('PAYMENT006', 'ORD1'));
    await deliverWebhook(paymentUpdated('PAYMENT006', 'ORD1'));
    expect(mail).toHaveLength(1);
  });
});

describe('POST /api/admin/events/:id/parties/:paymentId/confirmation', () => {
  async function paidParty(): Promise<{ id: string; mail: Mail[] }> {
    mockSquareCheckout();
    const mail = mockMailgun();
    const ga = await createEvent({ capacity: 120 });
    await checkout(ga.id, { ...SHOW_ONLY, quantity: 1 });
    mockSquarePaid({ orderId: 'ORD1', paymentId: 'PAYMENT100', note: `legends-event:${ga.id}:Show Only:1` });
    await deliverWebhook(paymentUpdated('PAYMENT100', 'ORD1'));
    expect(mail).toHaveLength(1);
    return { id: ga.id, mail };
  }

  it('re-sends to the buyer and stamps confirmationSentAt again', async () => {
    const { id, mail } = await paidParty();
    const before = (await party(id, 'PAYMENT100')).confirmationSentAt;
    await new Promise((r) => setTimeout(r, 5));
    const r = await admin(`/api/admin/events/${id}/parties/PAYMENT100/confirmation`, { method: 'POST' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.sentTo).toBe('frank@example.com');
    expect(mail).toHaveLength(2);
    expect(mail[1].to).toBe('frank@example.com');
    expect(r.body.party.confirmationSentAt).not.toBe(before);
  });

  it('sends a copy to another address without touching the party', async () => {
    const { id, mail } = await paidParty();
    const before = (await party(id, 'PAYMENT100')).confirmationSentAt;
    const r = await admin(`/api/admin/events/${id}/parties/PAYMENT100/confirmation`, { method: 'POST', body: JSON.stringify({ to: 'leif@example.com' }) });
    expect(r.status).toBe(200);
    expect(r.body.sentTo).toBe('leif@example.com');
    expect(mail[1].to).toBe('leif@example.com');
    expect(mail[1].text).toContain('At the door: give the name "Frank Sinatra"');
    expect((await party(id, 'PAYMENT100')).confirmationSentAt).toBe(before);
  });

  it('requires the passcode, a real party, and a valid address', async () => {
    const { id } = await paidParty();
    expect((await api(`/api/admin/events/${id}/parties/PAYMENT100/confirmation`, { method: 'POST' })).status).toBe(401);
    expect((await admin(`/api/admin/events/${id}/parties/PAYMENT999/confirmation`, { method: 'POST' })).status).toBe(404);
    expect((await admin(`/api/admin/events/${id}/parties/PAYMENT100/confirmation`, { method: 'GET' })).status).toBe(405);
    expect((await admin(`/api/admin/events/${id}/parties/PAYMENT100/confirmation`, { method: 'POST', body: JSON.stringify({ to: 'not-an-email' }) })).status).toBe(400);
    expect((await admin(`/api/admin/events/${id}/parties/PAYMENT100/confirmation`, { method: 'POST', body: JSON.stringify({ nope: 1 }) })).status).toBe(400);
  });

  it('reports Mailgun failures instead of pretending', async () => {
    mockSquareCheckout();
    const ga = await createEvent({ capacity: 120 });
    await checkout(ga.id, { ...SHOW_ONLY, quantity: 1 });
    mockSquarePaid({ orderId: 'ORD1', paymentId: 'PAYMENT101', note: `legends-event:${ga.id}:Show Only:1` });
    mockMailgun(500);
    await deliverWebhook(paymentUpdated('PAYMENT101', 'ORD1'));
    const r = await admin(`/api/admin/events/${ga.id}/parties/PAYMENT101/confirmation`, { method: 'POST' });
    expect(r.status).toBe(502);
    expect(r.body.error).toContain('Mailgun is down');
  });
});
