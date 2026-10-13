BEGIN;

-- 部分置換編集（edit_card / edit_book）の競合検出用のバージョン番号。
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- 本文が変わる書き込み（/api/save の自動保存を含むすべて）でバージョンを +1 する。
CREATE OR REPLACE FUNCTION public.bump_books_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.markdown_content IS DISTINCT FROM OLD.markdown_content THEN
        NEW.version := OLD.version + 1;
    ELSE
        NEW.version := OLD.version;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS books_bump_version ON public.books;
CREATE TRIGGER books_bump_version
    BEFORE UPDATE ON public.books
    FOR EACH ROW
    EXECUTE FUNCTION public.bump_books_version();

COMMIT;
