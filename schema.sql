-- ═══════════════════════════════════════════════════
--  ISE PK — Lead CRM database schema
--  Run once against your Turso database
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS leads (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ref            TEXT UNIQUE,                       -- ISE-2026-0042
  source         TEXT DEFAULT 'contact',            -- contact | estimate
  name           TEXT NOT NULL,
  company        TEXT,
  phone          TEXT NOT NULL,
  email          TEXT,
  service_type   TEXT,
  message        TEXT,
  city           TEXT,
  status         TEXT DEFAULT 'new',                -- new|contacted|survey|quoted|won|lost
  assigned_to    TEXT DEFAULT 'Unassigned',
  notes          TEXT,
  follow_up_date TEXT,
  created_at     TEXT DEFAULT (datetime('now'))
);

-- Speed up the common filters
CREATE INDEX IF NOT EXISTS idx_leads_status  ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);
