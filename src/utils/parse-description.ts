/**
 * Parses a Google Calendar event description (HTML) into clean display text
 * and an optional Square checkout URL.
 */
export function parseDescription(html: string | null): {
  text: string | null;
  squareUrl: string | null;
} {
  if (!html) return { text: null, squareUrl: null };

  // Extract the Square link from href or text content before stripping tags
  const squareMatch = html.match(/https:\/\/square\.link\/u\/[A-Za-z0-9]+/);
  const squareUrl = squareMatch ? squareMatch[0] : null;

  // Remove the entire <a> tag (and surrounding <p>) that contains the Square link
  let cleaned = html;
  if (squareUrl) {
    cleaned = cleaned.replace(/<p>\s*<a[^>]*>https:\/\/square\.link\/u\/[A-Za-z0-9]+<\/a>\s*<\/p>/i, '');
    // Fallback: remove any remaining raw Square URLs
    cleaned = cleaned.replace(/https:\/\/square\.link\/u\/[A-Za-z0-9]+/, '');
  }

  // Convert <p> tags to newlines, strip all remaining HTML tags, decode entities
  const text = cleaned
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<\/?p>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim() || null;

  return { text, squareUrl };
}
