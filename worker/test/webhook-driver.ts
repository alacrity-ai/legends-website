/**
 * Deliver a signed Square webhook straight to the handler with a real
 * ExecutionContext, then wait for its `waitUntil` work (the roster write,
 * seat confirmation and sold counter all happen after the 200).
 */
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import worker from '../src/index.ts';
import { ORIGIN, signWebhook } from './helpers.ts';

export async function deliverWebhook(rawBody: string, opts: { signature?: string | null } = {}): Promise<Response> {
  const url = `${ORIGIN}/api/square/webhook`;
  const signature = opts.signature === undefined ? await signWebhook(url, rawBody) : opts.signature;
  const req = new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(signature ? { 'x-square-hmacsha256-signature': signature } : {}) },
    body: rawBody,
  });
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
