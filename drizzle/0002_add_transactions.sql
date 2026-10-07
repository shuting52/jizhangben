CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('expense', 'income')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  category TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  spoken_text TEXT,
  occurred_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

--> statement-breakpoint

CREATE INDEX transactions_occurred_at_idx ON transactions (occurred_at DESC);
