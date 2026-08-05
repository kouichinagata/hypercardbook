BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_live_books (
    book_id UUID PRIMARY KEY REFERENCES public.books(id) ON DELETE CASCADE,
    root_book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
    branch_root_book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
    parent_book_id UUID REFERENCES public.books(id) ON DELETE SET NULL,
    owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    canonical_author TEXT NOT NULL,
    prompt TEXT NOT NULL,
    generation_count INTEGER NOT NULL DEFAULT 1 CHECK (generation_count >= 1),
    ancestry JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (branch_root_book_id, owner_user_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_live_books_root ON public.ai_live_books(root_book_id);
CREATE INDEX IF NOT EXISTS idx_ai_live_books_parent ON public.ai_live_books(parent_book_id);

CREATE TABLE IF NOT EXISTS public.ai_live_book_open_events (
    open_token UUID NOT NULL,
    reader_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source_book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
    result_book_id UUID REFERENCES public.books(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    PRIMARY KEY (open_token, reader_user_id)
);

ALTER TABLE public.ai_live_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_live_book_open_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ai_live_books FROM anon;
REVOKE ALL ON public.ai_live_book_open_events FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_live_books TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_live_book_open_events TO authenticated;
GRANT ALL ON public.ai_live_books TO service_role;
GRANT ALL ON public.ai_live_book_open_events TO service_role;

DROP POLICY IF EXISTS "Authenticated users can read AI Live metadata" ON public.ai_live_books;
CREATE POLICY "Authenticated users can read AI Live metadata"
ON public.ai_live_books FOR SELECT TO authenticated
USING (
    owner_user_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.books
        WHERE books.id = ai_live_books.book_id AND books.is_public = TRUE
    )
);

DROP POLICY IF EXISTS "Owners can insert AI Live metadata" ON public.ai_live_books;
CREATE POLICY "Owners can insert AI Live metadata"
ON public.ai_live_books FOR INSERT TO authenticated
WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "Owners can update AI Live metadata" ON public.ai_live_books;
CREATE POLICY "Owners can update AI Live metadata"
ON public.ai_live_books FOR UPDATE TO authenticated
USING (owner_user_id = auth.uid())
WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "Readers manage their AI Live open events" ON public.ai_live_book_open_events;
CREATE POLICY "Readers manage their AI Live open events"
ON public.ai_live_book_open_events FOR ALL TO authenticated
USING (reader_user_id = auth.uid())
WITH CHECK (reader_user_id = auth.uid());

COMMIT;
