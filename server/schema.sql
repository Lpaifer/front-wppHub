CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bitrix_conversations (
  id BIGSERIAL PRIMARY KEY,
  bitrix_portal TEXT NOT NULL,
  bitrix_deal_id TEXT NOT NULL,
  bitrix_contact_id TEXT NOT NULL,
  conversation_id TEXT,
  phone TEXT NOT NULL,
  channel TEXT NOT NULL,
  account_id TEXT NOT NULL,
  created_by BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bitrix_portal, bitrix_deal_id)
);

CREATE INDEX IF NOT EXISTS bitrix_conversations_phone_idx ON bitrix_conversations(phone);
