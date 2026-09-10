/** Tiny multipart/form-data reader for what the worker sends Mailgun (tests only). */
export interface FormPart {
  name: string;
  filename?: string;
  value: string;
}

export function parseMultipart(body: string, contentType: string): FormPart[] {
  const m = contentType.match(/boundary=("?)([^";]+)\1/);
  if (!m) return [];
  const boundary = `--${m[2]}`;
  const parts: FormPart[] = [];
  for (const chunk of body.split(boundary)) {
    if (!chunk.trim() || chunk.trim() === '--') continue;
    const sep = chunk.indexOf('\r\n\r\n');
    if (sep < 0) continue;
    const head = chunk.slice(0, sep);
    let value = chunk.slice(sep + 4);
    if (value.endsWith('\r\n')) value = value.slice(0, -2);
    const name = head.match(/ name="([^"]*)"/)?.[1] ?? '';
    const filename = head.match(/ filename="([^"]*)"/)?.[1];
    parts.push({ name, value, ...(filename !== undefined ? { filename } : {}) });
  }
  return parts;
}
