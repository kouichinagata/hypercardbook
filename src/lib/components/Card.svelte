<svelte:head>
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
</svelte:head>

<script lang="ts">
    import { marked } from 'marked';
    import { onDestroy, onMount } from 'svelte';
    import { browser } from '$app/environment';

    let {
        markdown = '',
        id = '',
        showNewTab = true,
        isEmbed = false,
        backUrl = '/',
        activePluginIds = [],
        currentUserId = 'global'
    } = $props();

    // Iframe postMessage connection states
    let iframeSource: MessageEventSource | null = null;
    let iframeOrigin = '';

    // iframe や直接アクセス時は非表示にするための判定
    let showBackBtn = $derived(
        browser && 
        backUrl && 
        (window.self === window.top) && 
        (window.history.length > 1) && 
        document.referrer !== ''
    );

    // Extract frontmatter-free raw markdown text
    let cleanMarkdownText = $derived.by(() => {
        if (!markdown) return '';
        return markdown.replace(/^---\s*[\s\S]*?\s*---/, '').trim();
    });

    let pluginStyles = $state('');

    let cardLocalStyles = $derived.by(() => {
        if (!markdown) return '';
        const styleRegex = /<style>([\s\S]*?)<\/style>/gi;
        let match;
        let styles = '';
        while ((match = styleRegex.exec(markdown)) !== null) {
            styles += match[1] + '\n';
        }
        return styles;
    });

    let cardUserStyles = $derived(cardLocalStyles + '\n' + pluginStyles);

    $effect(() => {
        const ids = activePluginIds || [];
        const uId = currentUserId || 'global';
        const myPlugins = ids.filter((pId: string) => pId.startsWith('my-plugin-'));
        console.log('[Card.svelte Plugin CSS] activePluginIds:', ids, 'currentUserId:', uId, 'filtered myPlugins:', myPlugins);
        if (myPlugins.length > 0) {
            const url = `/api/skills/css?userId=${encodeURIComponent(uId)}&pluginIds=${encodeURIComponent(myPlugins.join(','))}`;
            console.log('[Card.svelte Plugin CSS] Fetching URL:', url);
            fetch(url)
                .then(res => {
                    console.log('[Card.svelte Plugin CSS] Fetch response status:', res.status);
                    if (res.ok) return res.json();
                    throw new Error(`Failed to fetch plugin CSS, status: ${res.status}`);
                })
                .then(data => {
                    console.log('[Card.svelte Plugin CSS] Received CSS length:', (data.css || '').length);
                    pluginStyles = data.css || '';
                })
                .catch(err => {
                    console.error('[Card.svelte Plugin CSS] Fetch error:', err);
                    pluginStyles = '';
                });
        } else {
            console.log('[Card.svelte Plugin CSS] No custom plugins to fetch.');
            pluginStyles = '';
        }
    });

    $effect(() => {
        if (!browser) return;
        let styleEl = document.getElementById('card-dynamic-styles');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'card-dynamic-styles';
            document.head.appendChild(styleEl);
        }
        styleEl.textContent = cardUserStyles;
        console.log('[Card.svelte style element] Applied styles to #card-dynamic-styles, length:', cardUserStyles.length);
        
        return () => {
            const el = document.getElementById('card-dynamic-styles');
            if (el) el.remove();
        };
    });

    onMount(() => {
        if (!browser) return;

        if ((window as any).mermaid) {
            (window as any).mermaid.initialize({
                startOnLoad: false,
                theme: cardThemeColor === 'black' ? 'dark' : 'default',
            });
        }

        const handleMessage = (event: MessageEvent) => {
            if (!event.data || typeof event.data !== 'object') return;

            const { type, payload } = event.data;

            if (type === 'PAPE_READY') {
                console.log('[HyperCard] Received PAPE_READY from iframe');
                iframeSource = event.source;
                iframeOrigin = event.origin;

                // Send HCB_INIT_BOOK to iframe (treating this card as a single-page book)
                if (iframeSource) {
                    (iframeSource as any).postMessage({
                        type: 'HCB_INIT_BOOK',
                        payload: {
                            title: cardTitle,
                            totalPages: 1,
                            pages: [cleanMarkdownText],
                            currentPageIndex: 0
                        }
                    }, iframeOrigin);
                    console.log(`[HyperCard] Sent HCB_INIT_BOOK to iframe as a single-page card`);
                }
            }
        };

        window.addEventListener('message', handleMessage);
        
        return () => {
            window.removeEventListener('message', handleMessage);
        };
    });

    // Text to Speech states & methods
    let isSpeaking = $state(false);

    function handleToggleSpeak() {
        if (!browser || !window.speechSynthesis) return;
        
        if (isSpeaking) {
            window.speechSynthesis.cancel();
            isSpeaking = false;
            return;
        }
        
        let textToSpeak = `Title: ${cardTitle}\n`;
        if (cardSubTitle) textToSpeak += `${cardSubTitle}\n`;
        
        const bodyText = cardBodyHtml.replace(/<[^>]*>/g, '').trim();
        textToSpeak += bodyText;
        
        if (!textToSpeak.trim()) return;
        speak(textToSpeak);
    }

    function speak(text: string) {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        
        isSpeaking = true;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ja-JP';
        utterance.onend = () => {
            isSpeaking = false;
        };
        utterance.onerror = () => {
            isSpeaking = false;
        };
        
        window.speechSynthesis.speak(utterance);
    }

    onDestroy(() => {
        if (browser && window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
    });

    $effect(() => {
        // Cancel speaking if markdown changes
        if (markdown && browser && window.speechSynthesis && isSpeaking) {
            window.speechSynthesis.cancel();
            isSpeaking = false;
        }
    });

    // Parse Card values
    let cardTitle = $derived.by(() => {
        const fmMatch = markdown.match(/^---\s*([\s\S]*?)\s*---/);
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

    let cardSlug = $derived.by(() => {
        const fmMatch = markdown.match(/^---\s*([\s\S]*?)\s*---/);
        if (fmMatch) {
            const fmLines = fmMatch[1].split('\n');
            for (let line of fmLines) {
                const parts = line.split(':');
                if (parts.length >= 2 && parts[0].trim() === 'id') {
                    return parts.slice(1).join(':').trim().replace(/[^a-zA-Z0-9_\-]/g, '');
                }
            }
        }
        return '';
    });

    let cardSubTitle = $derived.by(() => {
        const fmMatch = markdown.match(/^---\s*([\s\S]*?)\s*---/);
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
        const fmMatch = markdown.match(/^---\s*([\s\S]*?)\s*---/);
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
        const fmMatch = markdown.match(/^---\s*([\s\S]*?)\s*---/);
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
        if (!markdown) return '';
        let cleanMd = markdown.replace(/^---\s*[\s\S]*?\s*---/, '').trim();
        cleanMd = cleanMd.replace(/<style>[\s\S]*?<\/style>/gi, '');

        let processed = cleanMd.split('\n').map(line => {
            const trimmed = line.trim();
            const videoMatch = trimmed.match(/^video:\s*(.*)/);
            if (videoMatch) {
                const videoUrl = videoMatch[1].trim();
                return `<div class="video-container"><iframe src="${getEmbedUrl(videoUrl)}" allowfullscreen></iframe></div>`;
            }
            return line;
        }).join('\n');

        processed = processed.replace(/(\n{2,})/g, (match, p1, offset, string) => {
            const before = string.substring(0, offset).trimEnd();
            const after = string.substring(offset + match.length).trimStart();
            if (before.endsWith('>') || after.startsWith('<') || after === '') {
                return match;
            }
            return '<br>'.repeat(match.length - 1) + '\n';
        });
        
        // Setup custom renderer for card mermaid support
        const renderer = new marked.Renderer();
        (renderer as any).code = function(code: any, lang: any) {
            let codeText = typeof code === 'object' ? code.text : code;
            let codeLang = typeof code === 'object' ? code.lang : lang;
            if (codeLang === 'mermaid') {
                return `<div class="mermaid">${codeText}</div>`;
            }
            return `<pre><code>${codeText}</code></pre>`;
        };

        let html = marked.parse(processed, { renderer, breaks: true }) as string;
        html = html.replace(/src="books\//g, 'src="/books/');
        return html;
    });

    // Trigger mermaid rendering when card content updates
    $effect(() => {
        const _trigger = cardBodyHtml;
        import('svelte').then(({ tick }) => {
            tick().then(() => {
                if (browser && (window as any).mermaid) {
                    try {
                        const mermaidDivs = document.querySelectorAll('.mermaid');
                        if (mermaidDivs.length > 0) {
                            (window as any).mermaid.init(undefined, mermaidDivs);
                        }
                    } catch (e) {
                        console.error("Card Mermaid render error:", e);
                    }
                }
            });
        });
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


    let hasPublishedHtml = $state(false);

    $effect(() => {
        if (!browser) return;
        const targetSlug = cardSlug || id;
        if (targetSlug && currentUserId) {
            const publishedUrl = `/published/${currentUserId}/${targetSlug}.html`;
            fetch(publishedUrl)
                .then(res => {
                    if (res.ok) {
                        hasPublishedHtml = true;
                    }
                })
                .catch(err => {
                    console.error('Failed to check published HTML:', err);
                });
        }
    });

    function handleOpenPublishedHtml() {
        const targetSlug = cardSlug || id;
        if (targetSlug && currentUserId) {
            const publishedUrl = `/published/${currentUserId}/${targetSlug}.html`;
            window.open(publishedUrl, '_blank');
        }
    }
</script>

<div class="card-reader-container" data-theme-color={['white', 'black', 'blue', 'pink', 'gold'].includes(cardThemeColor) ? cardThemeColor : 'white'} class:embed-mode={isEmbed}>
    {#if !isEmbed && showBackBtn}
        <div class="reader-header-bar">
            <a class="back-btn" href={backUrl} onclick={(e) => { if (window.history.length === 1 || window.opener) { e.preventDefault(); window.close(); } }}>back</a>
        </div>
    {/if}

    <div class="card-webview-frame-wrapper" class:embed-mode={isEmbed}>
        {#if !isEmbed || activePluginIds.includes('reading-aloud')}
        <div class="card-action-container" class:embed-mode={isEmbed}>
            {#if activePluginIds.includes('reading-aloud')}
                <button class="card-action-btn" onclick={handleToggleSpeak} title="Read Aloud">
                    {isSpeaking ? '⏸️' : '🔊'}
                </button>
            {/if}
            {#if !isEmbed}
                {#if hasPublishedHtml}
                    <button class="card-action-btn" onclick={handleOpenPublishedHtml} title="Show Published HTML">
                        🌏
                    </button>
                {/if}
            {/if}
        </div>
        {/if}

        <div class="card-webview-frame" data-theme-color={['white', 'black', 'blue', 'pink', 'gold'].includes(cardThemeColor) ? cardThemeColor : 'white'} style={!['white', 'black', 'blue', 'pink', 'gold'].includes(cardThemeColor) ? `background-color: ${cardThemeColor};` : ''} class:embed-mode={isEmbed}>
            <div class="card-webview-header">
                <h1 class="card-webview-title">{cardTitle}</h1>
                {#if cardCoverImage}
                    <div class="card-webview-cover-wrapper">
                        <img src={cardCoverImage} alt={cardTitle} class="clicked-img-cover" />
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
</div>

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

    .card-webview-frame-wrapper {
        flex: 1;
        width: 100%;
        display: flex;
        flex-direction: column;
        position: relative;
        overflow-y: auto;
        padding: 0;
        box-sizing: border-box;
    }

    /* Card Action Buttons (Floating Panel) */
    .card-action-container {
        position: absolute;
        top: 20px;
        right: 40px;
        z-index: 100;
        display: flex;
        gap: 8px;
    }

    .card-action-btn {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: 1px solid rgba(255, 255, 255, 0.15);
        background: rgba(255, 255, 255, 0.08);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 16px;
        transition: all 0.2s;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
    }

    .card-action-btn:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.18);
        transform: scale(1.05);
    }

    .card-action-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    /* Card WebView Preview Frame */
    .card-webview-frame {
        width: 100%;
        max-width: 100%;
        margin: 0;
        padding: 20px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 24px;
        box-shadow: none;
        font-family: system-ui, -apple-system, sans-serif;
        border-radius: 0;
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

    /* Embed / Workspace Preview Adjustments */
    .card-reader-container.embed-mode {
        background-color: transparent !important;
        height: auto;
        width: auto;
        overflow: visible;
        display: block;
    }
    
    .card-webview-frame-wrapper.embed-mode {
        padding: 0;
        overflow: visible;
    }

    .card-action-container.embed-mode {
        top: 20px;
        right: 20px;
    }

    .card-webview-frame.embed-mode {
        box-shadow: none;
        max-width: 100%;
        padding: 20px;
        overflow: visible;
        margin: 0;
        border-radius: 0;
    }
</style>
