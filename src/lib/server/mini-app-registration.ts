import type { SupabaseClient } from '@supabase/supabase-js';
import { MAX_MINI_APPS, validMiniAppRef } from '../mini-app.ts';
import { parseBookFrontmatter } from '../book-frontmatter.ts';
import { isMiniApp } from '../play-mode.ts';
import { isBookUuid, servesUnlistedMiniApp } from '../unlisted-mini-app.ts';

export type MiniAppBook = {
    id: string; slug: string | null; title: string | null; user_id: string | null;
    is_public: boolean | null; is_quark_choice: boolean | null; markdown_content: string | null;
};

// Shared by the shelf selection and URL registration. Only the URL flow accepts unlisted UUID links.
export function miniAppRegistrationError(book: MiniAppBook | null, ref: string, userId: string, byUrl = false): string | undefined {
    const mode = parseBookFrontmatter(book?.markdown_content || '').playMode;
    if (!book || !isMiniApp(mode)) return `MiniApp not found: ${ref}`;
    if (book.user_id !== userId && !book.is_public && !book.is_quark_choice && !(byUrl && servesUnlistedMiniApp(ref, mode))) {
        return `MiniApp is not available: ${ref}`;
    }
}

export function miniAppRegistrationRow(userId: string, ref: string, book: MiniAppBook, position: number) {
    return { user_id: userId, ref, title: book.title || '', position };
}

// Append only: never replace or delete existing entries. Use UUIDs to deduplicate URL aliases.
export async function addMiniAppByRef(supabase: SupabaseClient, userId: string, ref: unknown): Promise<{ status: number; error?: string }> {
    if (!validMiniAppRef(ref)) return { status: 400, error: 'Missing or invalid ref.' };
    const { data: book, error: bookError } = await supabase.from('books')
        .select('id, slug, title, user_id, is_public, is_quark_choice, markdown_content')
        .eq(isBookUuid(ref) ? 'id' : 'slug', ref).maybeSingle();
    if (bookError) return { status: 500, error: bookError.message };
    const invalid = miniAppRegistrationError(book, ref, userId, true);
    if (invalid || !book) return { status: 400, error: invalid || 'MiniApp not found.' };

    const { data: rows, error: listError } = await supabase.from('mini_apps')
        .select('ref, position').eq('user_id', userId);
    if (listError) return { status: 500, error: listError.message };
    const entries = rows || [];
    if (entries.some(row => row.ref === book.id || row.ref === book.slug)) return { status: 200 };
    if (entries.length >= MAX_MINI_APPS) return { status: 400, error: `You can add up to ${MAX_MINI_APPS} MiniApps.` };
    const position = entries.reduce((max, row) => Math.max(max, row.position), -1) + 1;
    const { error: insertError } = await supabase.from('mini_apps').upsert(
        miniAppRegistrationRow(userId, book.id, book, position),
        { onConflict: 'user_id,ref', ignoreDuplicates: true }
    );
    if (insertError) return { status: 500, error: insertError.message };
    return { status: 200 };
}
