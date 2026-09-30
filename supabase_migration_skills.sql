BEGIN;

CREATE TABLE IF NOT EXISTS public.skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (name ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(name) <= 64),
    description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 1024),
    body TEXT NOT NULL CHECK (char_length(body) <= 100000),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS public.skill_files (
    skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
    path TEXT NOT NULL CHECK (
        path ~ '^(references|assets)/[A-Za-z0-9_-][A-Za-z0-9._-]*(/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$'
        AND char_length(path) <= 200
    ),
    content TEXT NOT NULL CHECK (char_length(content) <= 200000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (skill_id, path)
);

ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_files ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.skills FROM anon;
REVOKE ALL ON public.skill_files FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.skills TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.skill_files TO authenticated;
GRANT ALL ON public.skills TO service_role;
GRANT ALL ON public.skill_files TO service_role;

DROP POLICY IF EXISTS "Owners manage their skills" ON public.skills;
CREATE POLICY "Owners manage their skills"
ON public.skills FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Owners manage their skill files" ON public.skill_files;
CREATE POLICY "Owners manage their skill files"
ON public.skill_files FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.skills WHERE skills.id = skill_files.skill_id AND skills.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.skills WHERE skills.id = skill_files.skill_id AND skills.user_id = auth.uid()));

COMMIT;
