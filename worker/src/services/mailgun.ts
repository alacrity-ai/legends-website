export interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}

export async function sendEmail(
  message: EmailMessage,
  apiKey: string,
  domain: string,
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

  const url = `https://api.mailgun.net/v3/${domain}/messages`;
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
