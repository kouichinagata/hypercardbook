import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { contractMarkdown, contractStamp } from '../signature/contract.ts';

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
