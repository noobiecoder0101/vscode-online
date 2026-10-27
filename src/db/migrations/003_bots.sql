-- 003_bots.sql

CREATE TABLE bots (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('telegram'))
);

CREATE TABLE bot_installs (
  id SERIAL PRIMARY KEY,
  bot_id INTEGER NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  external_chat_id TEXT NOT NULL,
  installed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  config JSONB NOT NULL DEFAULT '{"greeting_template":"Welcome {user} to {group_name}! Please read {rules}"}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(community_id, bot_id)
);

CREATE INDEX bot_installs_external_chat_id_active_idx
  ON bot_installs(external_chat_id)
  WHERE is_active = true;

INSERT INTO bots (slug, name, platform)
VALUES ('welcome', 'ONINNA Welcome Bot', 'telegram')
ON CONFLICT (slug) DO NOTHING;
