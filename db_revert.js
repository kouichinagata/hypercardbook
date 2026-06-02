import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
        env[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
});

const supabase = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    console.log('Reverting book f7c6b432-dda0-444d-a891-2bdbf6e0ddff slug to "world-of-hypercard"...');
    
    const { data: book, error: fetchError } = await supabase
        .from('books')
        .select('markdown_content')
        .eq('id', 'f7c6b432-dda0-444d-a891-2bdbf6e0ddff')
        .single();
        
    if (fetchError || !book) {
        console.error('Fetch error:', fetchError);
        return;
    }
    
    let updatedMarkdown = book.markdown_content || '';
    const fmMatch = updatedMarkdown.match(/^---\s*([\s\S]*?)\s*---/);
    if (fmMatch) {
        let fm = fmMatch[1];
        fm = fm.replace(/id:\s*hypercard/g, 'id: world-of-hypercard');
        updatedMarkdown = updatedMarkdown.replace(/^---\s*[\s\S]*?\s*---/, `---\n${fm}\n---`);
    }

    const { error: updateError } = await supabase
        .from('books')
        .update({ 
            slug: 'world-of-hypercard',
            markdown_content: updatedMarkdown
        })
        .eq('id', 'f7c6b432-dda0-444d-a891-2bdbf6e0ddff');

    if (updateError) {
        console.error('Failed to revert slug:', updateError);
    } else {
        console.log('Successfully reverted book slug back to "world-of-hypercard"');
    }
}
run();
