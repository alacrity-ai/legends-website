/**
 * Response / auth helpers shared by every route module. Extracted from
 * index.ts in P1 (LGD-15) so charts.ts can use the same conventions
 * without a circular import.
 */
import type { Env } from './types.ts';

export function jsonResponse(
  status: number,
  body: Record<string, unknown>,
  ...headerObjects: Record<string, string>[]
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...Object.assign({}, ...headerObjects),
    },
  });
}

export const NO_STORE: Record<string, string> = { 'Cache-Control': 'no-store' };

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Invalid request';
}

export function getCorsHeaders(request: Request, allowedOrigins: string): Record<string, string> {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = allowedOrigins.split(',').map((o) => o.trim());

  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (allowed.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

export function adminPasscode(env: Env): string {
  return env.ADMIN_PASSCODE || env.GUESTLIST_PASSCODE || '';
}

export function isAuthorized(request: Request, passcode: string): boolean {
  const header = request.headers.get('Authorization');
  if (!header || !header.startsWith('Bearer ')) {
    return false;
  }
  const token = header.slice('Bearer '.length);
  return constantTimeEqual(token, passcode);
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
