import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { marked } from 'marked';

export const POST: RequestHandler = async ({ request, locals }) => {
    try {
        const { markdown, id } = await request.json();
        const supabase = locals.supabase;
        const session = locals.session;
        
        if (!markdown) {
            return json({ error: 'No markdown content provided.' }, { status: 400 });
        }

        // Parse frontmatter
        let slug = id || `card-${Date.now()}`;
        let cardTitle = '無題のカード';
        let cardSubTitle = '';
        let cardCoverImage = '';
        let cardThemeColor = 'white';
        let playMode = 'card';

        const fmMatch = markdown.match(/^---\s*([\s\S]*?)\s*---/);
        if (fmMatch) {
            const fmLines = fmMatch[1].split('\n');
            fmLines.forEach((line: string) => {
                const parts = line.split(':');
                if (parts.length >= 2) {
                    const k = parts[0].trim();
                    const v = parts.slice(1).join(':').trim();
                    if (k === 'id') slug = v.replace(/[^a-zA-Z0-9_\-]/g, '');
                    if (k === 'title') cardTitle = v;
                    if (k === 'sub_title') cardSubTitle = v;
                    if (k === 'cover_image') cardCoverImage = v;
                    if (k === 'theme_color') cardThemeColor = v;
                    if (k === 'play_mode') playMode = v;
                }
            });
        }

        const origin = new URL(request.url).origin;
        let standaloneHtml = '';

        if (playMode === 'book') {
            // Generate HyperBook HTML template using shared CDN assets
            standaloneHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${cardTitle}</title>
    <link rel="stylesheet" href="${origin}/css/book-viewer.css">
</head>
<body>
    <div id="hyperbook-viewer"></div>
    <script type="text/markdown" id="book-markdown">
${markdown}
    </script>
    
    <!-- Marked and Mermaid load -->
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
    <script src="${origin}/js/book-viewer.js"></script>
</body>
</html>`;
        } else {
            // Extract style blocks
            const styleRegex = /<style>([\s\S]*?)<\/style>/gi;
            let styleMatch;
            let userStyles = '';
            while ((styleMatch = styleRegex.exec(markdown)) !== null) {
                userStyles += styleMatch[1] + '\n';
            }

            // Extract script blocks
            const scriptRegex = /<script>([\s\S]*?)<\/script>/gi;
            let scriptMatch;
            let userScripts = '';
            while ((scriptMatch = scriptRegex.exec(markdown)) !== null) {
                userScripts += scriptMatch[1] + '\n';
            }

            // Strip style/script tags from markdown body to avoid parsing them as code blocks
            let cleanMd = markdown.replace(/^---\s*([\s\S]*?)\s*---/, '').trim();
            cleanMd = cleanMd.replace(/<style>[\s\S]*?<\/style>/gi, '');
            cleanMd = cleanMd.replace(/<script>[\s\S]*?<\/script>/gi, '');

            // Normalize paths & process videos/images
            const lines = cleanMd.split('\n');
            let processed = cleanMd.split('\n').map((line: string) => {
                const trimmed = line.trim();
                const videoMatch = trimmed.match(/^video:\s*(.*)/);
                if (videoMatch) {
                    const videoUrl = videoMatch[1].trim();
                    return `<div class="video-container"><iframe src="${getEmbedUrl(videoUrl)}" allowfullscreen></iframe></div>`;
                }
                return line;
            }).join('\n');

            processed = processed.replace(/\n{2,}/g, (match) => '<br>'.repeat(match.length - 1) + '\n');

            // Setup custom renderer for exported HTML to support mermaid and breaks
            const renderer = new marked.Renderer();
            (renderer as any).code = function(code: any, lang: any) {
                let codeText = typeof code === 'object' ? code.text : code;
                let codeLang = typeof code === 'object' ? code.lang : lang;
                if (codeLang === 'mermaid') {
                    return `<div class="mermaid">${codeText}</div>`;
                }
                return `<pre><code>${codeText}</code></pre>`;
            };
            
            let bodyHtml = marked.parse(processed, { renderer, breaks: true }) as string;
            bodyHtml = bodyHtml.replace(/src="books\//g, 'src="/books/');

            // Assemble standalone HTML template
            standaloneHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${cardTitle}</title>
    <style>
        ${userStyles}
    </style>
</head>
<body>
    ${bodyHtml}
    
    <script>
        ${userScripts}
    </script>
</body>
</html>`;
        }

        // Upload HTML to Supabase Storage
        const userId = session?.user?.id || 'guest';
        const storagePath = `${userId}/published/${slug}.html`;

        const { error: uploadError } = await supabase.storage
            .from('HyperCardBookBucket')
            .upload(storagePath, Buffer.from(standaloneHtml, 'utf-8'), {
                contentType: 'text/html',
                upsert: true
            });

        if (uploadError) {
            console.error('Storage upload error:', uploadError);
            return json({ error: uploadError.message }, { status: 500 });
        }

        // Return SvelteKit proxy URL instead of raw Supabase Storage URL
        const previewUrl = `/published/${userId}/${slug}.html`;
        return json({ url: previewUrl });
    } catch (err: any) {
        console.error('Export HTML Error:', err);
        return json({ error: err.message || 'Failed to export HTML.' }, { status: 500 });
    }
};

function normalizePath(url: string): string {
    if (!url) return '';
    const trimmed = url.trim();
    if (trimmed.startsWith('books/') && !trimmed.startsWith('/')) {
        return '/' + trimmed;
    }
    return trimmed;
}

function getEmbedUrl(url: string): string {
    if (!url) return '';
    if (url.includes('tiktok.com')) {
        const parts = url.split('/');
        const videoId = parts[parts.length - 1].split('?')[0];
        return `https://www.tiktok.com/embed/v2/${videoId}`;
    }
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        let videoId = '';
        if (url.includes('/shorts/')) {
            videoId = url.split('/shorts/')[1].split('?')[0];
        } else if (url.includes('v=')) {
            videoId = url.split('v=')[1].split('&')[0];
        } else if (url.includes('youtu.be/')) {
            videoId = url.split('youtu.be/')[1].split('?')[0];
        }
        return `https://www.youtube.com/embed/${videoId}`;
    }
    if (url.includes('instagram.com/reel/') || url.includes('instagram.com/p/')) {
        const keyword = url.includes('/reel/') ? '/reel/' : '/p/';
        const parts = url.split(keyword);
        const postId = parts[1].split('/')[0].split('?')[0];
        return `https://www.instagram.com/${keyword === '/reel/' ? 'reel' : 'p'}/${postId}/embed`;
    }
    return url;
}
