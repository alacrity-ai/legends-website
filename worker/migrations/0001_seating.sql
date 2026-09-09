-- v0.5 Seating Charts (LGD-12 / LGD-14): per-show seat state + checkout holds.
-- Layouts themselves live in KV (`chart:<id>`); D1 holds only the rows that need
-- an atomic conditional claim. Rows per show = the layout's seat count (≤ 400).

CREATE TABLE IF NOT EXISTS seats (
  show_id         TEXT NOT NULL,                       -- event id
  seat_id         TEXT NOT NULL,                       -- "<objectId>.<n>"
  label           TEXT NOT NULL,                       -- "T1-3"
  object_id       TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'available',   -- available | held | sold
  hold_id         TEXT,                                -- while held
  hold_expires_at INTEGER,                             -- epoch ms, while held
  party_key       TEXT,                                -- "party:<eventId>:<paymentId>" once sold
  updated_at      INTEGER NOT NULL,
  PRIMARY KEY (show_id, seat_id)
);
CREATE INDEX IF NOT EXISTS seats_show_status ON seats (show_id, status);
CREATE INDEX IF NOT EXISTS seats_hold ON seats (hold_id);

CREATE TABLE IF NOT EXISTS seat_holds (
  id               TEXT PRIMARY KEY,                   -- "h_" + 12 hex
  show_id          TEXT NOT NULL,
  seat_ids         TEXT NOT NULL,                      -- JSON array
  ticket_type      TEXT NOT NULL,
  quantity         INTEGER NOT NULL,
  status           TEXT NOT NULL DEFAULT 'active',     -- active | converted | released | superseded
  expires_at       INTEGER NOT NULL,                   -- epoch ms
  square_order_id  TEXT,                               -- set when the payment link is minted
  square_link_id   TEXT,
  party_key        TEXT,                               -- set on conversion
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS holds_order ON seat_holds (square_order_id);
CREATE INDEX IF NOT EXISTS holds_show_status ON seat_holds (show_id, status);
