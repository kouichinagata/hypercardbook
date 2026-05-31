<script lang="ts">
    import Book from '$lib/components/Book.svelte';
    import { marked } from 'marked';

    let { data } = $props();

    let isCard = $derived(data.markdown.includes('play_mode: card') || !/Page\s+\d+:/i.test(data.markdown));

    // Parse Card values
    let cardTitle = $derived.by(() => {
        const fmMatch = data.markdown.match(/^---\s*([\s\S]*?)\s*---/);
        if (fmMatch) {
            const fmLines = fmMatch[1].split('\n');
            for (let line of fmLines) {
                const parts = line.split(':');
                if (parts.length >= 2 && parts[0].trim() === 'title') {
                    return parts.slice(1).join(':').trim();
                }
            }
        }
        return 'Untitled Card';
    });

    let cardSubTitle = $derived.by(() => {
        const fmMatch = data.markdown.match(/^---\s*([\s\S]*?)\s*---/);
        if (fmMatch) {
            const fmLines = fmMatch[1].split('\n');
            for (let line of fmLines) {
                const parts = line.split(':');
                if (parts.length >= 2 && parts[0].trim() === 'sub_title') {
                    return parts.slice(1).join(':').trim();
                }
            }
        }
        return '';
    });

    let cardCoverImage = $derived.by(() => {
        const fmMatch = data.markdown.match(/^---\s*([\s\S]*?)\s*---/);
        if (fmMatch) {
            const fmLines = fmMatch[1].split('\n');
            for (let line of fmLines) {
                const parts = line.split(':');
                if (parts.length >= 2 && parts[0].trim() === 'cover_image') {
                    return normalizePath(parts.slice(1).join(':').trim());
                }
            }
        }
        return '';
    });

    let cardThemeColor = $derived.by(() => {
        const fmMatch = data.markdown.match(/^---\s*([\s\S]*?)\s*---/);
        if (fmMatch) {
            const fmLines = fmMatch[1].split('\n');
            for (let line of fmLines) {
                const parts = line.split(':');
                if (parts.length >= 2 && parts[0].trim() === 'theme_color') {
                    return parts.slice(1).join(':').trim();
                }
            }
        }
        return 'white';
    });

    let cardBodyHtml = $derived.by(() => {
        if (!data.markdown) return '';
        const cleanMd = data.markdown.replace(/^---\s*[\s\S]*?\s*---/, '').trim();
        const lines = cleanMd.split('\n');
        const processedLines = lines.map(line => {
            const trimmed = line.trim();
            const videoMatch = trimmed.match(/^video:\s*(.*)/);
            if (videoMatch) {
                const videoUrl = videoMatch[1].trim();
                return `<div class="video-container"><iframe src="${getEmbedUrl(videoUrl)}" allowfullscreen></iframe></div>`;
            }
            return line;
        });
        let html = marked.parse(processedLines.join('\n')) as string;
        html = html.replace(/src="books\//g, 'src="/books/');
        return html;
    });

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
</script>

{#if isCard}
    <div class="card-reader-container" data-theme-color={cardThemeColor} class:embed-mode={data.isEmbed}>
        {#if !data.isEmbed}
            <div class="reader-header-bar">
                <a class="back-btn" href={data.backUrl}>back</a>
            </div>
        {/if}
        <div class="card-webview-frame" data-theme-color={cardThemeColor} class:embed-mode={data.isEmbed}>
            <div class="card-webview-header">
                <h1 class="card-webview-title">{cardTitle}</h1>
                {#if cardCoverImage}
                    <div class="card-webview-cover-wrapper">
                        <img src={cardCoverImage} alt={cardTitle} />
                    </div>
                {/if}
                {#if cardSubTitle}
                    <p class="card-webview-subtitle">{cardSubTitle}</p>
                {/if}
            </div>
            <div class="card-webview-body markdown-body">
                {@html cardBodyHtml}
            </div>
        </div>
    </div>
{:else}
    <Book markdown={data.markdown} backUrl={data.backUrl} />
{/if}

<style>
    .card-reader-container {
        width: 100vw;
        height: 100vh;
        background-color: #0b0c10;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .card-reader-container[data-theme-color="white"] {
        background-color: #f4eae1;
    }
    .card-reader-container[data-theme-color="black"] {
        background-color: #0b0c10;
    }

    .reader-header-bar {
        height: 50px;
        display: flex;
        align-items: center;
        padding: 0 20px;
        background-color: rgba(0, 0, 0, 0.4);
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        z-index: 100;
    }

    .back-btn {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #ffffff;
        padding: 6px 14px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
        text-decoration: none;
        transition: all 0.2s;
        font-family: system-ui, sans-serif;
    }

    .back-btn:hover {
        background: rgba(255, 255, 255, 0.12);
        transform: scale(1.02);
    }

    /* Card WebView Preview Frame */
    .card-webview-frame {
        flex: 1;
        width: 100%;
        max-width: 600px;
        margin: 0 auto;
        padding: 40px 30px;
        box-sizing: border-box;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 24px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        font-family: system-ui, -apple-system, sans-serif;
    }

    .card-webview-frame[data-theme-color="white"] {
        background-color: #ffffff;
        color: #1a1a1a;
    }

    .card-webview-frame[data-theme-color="black"] {
        background-color: #161616;
        color: #ffffff;
    }

    .card-webview-frame[data-theme-color="blue"] {
        background: linear-gradient(135deg, #0f2b5c 0%, #1e3c72 100%);
        color: #ffffff;
    }

    .card-webview-frame[data-theme-color="pink"] {
        background: linear-gradient(135deg, #ffdeed 0%, #ffb3d1 100%);
        color: #4a4a4a;
    }

    .card-webview-frame[data-theme-color="gold"] {
        background: linear-gradient(135deg, #4e2f15 0%, #2e1605 100%);
        color: #ffd700;
    }

    .card-webview-header {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        text-align: center;
        border-bottom: 1px solid rgba(0, 0, 0, 0.08);
        padding-bottom: 24px;
    }

    .card-webview-frame[data-theme-color="black"] .card-webview-header,
    .card-webview-frame[data-theme-color="blue"] .card-webview-header,
    .card-webview-frame[data-theme-color="gold"] .card-webview-header {
        border-bottom-color: rgba(255, 255, 255, 0.1);
    }

    .card-webview-title {
        font-size: 28px;
        font-weight: 800;
        margin: 0;
        line-height: 1.3;
    }

    .card-webview-cover-wrapper {
        width: 100%;
        max-height: 300px;
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }

    .card-webview-cover-wrapper img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
    }

    .card-webview-subtitle {
        font-size: 16px;
        font-weight: 500;
        margin: 0;
        opacity: 0.85;
    }

    .card-webview-body {
        font-size: 15px;
        line-height: 1.7;
    }

    :global(.card-webview-body img) {
        max-width: 100%;
        border-radius: 8px;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.08);
        display: block;
        margin: 16px auto;
    }

    :global(.card-webview-body .video-container) {
        position: relative;
        padding-bottom: 56.25%;
        height: 0;
        overflow: hidden;
        border-radius: 8px;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
        margin: 16px 0;
    }

    :global(.card-webview-body .video-container iframe) {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        border: none;
    }

    .card-reader-container.embed-mode {
        background-color: transparent !important;
        height: auto;
        width: auto;
        overflow: visible;
        display: block;
    }
    
    .card-webview-frame.embed-mode {
        box-shadow: none;
        max-width: 100%;
        padding: 0;
        overflow: visible;
        margin: 0;
    }
</style>
