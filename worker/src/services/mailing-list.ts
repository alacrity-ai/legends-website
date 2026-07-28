/**
 * The MAILING_LIST KV namespace is the site's one mailing list: every form
 * signup AND every ticket buyer lands here, keyed by lowercased email so a
 * repeat customer dedupes onto a single entry.
 */

export type MailingListSource = 'signup' | 'purchase' | 'import';

export interface MailingListEntry {
  name: string | null;
  /**
   * How this person got onto the list. Consent tiers matter for campaigns:
   * 'signup' is an explicit opt-in, 'purchase' came from a Square sale,
   * 'import' from a legacy CSV roster. A stronger source is never downgraded.
   */
  source: MailingListSource;
  /** Set when the person explicitly signed up via the site form. */
  signedUpAt?: string;
  addedAt: string;
  updatedAt: string;
}

const SOURCE_RANK: Record<MailingListSource, number> = {
  signup: 3,
  purchase: 2,
  import: 1,
};

/** Entries written before source tracking ({name, signedUpAt}) are form signups. */
export function normalizeExisting(raw: Partial<MailingListEntry> | null): MailingListEntry | null {
  if (!raw) return null;
  return {
    name: raw.name ?? null,
    source: raw.source ?? 'signup',
    signedUpAt: raw.signedUpAt,
    addedAt: raw.addedAt ?? raw.signedUpAt ?? new Date().toISOString(),
    updatedAt: raw.updatedAt ?? raw.signedUpAt ?? new Date().toISOString(),
  };
}

/** Pure merge so the backfill script and the worker share one set of rules. */
export function mergeMailingListEntry(
  existing: MailingListEntry | null,
  incoming: { name: string | null; source: MailingListSource; at: string },
): MailingListEntry {
  if (!existing) {
    return {
      name: incoming.name,
      source: incoming.source,
      ...(incoming.source === 'signup' ? { signedUpAt: incoming.at } : {}),
      addedAt: incoming.at,
      updatedAt: incoming.at,
    };
  }
  const keepExistingSource = SOURCE_RANK[existing.source] >= SOURCE_RANK[incoming.source];
  const signedUpAt =
    existing.signedUpAt ?? (incoming.source === 'signup' ? incoming.at : undefined);
  // Field order matters: entries are diffed as JSON strings (backfill
  // idempotency), so both construction paths must emit identical shapes.
  return {
    // A signup is the person typing their own name — let it win; otherwise
    // the first recorded name sticks and blanks fill in.
    name:
      incoming.source === 'signup' && incoming.name
        ? incoming.name
        : existing.name ?? incoming.name,
    source: keepExistingSource ? existing.source : incoming.source,
    ...(signedUpAt ? { signedUpAt } : {}),
    addedAt: existing.addedAt <= incoming.at ? existing.addedAt : incoming.at,
    updatedAt: existing.updatedAt >= incoming.at ? existing.updatedAt : incoming.at,
  };
}

/**
 * Add or refresh one person on the mailing list. Failures here must never
 * break the caller's main job (a sale, a signup response) — callers wrap this
 * in their own try/catch where that matters.
 */
export async function upsertMailingListEntry(
  kv: KVNamespace,
  email: string,
  name: string | null,
  source: MailingListSource,
): Promise<void> {
  const key = email.trim().toLowerCase();
  if (!key.includes('@')) return;
  let raw: Partial<MailingListEntry> | null = null;
  try {
    raw = await kv.get<Partial<MailingListEntry>>(key, 'json');
  } catch {
    raw = null; // unparseable legacy value — rebuild it
  }
  const merged = mergeMailingListEntry(normalizeExisting(raw), {
    name: name?.trim() || null,
    source,
    at: new Date().toISOString(),
  });
  await kv.put(key, JSON.stringify(merged));
}
