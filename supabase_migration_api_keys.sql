-- API keys for the HyperBook DB HTTP Request API (/hyperbook/{id}/db?action=…).
-- One key per user. Only its SHA-256 is kept; the key itself is shown once when it is issued.
-- RLS is on with no policy: only the server (service role key) reads or writes this table.
CREATE TABLE IF NOT EXISTS public.api_keys (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    key_hash text NOT NULL UNIQUE,
    key_prefix text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz
);
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
