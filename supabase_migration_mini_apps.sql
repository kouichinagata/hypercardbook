-- PapeRoboのミニアプリ一覧（HyperCardBookの本棚で選んだ MiniApp）
CREATE TABLE IF NOT EXISTS public.mini_apps (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    ref text NOT NULL,          -- books.id (uuid) または books.slug
    title text NOT NULL DEFAULT '',
    cover_image text,
    position integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, ref)
);

ALTER TABLE public.mini_apps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mini_apps_select_own" ON public.mini_apps FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "mini_apps_insert_own" ON public.mini_apps FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "mini_apps_update_own" ON public.mini_apps FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "mini_apps_delete_own" ON public.mini_apps FOR DELETE USING (auth.uid() = user_id);
