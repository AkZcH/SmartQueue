CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT DEFAULT 'user',
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE jobs ADD COLUMN user_id UUID REFERENCES users(id);