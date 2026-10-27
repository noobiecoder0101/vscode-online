-- 002_claims_and_listing_status.sql

-- communities: new columns
ALTER TABLE communities
  ADD COLUMN external_id TEXT,
  ADD COLUMN claim_code TEXT,
  ADD COLUMN claim_code_expires_at TIMESTAMPTZ,
  ADD COLUMN claim_requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN review_note TEXT,
  ADD COLUMN reviewed_at TIMESTAMPTZ,
  ADD COLUMN canonical_link TEXT,
  ADD COLUMN is_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN last_verified_at TIMESTAMPTZ,
  ADD COLUMN report_count INTEGER NOT NULL DEFAULT 0;

-- Add status with DEFAULT 'approved' so existing rows get approved
ALTER TABLE communities
  ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'
  CHECK (status IN ('pending','approved','rejected'));

-- Change default to 'pending' for new rows
ALTER TABLE communities ALTER COLUMN status SET DEFAULT 'pending';

-- Backfill canonical_link for existing rows using invite_link
UPDATE communities
SET canonical_link = invite_link
WHERE canonical_link IS NULL AND invite_link IS NOT NULL;

-- Partial unique indexes
CREATE UNIQUE INDEX communities_platform_external_id_uidx
  ON communities(platform, external_id)
  WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX communities_canonical_link_uidx
  ON communities(canonical_link)
  WHERE canonical_link IS NOT NULL;

-- users: add role
ALTER TABLE users
  ADD COLUMN role TEXT NOT NULL DEFAULT 'user'
  CHECK (role IN ('user','staff','admin'));
