-- LGD-28: campaign click tracking. One row per hit on /go/:slug, written from
-- `waitUntil` after the redirect has already gone out. Deliberately holds no IP
-- address or anything else that identifies a person.

CREATE TABLE IF NOT EXISTS clicks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT NOT NULL,                     -- campaign slug, e.g. "ratpack"
  source     TEXT,                              -- optional ?s= tag: "email", "card", …
  known      INTEGER NOT NULL DEFAULT 1,        -- 0 = slug had no destination (sent home)
  created_at INTEGER NOT NULL,                  -- epoch ms
  referer    TEXT,
  country    TEXT,                              -- request.cf.country
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS clicks_slug_time ON clicks (slug, created_at);
