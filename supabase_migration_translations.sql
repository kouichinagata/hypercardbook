-- 翻訳キャッシュテーブルの作成
CREATE TABLE IF NOT EXISTS book_translations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    language VARCHAR(10) NOT NULL, -- 例: 'en', 'ja', 'fr', 'es'
    title VARCHAR(255) NOT NULL,
    author VARCHAR(255) NOT NULL,
    markdown_content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (book_id, language)
);

-- 高速検索用のインデックス
CREATE INDEX IF NOT EXISTS idx_book_translations_lookup ON book_translations (book_id, language);

-- ==========================================
-- 行レベルセキュリティ (RLS) の有効化とポリシー
-- ==========================================
ALTER TABLE book_translations ENABLE ROW LEVEL SECURITY;

-- 1. 誰でも（ログインしていないゲストを含む）翻訳データを参照（SELECT）可能にする
-- （公開されている本の翻訳を表示するため）
DROP POLICY IF EXISTS "Allow public read access to book_translations" ON book_translations;
CREATE POLICY "Allow public read access to book_translations" 
ON book_translations 
FOR SELECT 
USING (true);

-- 2. ログイン済みのユーザーのみ翻訳データを新規作成（INSERT）可能にする
DROP POLICY IF EXISTS "Allow authenticated users to insert book_translations" ON book_translations;
CREATE POLICY "Allow authenticated users to insert book_translations" 
ON book_translations 
FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

-- ==========================================
-- 本の更新時に自動でキャッシュを削除するトリガー
-- ==========================================
CREATE OR REPLACE FUNCTION clear_book_translations_on_update()
RETURNS TRIGGER AS $$
BEGIN
    -- markdown_contentが変更された場合のみ翻訳キャッシュを削除
    IF (OLD.markdown_content IS DISTINCT FROM NEW.markdown_content) THEN
        DELETE FROM book_translations WHERE book_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- トリガーの作成（古いトリガーがあれば削除して再作成）
DROP TRIGGER IF EXISTS trigger_clear_book_translations ON books;
CREATE TRIGGER trigger_clear_book_translations
AFTER UPDATE ON books
FOR EACH ROW
EXECUTE FUNCTION clear_book_translations_on_update();
