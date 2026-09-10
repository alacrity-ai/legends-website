export interface EmailAttachment {
  filename: string;
  content: string;
  contentType: string;
}

export interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
}

const MAILGUN_API = 'https://api.mailgun.net';

export async function sendEmail(
  message: EmailMessage,
  apiKey: string,
  domain: string,
  /** Override the Mailgun API base (the e2e suite points this at its stub). */
  apiBase?: string,
): Promise<{ success: boolean; error?: string }> {
  const form = new FormData();
  form.append('from', message.from);
  form.append('to', message.to);
  form.append('subject', message.subject);
  form.append('text', message.text);
  form.append('html', message.html);
  if (message.replyTo) {
    form.append('h:Reply-To', message.replyTo);
  }
  for (const a of message.attachments ?? []) {
    form.append('attachment', new Blob([a.content], { type: a.contentType }), a.filename);
  }

  const url = `${(apiBase || MAILGUN_API).replace(/\/$/, '')}/v3/${domain}/messages`;
  const auth = btoa(`api:${apiKey}`);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}` },
      body: form,
    });

    if (res.ok) {
      return { success: true };
    }

    const body = await res.json().catch(() => ({ message: 'Unknown error' })) as { message?: string };
    return { success: false, error: body.message ?? `Mailgun returned ${res.status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error';
    return { success: false, error: msg };
  }
}
