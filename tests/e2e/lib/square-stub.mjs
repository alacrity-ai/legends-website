#!/usr/bin/env node
/**
 * A stand-in for Square's API + hosted checkout, just enough for the worker's
 * checkout → pay → webhook round trip to run offline:
 *
 *   POST /v2/online-checkout/payment-links   → mints a link whose url is /pay/:id here
 *   DELETE /v2/online-checkout/payment-links/:id
 *   POST /v2/locations                        → one fixed location
 *   GET  /v2/orders/:id  /v2/payments/:id     → what the webhook reads back
 *   GET  /pay/:id                             → a one-button "checkout" page
 *   POST /pay/:id                             → signs + delivers payment.updated
 *                                              to the worker, then redirects to
 *                                              the link's redirect_url
 *   GET  /_test/health · POST /_test/reset      → readiness / forget everything
 *
 * Started by playwright.config.ts on :8798; the worker runs with
 * `--var SQUARE_API_BASE:http://localhost:8798`.
 */
import { createServer } from 'node:http';
import { createHmac, randomBytes } from 'node:crypto';

/** Square ids are ~22 url-safe chars; the worker validates the shape on check-in. */
const squareId = (prefix) => prefix + randomBytes(12).toString('base64url').replace(/[^A-Za-z0-9]/g, 'x').slice(0, 16);

const PORT = Number(process.env.SQUARE_STUB_PORT || 8798);
const WORKER = process.env.WORKER_URL || 'http://localhost:8797';
/** wrangler dev rewrites the request URL to the first [[routes]] host, and the worker signs against that. */
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://djkmdlegends.com/api/square/webhook';
const KEY = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || 'e2e-whsec';

let seq = 0;
/** linkId → { orderId, note, redirectUrl, amount, name } */
const links = new Map();
/** orderId → link */
const orders = new Map();
/** paymentId → { orderId, amount, email } */
const payments = new Map();

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
  });
}

async function deliverWebhook(paymentId, orderId) {
  const body = JSON.stringify({ type: 'payment.updated', event_id: `evt-${paymentId}`, data: { object: { payment: { id: paymentId, status: 'COMPLETED', order_id: orderId } } } });
  const signature = createHmac('sha256', KEY).update(WEBHOOK_URL + body).digest('base64');
  const res = await fetch(`${WORKER}/api/square/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-square-hmacsha256-signature': signature }, body });
  return res.status;
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  if (req.method === 'GET' && path === '/_test/health') return json(res, 200, { ok: true, links: links.size });

  if (req.method === 'POST' && path === '/_test/reset') {
    links.clear();
    orders.clear();
    payments.clear();
    return json(res, 200, { ok: true });
  }

  if (req.method === 'POST' && path === '/v2/locations') {
    return json(res, 200, { location: { id: 'L-STUB' } });
  }

  if (req.method === 'POST' && path === '/v2/online-checkout/payment-links') {
    const body = JSON.parse((await readBody(req)) || '{}');
    const n = ++seq;
    const link = {
      id: `PL${n}`,
      orderId: `ORD${n}`,
      note: body.payment_note,
      redirectUrl: body.checkout_options?.redirect_url,
      amount: body.quick_pay?.price_money?.amount ?? 0,
      name: body.quick_pay?.name,
      buyer: null,
    };
    links.set(link.id, link);
    orders.set(link.orderId, link);
    return json(res, 200, { payment_link: { id: link.id, url: `http://localhost:${PORT}/pay/${link.id}`, order_id: link.orderId } });
  }

  let m = path.match(/^\/v2\/online-checkout\/payment-links\/(.+)$/);
  if (req.method === 'DELETE' && m) {
    const link = links.get(m[1]);
    if (link) link.deactivated = true;
    return json(res, 200, {});
  }

  m = path.match(/^\/v2\/orders\/(.+)$/);
  if (req.method === 'GET' && m) {
    const link = orders.get(m[1]);
    if (!link) return json(res, 404, { errors: [{ detail: 'not found' }] });
    return json(res, 200, {
      order: {
        tenders: [{ note: link.note }],
        fulfillments: [{ delivery_details: { note: `Full name (for the guest list): ${link.buyer?.name ?? 'Stub Buyer'}` } }],
      },
    });
  }

  m = path.match(/^\/v2\/payments\/(.+)$/);
  if (req.method === 'GET' && m) {
    const p = payments.get(m[1]);
    if (!p) return json(res, 404, { errors: [{ detail: 'not found' }] });
    return json(res, 200, { payment: { note: p.note, buyer_email_address: p.email, amount_money: { amount: p.amount, currency: 'USD' } } });
  }

  m = path.match(/^\/pay\/(PL\d+)$/);
  if (m) {
    const link = links.get(m[1]);
    if (!link) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end('no such link');
    }
    if (req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>Square (stub) checkout</title>
<style>body{font-family:system-ui;padding:24px;max-width:420px;margin:auto}button{font-size:18px;padding:12px 20px;width:100%}input{font-size:16px;padding:8px;width:100%;margin:6px 0 14px;box-sizing:border-box}</style></head>
<body><h1>Square checkout (stub)</h1><p data-testid="item">${link.name}</p><p data-testid="amount">$${(link.amount / 100).toFixed(2)}</p>
<form method="post"><label>Full name (for the guest list)<input name="name" value="Stub Buyer" data-testid="name"></label><label>Email<input name="email" value="buyer@example.com" data-testid="email"></label>
<button type="submit" data-testid="pay">Pay</button></form></body></html>`);
    }
    if (req.method === 'POST') {
      const form = new URLSearchParams(await readBody(req));
      const paymentId = squareId('PAY');
      link.buyer = { name: form.get('name') || 'Stub Buyer', email: form.get('email') || 'buyer@example.com' };
      payments.set(paymentId, { orderId: link.orderId, note: link.note, amount: link.amount, email: link.buyer.email });
      const status = await deliverWebhook(paymentId, link.orderId);
      if (status !== 200) {
        res.writeHead(502, { 'content-type': 'text/plain' });
        return res.end(`webhook delivery failed: ${status}`);
      }
      res.writeHead(302, { location: link.redirectUrl || '/' });
      return res.end();
    }
  }

  json(res, 404, { errors: [{ detail: `stub: no route for ${req.method} ${path}` }] });
}).listen(PORT, () => console.log(`square stub on :${PORT} → worker ${WORKER}`));
