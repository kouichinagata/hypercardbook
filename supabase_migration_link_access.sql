-- "Anyone with the link": a document that is not listed (is_public = false) but can be opened by its UUID.
-- Apply this BEFORE deploying the code that selects link_access.
-- RLS is not changed: link-shared documents are read by the server with the service role key, by UUID only.
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS link_access boolean NOT NULL DEFAULT false;

-- Public already includes the link, so the two flags are never both true
ALTER TABLE public.books DROP CONSTRAINT IF EXISTS books_link_access_not_public;
ALTER TABLE public.books ADD CONSTRAINT books_link_access_not_public
    CHECK (NOT (COALESCE(is_public, false) AND link_access));
