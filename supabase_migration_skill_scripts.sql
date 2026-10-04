-- Skill の scripts/*.py|*.js を skill_files に保存できるようにする（Vercel Sandbox で実行）。
-- skill_files.path の CHECK 制約を、references/・assets/ に加えて scripts/ を許可するものに置き換える。
BEGIN;

ALTER TABLE public.skill_files DROP CONSTRAINT IF EXISTS skill_files_path_check;

ALTER TABLE public.skill_files ADD CONSTRAINT skill_files_path_check CHECK (
    char_length(path) <= 200
    AND (
        path ~ '^(references|assets)(/[A-Za-z0-9_-][A-Za-z0-9._-]*)+$'
        OR path ~ '^scripts(/[A-Za-z0-9_-][A-Za-z0-9._-]*)*/[A-Za-z0-9_-][A-Za-z0-9_-]*\.(py|js)$'
    )
);

COMMIT;
