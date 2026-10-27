-- 004_reviews_and_reports.sql

CREATE TABLE claim_reviews (
  id SERIAL PRIMARY KEY,
  community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX claim_reviews_pending_uidx
  ON claim_reviews(community_id, requested_by)
  WHERE status = 'pending';

CREATE TABLE verification_logs (
  id SERIAL PRIMARY KEY,
  community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT
);

CREATE TABLE reports (
  id SERIAL PRIMARY KEY,
  community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  reported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
