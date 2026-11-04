import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { contractMarkdown, contractStamp, isContract, signedCopyMarkdown } from '../signature/contract.ts';
import { isComplete } from '../signature/markers.ts';

/** Make a contract (a private card of the user) from a template card; returns the contract's id, or null when it could not be made. */
export async function createContract(supabase: SupabaseClient, userId: string, templateId: string): Promise<string | null> {
    const { data: template } = await supabase
        .from('books')
        .select('id, title, author, cover_image, theme_color, markdown_content')
        .eq('id', templateId)
        .maybeSingle();
    if (!template) return null;
    const slug = `contract-${randomUUID()}`;
    const title = `${template.title} ${contractStamp(new Date())}`;
    const { data: contract, error } = await supabase
        .from('books')
        .insert({
            user_id: userId,
            slug,
            title,
            author: template.author || null,
            cover_image: template.cover_image || null,
            theme_color: template.theme_color || 'white',
            markdown_content: contractMarkdown(template.markdown_content, { id: slug, sourceId: template.id, title }),
            is_public: false,
            published_at: null
        })
        .select('id')
        .single();
    if (error || !contract) {
        console.error('[contract] could not create:', error);
        return null;
    }
    return contract.id as string;
}

/**
 * When every slot of a contract is signed, each other person who signed it gets the signed contract as a private copy on their shelf.
 * One copy per signer (the slug is fixed), so running it again does nothing. Failures are logged only: signing never fails because of this.
 */
export async function copySignedContractToSigners(admin: SupabaseClient, bookId: string, markdown: string): Promise<void> {
    try {
        if (!isContract(markdown) || !isComplete(markdown)) return;
        const { data: book } = await admin.from('books').select('id, user_id, title, author, cover_image, theme_color').eq('id', bookId).maybeSingle();
        if (!book) return;
        const { data: signatures, error } = await admin.from('markdown_signatures').select('signer_id').eq('book_id', bookId).not('signer_id', 'is', null);
        if (error) throw error;
        const signers = [...new Set((signatures ?? []).map((row) => row.signer_id as string))].filter((id) => id !== book.user_id);
        for (const signerId of signers) {
            const slug = `signed-${bookId}-${signerId}`;
            const { data: existing } = await admin.from('books').select('id').eq('slug', slug).maybeSingle();
            if (existing) continue;
            const { error: insertError } = await admin.from('books').insert({
                user_id: signerId,
                slug,
                title: book.title,
                author: book.author || null,
                cover_image: book.cover_image || null,
                theme_color: book.theme_color || 'white',
                markdown_content: signedCopyMarkdown(markdown, slug),
                is_public: false,
                published_at: null
            });
            if (insertError) console.error('[contract] could not copy the signed contract:', insertError);
        }
    } catch (err) {
        console.error('[contract] could not copy the signed contract:', err);
    }
}
