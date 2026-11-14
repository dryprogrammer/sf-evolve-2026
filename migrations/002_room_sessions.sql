-- Revocable demo room sessions. Raw credentials are never persisted; only a
-- SHA-256 hash. Demo sessions are isolation, not authentication of a person.
CREATE TABLE IF NOT EXISTS room_sessions (
  session_id text PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  participant_id text NOT NULL CHECK (participant_id IN ('maya', 'alex', 'river')),
  project_id text NOT NULL,
  identity_mode text NOT NULL DEFAULT 'demo' CHECK (identity_mode IN ('demo', 'authenticated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS room_sessions_project ON room_sessions (project_id);
