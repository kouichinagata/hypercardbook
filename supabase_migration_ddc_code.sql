BEGIN;

ALTER TABLE public.books
    ADD COLUMN IF NOT EXISTS ddc_code TEXT;

CREATE INDEX IF NOT EXISTS idx_books_ddc_code ON public.books(ddc_code);

COMMIT;
