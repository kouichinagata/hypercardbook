-- The originals of handwritten signatures ({{MarkdownAIverifyConfirm}} and {{MarkdownAIverify}} slots).
-- RLS is on with no policies: only the server (service role) can read or write this table.
create table if not exists markdown_signatures (
    id uuid primary key default gen_random_uuid(),
    book_id uuid not null,
    kind text not null check (kind in ('my', 'your', 'any')),
    signer_type text not null check (signer_type in ('owner', 'guest')),
    signer_id uuid,
    svg text not null,
    webp_url text not null,
    svg_sha256 text not null,
    webp_sha256 text not null,
    markdown_sha256 text not null,
    signed_at timestamptz not null default now()
);
create index if not exists markdown_signatures_book_idx on markdown_signatures (book_id);

alter table markdown_signatures enable row level security;

-- Seals (stamps) pressed through PapeRobo. A handwritten signature keeps the default 'sign'.
alter table markdown_signatures add column if not exists method text not null default 'sign' check (method in ('sign', 'stamp'));

-- The sign request links were removed: drop their table where it was created.
drop table if exists markdown_sign_links;

-- No signer name is taken: drop the column where it was created.
alter table markdown_signatures drop column if exists signer_name;
