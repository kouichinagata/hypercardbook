-- Sealed originals of completed documents ({{MarkdownAIVerify}} slots all signed), for later verification.
-- Insert-only: UPDATE, DELETE and TRUNCATE are rejected by triggers, even for the service role.
-- RLS is on with no policies: only the server (service role) can read or insert.
create table if not exists markdown_verify (
    verify_id uuid primary key,
    book_id uuid not null,
    markdown text not null,
    signatures jsonb not null,
    completed_at timestamptz not null,
    sha256 text not null,
    complete_key text not null unique,
    created_at timestamptz not null default now()
);
create index if not exists markdown_verify_book_idx on markdown_verify (book_id);

create or replace function markdown_verify_reject_change() returns trigger
language plpgsql as $$
begin
    raise exception 'markdown_verify is insert-only';
end;
$$;

drop trigger if exists markdown_verify_no_update_delete on markdown_verify;
create trigger markdown_verify_no_update_delete
    before update or delete on markdown_verify
    for each row execute function markdown_verify_reject_change();

drop trigger if exists markdown_verify_no_truncate on markdown_verify;
create trigger markdown_verify_no_truncate
    before truncate on markdown_verify
    for each statement execute function markdown_verify_reject_change();

alter table markdown_verify enable row level security;
revoke all on markdown_verify from anon, authenticated;
revoke update, delete, truncate on markdown_verify from service_role;
grant select, insert on markdown_verify to service_role;
