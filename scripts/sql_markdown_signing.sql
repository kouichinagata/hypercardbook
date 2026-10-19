-- Sign request links and the originals of handwritten signatures ({{MarkdownAIVerify}} slots).
-- RLS is on with no policies: only the server (service role) can read or write these tables.
create table if not exists markdown_sign_links (
    token_hash text primary key,
    book_id uuid not null,
    created_by uuid not null,
    expires_at timestamptz not null,
    revoked_at timestamptz,
    created_at timestamptz not null default now()
);
create index if not exists markdown_sign_links_book_idx on markdown_sign_links (book_id);

create table if not exists markdown_signatures (
    id uuid primary key default gen_random_uuid(),
    book_id uuid not null,
    kind text not null check (kind in ('my', 'your', 'any')),
    signer_type text not null check (signer_type in ('owner', 'guest')),
    signer_id uuid,
    signer_name text,
    svg text not null,
    webp_url text not null,
    svg_sha256 text not null,
    webp_sha256 text not null,
    markdown_sha256 text not null,
    signed_at timestamptz not null default now()
);
create index if not exists markdown_signatures_book_idx on markdown_signatures (book_id);

alter table markdown_sign_links enable row level security;
alter table markdown_signatures enable row level security;
