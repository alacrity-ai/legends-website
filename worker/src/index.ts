import type { Env } from './types.ts';
import { parseBookingInquiry } from './validation.ts';
import { sendEmail } from './services/mailgun.ts';
import { buildNotificationEmail } from './templates/notification.ts';
import { buildConfirmationEmail } from './templates/confirmation.ts';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = getCorsHeaders(request, env.ALLOWED_ORIGINS);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (url.pathname !== '/api/booking') {
      return jsonResponse(404, { error: 'Not found' }, corsHeaders);
    }

    if (request.method !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed' }, corsHeaders);
    }

    let inquiry;
    try {
      const body = await request.json();
      inquiry = parseBookingInquiry(body);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid request';
      return jsonResponse(400, { error: message }, corsHeaders);
    }

    const notification = buildNotificationEmail(inquiry);
    const notificationResult = await sendEmail(
      {
        from: `DJKMD Legends <noreply@${env.MAILGUN_DOMAIN}>`,
        to: env.BOOKING_EMAIL,
        subject: notification.subject,
        text: notification.text,
        html: notification.html,
      },
      env.MAILGUN_API_KEY,
      env.MAILGUN_DOMAIN,
    );

    if (!notificationResult.success) {
      console.error('Notification email failed:', notificationResult.error);
      return jsonResponse(500, { error: 'Failed to send email' }, corsHeaders);
    }

    const confirmation = buildConfirmationEmail(inquiry);
    const confirmationResult = await sendEmail(
      {
        from: `DJKMD Legends <booking@${env.MAILGUN_DOMAIN}>`,
        to: inquiry.email,
        replyTo: env.BOOKING_EMAIL,
        subject: confirmation.subject,
        text: confirmation.text,
        html: confirmation.html,
      },
      env.MAILGUN_API_KEY,
      env.MAILGUN_DOMAIN,
    );

    if (!confirmationResult.success) {
      console.error('Confirmation email failed:', confirmationResult.error);
      return jsonResponse(500, { error: 'Failed to send email' }, corsHeaders);
    }

    return jsonResponse(200, { success: true }, corsHeaders);
  },
} satisfies ExportedHandler<Env>;

function getCorsHeaders(request: Request, allowedOrigins: string): Record<string, string> {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = allowedOrigins.split(',').map((o) => o.trim());

  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (allowed.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
  extraHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
}
