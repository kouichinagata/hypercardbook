<script lang="ts">
    import { onMount, tick } from 'svelte';
    import { page } from '$app/state';
    import { goto } from '$app/navigation';
    import Book from '$lib/components/Book.svelte';
    import { marked } from 'marked';

    let { data } = $props();

    // Chat and Markdown states
    let markdown = $state('');
    let bookUuid = $state('');
    let activeTab = $state('preview'); // 'preview' or 'source'
    let mode = $state('book'); // 'book' or 'card'
    let replaceTargetIsCover = $state(false);

    import { createBrowserClient } from '@supabase/ssr';
    import { env } from '$env/dynamic/public';

    // Initialize Supabase browser client for image uploads
    const supabase = createBrowserClient(
        env.PUBLIC_SUPABASE_URL || '',
        env.PUBLIC_SUPABASE_ANON_KEY || ''
    );

    // Media Panel states
    let showMediaPanel = $state(false);
    let mediaSearchQuery = $state('');
    let mediaSearchResults = $state<any[]>([]);
    let isSearchingMedia = $state(false);
    let isUploadingMedia = $state(false);
    let replaceTargetUrl = $state('');
    let replaceTargetAlt = $state('');
    let sourceEditorEl: HTMLTextAreaElement | null = $state(null);
    let uploadFileInput: HTMLInputElement | null = $state(null);
    let mediaSearchPage = $state(1);
    let totalMediaHits = $state(0);
    let isLoadingMoreMedia = $state(false);

    // Chat messages
    interface ChatMessage {
        role: 'user' | 'model';
        text: string;
    }
    let chatHistory: ChatMessage[] = $state([]);
    let currentInput = $state('');
    let isGenerating = $state(false);
    let errorMsg = $state('');
    // Derived properties for Card layout preview
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
                    return parts.slice(1).join(':').trim().replace(/[^a-zA-Z0-9-_]/g, '');
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
        const cleanMd = markdown.replace(/^---\s*[\s\S]*?\s*---/, '').trim();
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

    // Auto-save logic
    let saveTimeout: NodeJS.Timeout | null = null;
    let saveStatus = $state('Synced'); // 'Synced', 'Saving...', 'Error'

    // Watch markdown changes and trigger debounced auto-save
    $effect(() => {
        if (markdown) {
            triggerAutoSave();
        }
    });

    function triggerAutoSave() {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveStatus = 'Saving...';
        saveTimeout = setTimeout(async () => {
            try {
                const response = await fetch('/api/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ markdown, id: bookUuid })
                });
                
                if (response.ok) {
                    const resData = await response.json();
                    saveStatus = 'Synced';
                    if (resData.id && !bookUuid) {
                        bookUuid = resData.id;
                        goto(`/workspace?id=${resData.id}`, { replaceState: true, noScroll: true, keepFocus: true });
                    }
                } else {
                    const errData = await response.json();
                    console.error('Failed to auto-save:', errData.error);
                    saveStatus = 'Error';
                }
            } catch (err) {
                console.error('Error auto-saving:', err);
                saveStatus = 'Error';
            }
        }, 1500); // 1.5 seconds debounce
    }

    // Scroll chat list to bottom
    let chatListContainer: HTMLDivElement | null = $state(null);
    function scrollToBottom() {
        setTimeout(() => {
            if (chatListContainer) {
                chatListContainer.scrollTop = chatListContainer.scrollHeight;
            }
        }, 50);
    }

    async function sendPrompt(promptText: string) {
        if (!promptText.trim() || isGenerating) return;

        // Add user message to history
        chatHistory = [...chatHistory, { role: 'user', text: promptText }];
        currentInput = '';
        isGenerating = true;
        errorMsg = '';
        scrollToBottom();

        try {
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: promptText,
                    history: chatHistory.slice(0, -1), // Send previous history
                    currentMarkdown: markdown,
                    bookId: bookUuid,
                    mode: mode
                })
            });

            const dataRes = await response.json();

            if (!response.ok) {
                throw new Error(dataRes.error || `HTTP error ${response.status}`);
            }

            // Update state
            chatHistory = [...chatHistory, { role: 'model', text: dataRes.text }];
            if (dataRes.markdown) {
                markdown = dataRes.markdown;
                const parsedIsCard = dataRes.markdown.includes('play_mode: card');
                mode = parsedIsCard ? 'card' : 'book';
            }
        } catch (err: any) {
            console.error('Generation failed:', err);
            errorMsg = err.message || '接続エラーが発生しました。GEMINI_API_KEYが正しく設定されているかご確認ください。';
        } finally {
            isGenerating = false;
            scrollToBottom();
        }
    }

    onMount(() => {
        document.body.classList.add('scroll-locked');

        // Populate state from Page Loader Data
        markdown = data.markdown || '';
        bookUuid = data.bookId || '';
        chatHistory = data.initialChatHistory || [];

        const urlMode = page.url.searchParams.get('mode');
        if (urlMode === 'card') {
            mode = 'card';
        } else if (markdown) {
            const parsedIsCard = markdown.includes('play_mode: card');
            mode = parsedIsCard ? 'card' : 'book';
        }

        let initPrompt = page.url.searchParams.get('prompt');
        if (!initPrompt) {
            try {
                initPrompt = sessionStorage.getItem('workspace_init_prompt');
                if (initPrompt) {
                    sessionStorage.removeItem('workspace_init_prompt');
                }
            } catch (err) {
                console.error('Failed to read prompt from sessionStorage:', err);
            }
        }

        (async () => {
            if (initPrompt) {
                await sendPrompt(initPrompt);
            } else if (!data.bookId) {
                errorMsg = 'プロンプトが指定されていません。トップページからプロンプトを入力してください。';
            }
        })();

        return () => {
            document.body.classList.remove('scroll-locked');
        };
    });

    function handleChatSubmit(e: SubmitEvent) {
        e.preventDefault();
        if (currentInput.trim()) {
            sendPrompt(currentInput);
        }
    }

    // Media panel functions
    async function searchMedia() {
        if (!mediaSearchQuery.trim()) {
            mediaSearchResults = [];
            totalMediaHits = 0;
            return;
        }
        isSearchingMedia = true;
        mediaSearchPage = 1;
        try {
            const response = await fetch(`/api/media/search?q=${encodeURIComponent(mediaSearchQuery)}&page=1`);
            if (response.ok) {
                const resData = await response.json();
                mediaSearchResults = resData.hits || [];
                totalMediaHits = resData.totalHits || 0;
            } else {
                console.error('Failed to search media');
            }
        } catch (err) {
            console.error('Search error:', err);
        } finally {
            isSearchingMedia = false;
        }
    }

    async function loadMoreMedia() {
        if (isLoadingMoreMedia || isSearchingMedia || !mediaSearchQuery.trim()) return;
        isLoadingMoreMedia = true;
        const nextPage = mediaSearchPage + 1;
        try {
            const response = await fetch(`/api/media/search?q=${encodeURIComponent(mediaSearchQuery)}&page=${nextPage}`);
            if (response.ok) {
                const resData = await response.json();
                mediaSearchResults = [...mediaSearchResults, ...(resData.hits || [])];
                totalMediaHits = resData.totalHits || 0;
                mediaSearchPage = nextPage;
            } else {
                console.error('Failed to load more media');
            }
        } catch (err) {
            console.error('Load more error:', err);
        } finally {
            isLoadingMoreMedia = false;
        }
    }


    function openInsertMedia() {
        replaceTargetUrl = '';
        replaceTargetAlt = '';
        showMediaPanel = true;
        mediaSearchQuery = '';
        mediaSearchResults = [];
    }

    function selectMedia(url: string, altText: string) {
        if (replaceTargetUrl) {
            if (!confirm('Do you want to apply these changes?')) {
                return;
            }
            if (replaceTargetIsCover) {
                // Replace cover_image in frontmatter
                const fmMatch = markdown.match(/^---\s*([\s\S]*?)\s*---/);
                if (fmMatch) {
                    const fmLines = fmMatch[1].split('\n');
                    let coverImageFound = false;
                    const updatedLines = fmLines.map(line => {
                        const parts = line.split(':');
                        if (parts.length >= 2 && parts[0].trim() === 'cover_image') {
                            coverImageFound = true;
                            return `cover_image: ${url}`;
                        }
                        return line;
                    });
                    if (!coverImageFound) {
                        updatedLines.push(`cover_image: ${url}`);
                    }
                    markdown = `---\n${updatedLines.join('\n')}\n---` + markdown.replace(/^---\s*[\s\S]*?\s*---/, '');
                } else {
                    markdown = `---\ncover_image: ${url}\n---\n` + markdown;
                }
            } else {
                replaceImageUrl(url);
            }
        } else {
            insertImageAtCursor(url, altText || '画像');
        }
        showMediaPanel = false;
    }

    function handleWebViewClick(e: MouseEvent) {
        const target = e.target as HTMLElement;
        if (target && target.tagName === 'IMG') {
            const src = target.getAttribute('src') || '';
            const alt = target.getAttribute('alt') || '';
            const isCover = target.classList.contains('clicked-img-cover') || target.classList.contains('cover-image') || target.id === 'coverImg';
            
            replaceTargetUrl = src;
            replaceTargetAlt = alt;
            replaceTargetIsCover = isCover;
            showMediaPanel = true;
            
            const cleanQuery = alt ? alt.replace(/[-_]/g, ' ').trim() : '';
            mediaSearchQuery = cleanQuery;
            if (cleanQuery) {
                searchMedia();
            } else {
                mediaSearchResults = [];
            }
        }
    }

    function replaceImageUrl(newUrl: string) {
        if (!replaceTargetUrl) return;

        const escapedAlt = replaceTargetAlt.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`!\\[${escapedAlt || '.*?'}\\]\\((.*?)\\)`, 'g');
        let found = false;
        
        const newMarkdown = markdown.replace(regex, (match, url) => {
            const normUrl = url.trim().replace(/^\//, '').replace(/^books\//, '');
            const normTarget = replaceTargetUrl.trim().replace(/^\//, '').replace(/^books\//, '');
            
            if (normUrl === normTarget || url.includes(normTarget) || replaceTargetUrl.includes(url)) {
                found = true;
                return `![${replaceTargetAlt || 'image'}](${newUrl})`;
            }
            return match;
        });

        if (found) {
            markdown = newMarkdown;
        } else {
            const regexAltOnly = new RegExp(`!\\[${escapedAlt}\\]\\((.*?)\\)`, 'g');
            let foundAlt = false;
            const newMarkdownAlt = markdown.replace(regexAltOnly, (match) => {
                foundAlt = true;
                return `![${replaceTargetAlt}](${newUrl})`;
            });
            if (foundAlt) {
                markdown = newMarkdownAlt;
            } else {
                console.warn('Could not replace image URL in markdown');
            }
        }
    }

    function insertImageAtCursor(newUrl: string, altText: string) {
        const alt = altText.replace(/[\(\)\[\]]/g, '').trim();
        if (!sourceEditorEl) {
            markdown += `\n![${alt}](${newUrl})\n`;
            return;
        }

        const start = sourceEditorEl.selectionStart;
        const end = sourceEditorEl.selectionEnd;
        const text = sourceEditorEl.value;
        const before = text.substring(0, start);
        const after = text.substring(end);
        
        markdown = before + `![${alt}](${newUrl})` + after;
        
        tick().then(() => {
            if (sourceEditorEl) {
                sourceEditorEl.focus();
                const newCursorPos = start + `![${alt}](${newUrl})`.length;
                sourceEditorEl.setSelectionRange(newCursorPos, newCursorPos);
            }
        });
    }

    async function handleFileUpload(e: Event) {
        const files = (e.target as HTMLInputElement).files;
        if (!files || files.length === 0) return;
        
        const file = files[0];
        isUploadingMedia = true;

        try {
            const img = new Image();
            img.src = URL.createObjectURL(file);
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
            });

            const maxDim = 1200;
            let width = img.width;
            let height = img.height;
            if (width > maxDim || height > maxDim) {
                if (width > height) {
                    height = Math.round((height * maxDim) / width);
                    width = maxDim;
                } else {
                    width = Math.round((width * maxDim) / height);
                    height = maxDim;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Failed to create canvas context');
            ctx.drawImage(img, 0, 0, width, height);

            const blob: Blob = await new Promise((resolve) => {
                canvas.toBlob((b) => resolve(b!), 'image/webp', 0.85);
            });

            URL.revokeObjectURL(img.src);

            const sessionUser = data.session?.user;
            const userId = sessionUser?.id || 'guest';
            
            const cleanName = file.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
            const fileName = `${crypto.randomUUID()}_${cleanName}.webp`;
            const filePath = `${userId}/${fileName}`;

            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('HyperCardBookBucket')
                .upload(filePath, blob, {
                    contentType: 'image/webp',
                    cacheControl: '3600'
                });

            if (uploadError) {
                throw uploadError;
            }

            const { data: publicUrlData } = supabase.storage
                .from('HyperCardBookBucket')
                .getPublicUrl(filePath);

            const publicUrl = publicUrlData.publicUrl;
            
            selectMedia(publicUrl, file.name.split('.')[0] || 'uploaded-image');
        } catch (err: any) {
            console.error('Upload failed:', err);
            alert(`Failed to upload image: ${err.message || err}`);
        } finally {
            isUploadingMedia = false;
        }
    }

    // Uploaded images state
    let uploadedImages = $state<{ name: string; url: string }[]>([]);
    let isFetchingUploads = $state(false);

    async function fetchUploadedImages() {
        const sessionUser = data.session?.user;
        const userId = sessionUser?.id || 'guest';
        isFetchingUploads = true;
        try {
            const { data: files, error } = await supabase.storage
                .from('HyperCardBookBucket')
                .list(userId, {
                    limit: 100,
                    sortBy: { column: 'created_at', order: 'desc' }
                });

            if (error) {
                console.error('Failed to list storage files:', error);
                uploadedImages = [];
                return;
            }

            if (files) {
                uploadedImages = files.map(file => {
                    const { data: urlData } = supabase.storage
                        .from('HyperCardBookBucket')
                        .getPublicUrl(`${userId}/${file.name}`);
                    return {
                        name: file.name,
                        url: urlData.publicUrl
                    };
                });
            }
        } catch (err) {
            console.error('Error fetching uploaded images:', err);
        } finally {
            isFetchingUploads = false;
        }
    }

    // Trigger fetch on media panel open
    $effect(() => {
        if (showMediaPanel) {
            fetchUploadedImages();
        }
    });

    async function handleDeleteUploadedImage(e: MouseEvent, name: string) {
        e.stopPropagation();
        if (!confirm('Are you sure you want to delete this image?')) return;

        const sessionUser = data.session?.user;
        const userId = sessionUser?.id || 'guest';
        const filePath = `${userId}/${name}`;

        try {
            const { error } = await supabase.storage
                .from('HyperCardBookBucket')
                .remove([filePath]);

            if (error) {
                throw error;
            }

            await fetchUploadedImages();
        } catch (err: any) {
            console.error('Failed to delete uploaded image:', err);
            alert(`Failed to delete image: ${err.message || err}`);
        }
    }

    async function handleDownloadUploadedImage(e: MouseEvent, url: string, name: string) {
        e.stopPropagation();
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
        } catch (err) {
            console.error('Failed to download image:', err);
            alert('Failed to download image.');
        }
    }

    // HTML Export helper functions
    function handleDownloadHtml() {
        const titleText = cardTitle || 'Untitled Card';
        const slug = cardSlug || `card-${Date.now()}`;
        
        // Extract style and script content
        const styleRegex = /<style>([\s\S]*?)<\/style>/gi;
        let styleMatch;
        let userStyles = '';
        while ((styleMatch = styleRegex.exec(markdown)) !== null) {
            userStyles += styleMatch[1] + '\n';
        }

        const scriptRegex = /<script>([\s\S]*?)<\/script>/gi;
        let scriptMatch;
        let userScripts = '';
        while ((scriptMatch = scriptRegex.exec(markdown)) !== null) {
            userScripts += scriptMatch[1] + '\n';
        }

        const standaloneHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${titleText}</title>
    <style>
        ${userStyles}
    </style>
</head>
<body>
    ${cardBodyHtml}
    
    <${'script'}>
        ${userScripts}
    </${'script'}>
</body>
</html>`;

        const blob = new Blob([standaloneHtml], { type: 'text/html;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${slug}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    let isExportingHtml = $state(false);
    async function handleExportHtmlLink() {
        if (isExportingHtml) return;

        // Open the tab synchronously to prevent browser popup blockers
        const newTab = window.open('', '_blank');
        if (!newTab) {
            alert('Popup blocker is active. Please allow popups for this site.');
            return;
        }

        // Show a temporary loading text/styling in the new tab
        newTab.document.write('<html><head><title>Exporting HTML...</title><style>body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f4eae1; color: #333; } .loader { text-align: center; }</style></head><body><div class="loader"><h2>Generating standalone HTML...</h2><p>Please wait a moment.</p></div></body></html>');

        isExportingHtml = true;
        
        try {
            const response = await fetch('/api/export-html', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    markdown,
                    id: bookUuid || cardSlug
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || `HTTP error ${response.status}`);
            }

            const dataRes = await response.json();
            if (dataRes.url) {
                newTab.location.href = dataRes.url;
            } else {
                throw new Error('No URL returned from export API');
            }
        } catch (err: any) {
            console.error('Export HTML failed:', err);
            newTab.close();
            alert(`Failed to export HTML: ${err.message || err}`);
        } finally {
            isExportingHtml = false;
        }
    }
</script>

<div class="workspace-layout">
    {#if showMediaPanel}
        <!-- Left Panel: Media -->
        <div class="media-panel">
            <div class="media-panel-header">
                <h3>{replaceTargetUrl ? 'Replace Image' : 'Insert Image'}</h3>
                <button class="close-media-btn" onclick={() => showMediaPanel = false}>✕</button>
            </div>
            
            <div class="media-panel-body">
                <!-- Upload section -->
                <div class="media-upload-section">
                    {#if uploadedImages.length > 0}
                        <div class="uploaded-thumbnails-container">
                            <div class="uploaded-thumbnails-grid">
                                {#each uploadedImages as img}
                                    <div 
                                        class="thumbnail-wrapper" 
                                        onclick={() => selectMedia(img.url, img.name.split('_').slice(1).join('_').split('.')[0] || 'image')}
                                        onkeydown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                selectMedia(img.url, img.name.split('_').slice(1).join('_').split('.')[0] || 'image');
                                            }
                                        }}
                                        role="button"
                                        tabindex="0"
                                    >
                                        <img src={img.url} alt={img.name} class="thumbnail-img" />
                                        <div class="thumbnail-actions">
                                            <button 
                                                class="thumbnail-action-btn delete-btn" 
                                                onclick={(e) => handleDeleteUploadedImage(e, img.name)}
                                                title="Delete"
                                            >
                                                🗑️
                                            </button>
                                            <button 
                                                class="thumbnail-action-btn download-btn" 
                                                onclick={(e) => handleDownloadUploadedImage(e, img.url, img.name)}
                                                title="Download"
                                            >
                                                💾
                                            </button>
                                        </div>
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {/if}
                    <h4>UPLOAD IMAGE</h4>
                    <label class="media-upload-dropzone">
                        <input 
                            type="file" 
                            accept="image/*" 
                            bind:this={uploadFileInput}
                            onchange={handleFileUpload} 
                            disabled={isUploadingMedia}
                            class="hidden-file-input"
                        />
                        {#if isUploadingMedia}
                            <div class="upload-loader">
                                <div class="spinner-small"></div>
                                <span>Uploading...</span>
                            </div>
                        {:else}
                            <div class="upload-prompt">
                                📤 <span>Choose file to upload</span>
                                <span class="upload-limit">Max 5MB (auto-compressed)</span>
                            </div>
                        {/if}
                    </label>
                </div>

                <!-- Search section -->
                <div class="media-search-section">
                    <h4>Search Pixabay Images</h4>
                    <form onsubmit={(e) => { e.preventDefault(); searchMedia(); }} class="media-search-form">
                        <input 
                            type="text" 
                            bind:value={mediaSearchQuery} 
                            placeholder="Search terms (e.g. cat, space)" 
                            disabled={isSearchingMedia}
                        />
                        <button type="submit" disabled={isSearchingMedia || !mediaSearchQuery.trim()}>
                            Search
                        </button>
                    </form>
                    
                    <div class="media-results-container">
                        {#if isSearchingMedia}
                            <div class="media-loader">
                                <div class="spinner-small"></div>
                                <p>Searching...</p>
                            </div>
                        {:else if mediaSearchResults.length > 0}
                            <div class="media-grid">
                                {#each mediaSearchResults as hit}
                                    <button 
                                        class="media-grid-item" 
                                        onclick={() => selectMedia(hit.webformatUrl, hit.tags)}
                                        title={hit.tags}
                                    >
                                        <img src={hit.previewUrl} alt={hit.tags} loading="lazy" />
                                    </button>
                                {/each}
                            </div>
                            {#if mediaSearchResults.length < totalMediaHits}
                                <div class="media-more-container">
                                    <button 
                                        class="media-more-btn" 
                                        onclick={loadMoreMedia} 
                                        disabled={isLoadingMoreMedia}
                                    >
                                        {#if isLoadingMoreMedia}
                                            Loading...
                                        {:else}
                                            more...
                                        {/if}
                                    </button>
                                </div>
                            {/if}
                        {:else if mediaSearchQuery}
                            <p class="media-no-results">No results found for "{mediaSearchQuery}"</p>
                        {/if}
                    </div>
                </div>
            </div>
        </div>
    {:else}
        <!-- Left Panel: Chat -->
        <div class="chat-panel">
            <div class="panel-header">
                <div class="header-left">
                    <button class="back-home-btn" onclick={() => goto('/')}>back</button>
                    <h2>Chat</h2>
                </div>
                <div class="status-indicator" class:saving={saveStatus === 'Saving...'} class:error={saveStatus === 'Error'}>
                    {saveStatus}
                </div>
            </div>

            <div class="chat-list" bind:this={chatListContainer}>
                {#each chatHistory as message}
                    <div class="message-bubble" class:user={message.role === 'user'} class:ai={message.role === 'model'}>
                        <div class="bubble-avatar">{message.role === 'user' ? '👤' : '🤖'}</div>
                        <div class="bubble-content">
                            {message.text.replace(/```(?:markdown)?[\s\S]*?```/gi, mode === 'card' ? '[カードを生成・更新しました]' : '[本を生成・更新しました]').trim()}
                        </div>
                    </div>
                {/each}

                {#if isGenerating}
                    <div class="message-bubble ai loading">
                        <div class="bubble-avatar animate-pulse">🤖</div>
                        <div class="bubble-content">
                            <div class="typing-indicator">
                                <span></span><span></span><span></span>
                            </div>
                        </div>
                    </div>
                {/if}

                {#if errorMsg}
                    <div class="error-banner">
                        ⚠️ {errorMsg}
                    </div>
                {/if}
            </div>

            <form onsubmit={handleChatSubmit} class="chat-form">
                <input
                    type="text"
                    bind:value={currentInput}
                    placeholder="Please enter a prompt to correct the book."
                    disabled={isGenerating}
                />
                <button type="submit" disabled={isGenerating || !currentInput.trim()}>
                    Run
                </button>
            </form>
        </div>
    {/if}

    <!-- Right Panel: Editor / Preview -->
    <div class="preview-panel">
        <div class="panel-tabs">
            <div class="tabs-left">
                <button 
                    class="tab-btn" 
                    class:active={activeTab === 'preview'} 
                    onclick={() => activeTab = 'preview'}
                >
                    Preview
                </button>
                <button 
                    class="tab-btn" 
                    class:active={activeTab === 'source'} 
                    onclick={() => activeTab = 'source'}
                >
                    Code (Markdown)
                </button>
            </div>
            {#if activeTab === 'source'}
                <button class="insert-media-btn" onclick={openInsertMedia}>
                    🖼️ Insert Image
                </button>
            {/if}
        </div>

        <div class="panel-body">
            <div class="preview-container" class:hidden={activeTab !== 'preview'}>
                {#if mode === 'card'}
                    {#if cardSlug}
                        <div class="card-action-container" style="position: absolute; top: 20px; right: 20px; z-index: 100; display: flex; gap: 8px;">
                            <button class="card-action-btn" onclick={handleDownloadHtml} title="Download HTML">
                                💾
                            </button>
                            <button class="card-action-btn" onclick={handleExportHtmlLink} disabled={isExportingHtml} title="Export HTML">
                                🌐
                            </button>
                            <a class="card-action-btn" href="/hyperbook/{cardSlug}?embed=true" target="_blank" title="New tab">
                                🔗
                            </a>
                        </div>
                    {/if}
                    <div 
                        class="card-webview-frame" 
                        data-theme-color={cardThemeColor}
                        onclick={handleWebViewClick}
                        role="presentation"
                    >
                        <div class="card-webview-header">
                            <h1 class="card-webview-title">{cardTitle}</h1>
                            {#if cardCoverImage}
                                <div class="card-webview-cover-wrapper">
                                    <img 
                                        src={cardCoverImage} 
                                        alt={cardTitle} 
                                        class="card-cover-img clicked-img-cover" 
                                    />
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
                {:else}
                    {#if markdown}
                        <div onclick={handleWebViewClick} role="presentation" style="width: 100%; height: 100%;">
                            <Book {markdown} id={bookUuid} />
                        </div>
                    {:else}
                        <div class="empty-preview">
                            <div class="spinner"></div>
                            <p>本を生成しています。しばらくお待ちください...</p>
                        </div>
                    {/if}
                {/if}
            </div>
            
            <textarea
                bind:this={sourceEditorEl}
                bind:value={markdown}
                placeholder="YAML frontmatter and Markdown format..."
                class="source-editor"
                class:hidden={activeTab !== 'source'}
            ></textarea>
        </div>
    </div>
</div>

<style>
    .workspace-layout {
        display: flex;
        width: 100vw;
        height: 100vh;
        background-color: #0b0c10;
        overflow: hidden;
    }

    /* Left Panel: Chat */
    .chat-panel {
        display: flex;
        flex-direction: column;
        width: 400px;
        min-width: 320px;
        height: 100%;
        background-color: #12131c;
        border-right: 1px solid rgba(255, 255, 255, 0.08);
        box-sizing: border-box;
    }

    .panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .header-left {
        display: flex;
        align-items: center;
        gap: 12px;
    }

    .back-home-btn {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #ffffff;
        padding: 4px 10px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.2s;
        font-family: system-ui, sans-serif;
    }

    .back-home-btn:hover {
        background: rgba(255, 255, 255, 0.12);
        transform: scale(1.02);
    }

    .panel-header h2 {
        font-family: 'Outfit', sans-serif;
        font-size: 18px;
        font-weight: 700;
        margin: 0;
        color: #ffffff;
    }

    .status-indicator {
        font-size: 11px;
        color: #10b981;
        background: rgba(16, 185, 129, 0.1);
        padding: 2px 8px;
        border-radius: 12px;
        font-family: monospace;
    }

    .status-indicator.saving {
        color: #f59e0b;
        background: rgba(245, 158, 11, 0.1);
    }

    .status-indicator.error {
        color: #ef4444;
        background: rgba(239, 68, 68, 0.1);
    }

    .chat-list {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        box-sizing: border-box;
    }

    .message-bubble {
        display: flex;
        gap: 12px;
        animation: fadeIn 0.3s ease-out forwards;
    }

    .bubble-avatar {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.05);
        font-size: 16px;
        flex-shrink: 0;
    }

    .bubble-content {
        background: rgba(255, 255, 255, 0.04);
        padding: 12px 16px;
        border-radius: 16px;
        font-size: 14px;
        line-height: 1.5;
        max-width: 80%;
        word-wrap: break-word;
        white-space: pre-wrap;
    }

    .message-bubble.user {
        flex-direction: row-reverse;
    }

    .message-bubble.user .bubble-content {
        background: #8b5cf6;
        color: #ffffff;
    }

    .chat-form {
        display: flex;
        gap: 8px;
        padding: 16px 20px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        background-color: #12131c;
    }

    .chat-form input {
        flex: 1;
        background: rgba(0, 0, 0, 0.2);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        padding: 12px 16px;
        color: #ffffff;
        font-size: 14px;
        outline: none;
        transition: border-color 0.2s;
    }

    .chat-form input:focus {
        border-color: #8b5cf6;
    }

    .chat-form button {
        background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
        border: none;
        color: #ffffff;
        border-radius: 8px;
        padding: 0 16px;
        font-family: 'Outfit', sans-serif;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.1s, filter 0.2s;
    }

    .chat-form button:hover:not(:disabled) {
        filter: brightness(1.1);
    }

    .chat-form button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .error-banner {
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.2);
        color: #fca5a5;
        padding: 12px;
        border-radius: 8px;
        font-size: 13px;
        line-height: 1.4;
    }

    /* Typing indicator */
    .typing-indicator {
        display: flex;
        align-items: center;
        gap: 4px;
        height: 20px;
    }

    .typing-indicator span {
        width: 6px;
        height: 6px;
        background: #9ca3af;
        border-radius: 50%;
        animation: typing 1.4s infinite both;
    }

    .typing-indicator span:nth-child(2) { animation-delay: .2s; }
    .typing-indicator span:nth-child(3) { animation-delay: .4s; }

    @keyframes typing {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-4px); }
    }

    /* Right Panel: Preview and Editor */
    .preview-panel {
        display: flex;
        flex-direction: column;
        flex: 1;
        height: 100%;
        background-color: #0b0c10;
        box-sizing: border-box;
    }

    .panel-tabs {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 20px 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        background-color: #12131c;
    }

    .tabs-left {
        display: flex;
        gap: 8px;
    }

    .insert-media-btn {
        background: rgba(139, 92, 246, 0.15);
        border: 1px solid rgba(139, 92, 246, 0.3);
        color: #c084fc;
        padding: 5px 12px;
        border-radius: 6px;
        font-size: 13px;
        font-family: 'Outfit', sans-serif;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        margin-bottom: 8px;
    }

    .insert-media-btn:hover {
        background: rgba(139, 92, 246, 0.25);
        border-color: rgba(139, 92, 246, 0.5);
        color: #ffffff;
    }

    /* Media Panel (Drawer) */
    .media-panel {
        display: flex;
        flex-direction: column;
        width: 400px;
        min-width: 320px;
        height: 100%;
        background-color: #12131c;
        border-right: 1px solid rgba(255, 255, 255, 0.08);
        box-sizing: border-box;
    }

    .media-panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .media-panel-header h3 {
        font-family: 'Outfit', sans-serif;
        font-size: 16px;
        font-weight: 700;
        margin: 0;
        color: #ffffff;
    }

    .close-media-btn {
        background: none;
        border: none;
        color: #9ca3af;
        font-size: 18px;
        cursor: pointer;
        padding: 4px;
        transition: color 0.2s;
    }

    .close-media-btn:hover {
        color: #ffffff;
    }

    .media-panel-body {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 24px;
        box-sizing: border-box;
    }

    .media-panel-body h4 {
        margin: 0 0 10px 0;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #9ca3af;
        font-family: 'Outfit', sans-serif;
    }

    /* Upload section styling */
    .media-upload-dropzone {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        border: 2px dashed rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        padding: 20px;
        cursor: pointer;
        background: rgba(0, 0, 0, 0.15);
        transition: all 0.2s;
    }

    .media-upload-dropzone:hover {
        border-color: #8b5cf6;
        background: rgba(139, 92, 246, 0.05);
    }

    .hidden-file-input {
        display: none;
    }

    .upload-prompt {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        color: #cbd5e1;
        font-size: 13px;
    }

    .upload-limit {
        font-size: 11px;
        color: #9ca3af;
    }

    .upload-loader {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        color: #c084fc;
        font-size: 13px;
    }

    /* Search section styling */
    .media-search-form {
        display: flex;
        gap: 8px;
        margin-bottom: 16px;
    }

    .media-search-form input {
        flex: 1;
        background: rgba(0, 0, 0, 0.2);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 6px;
        padding: 8px 12px;
        color: #ffffff;
        font-size: 13px;
        outline: none;
        transition: border-color 0.2s;
    }

    .media-search-form input:focus {
        border-color: #8b5cf6;
    }

    .media-search-form button {
        background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
        border: none;
        color: #ffffff;
        border-radius: 6px;
        padding: 0 14px;
        font-family: 'Outfit', sans-serif;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
    }

    .media-results-container {
        flex: 1;
        min-height: 200px;
    }

    .media-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
    }

    .media-grid-item {
        background: rgba(0, 0, 0, 0.2);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 6px;
        padding: 0;
        overflow: hidden;
        cursor: pointer;
        aspect-ratio: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    }

    .media-grid-item:hover {
        transform: scale(1.05);
        border-color: #8b5cf6;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
    }

    .media-grid-item img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .media-loader {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px 0;
        gap: 12px;
        color: #9ca3af;
        font-size: 13px;
    }

    .spinner-small {
        width: 20px;
        height: 20px;
        border: 2px solid rgba(139, 92, 246, 0.1);
        border-top-color: #8b5cf6;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    .media-no-results {
        text-align: center;
        color: #9ca3af;
        font-size: 13px;
        padding: 20px 0;
    }

    .tab-btn {
        background: none;
        border: none;
        border-bottom: 2px solid transparent;
        color: #9ca3af;
        padding: 8px 16px 12px;
        font-family: 'Outfit', sans-serif;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    }

    .tab-btn:hover {
        color: #ffffff;
    }

    .tab-btn.active {
        color: #8b5cf6;
        border-bottom-color: #8b5cf6;
    }

    .panel-body {
        flex: 1;
        overflow: hidden;
        position: relative;
        box-sizing: border-box;
    }

    .preview-container {
        width: 100%;
        height: 100%;
        position: relative;
        overflow: hidden;
    }

    .source-editor {
        width: 100%;
        height: 100%;
        background: #0d0e15;
        border: none;
        box-sizing: border-box;
        padding: 24px;
        color: #cbd5e1;
        font-family: monospace;
        font-size: 14px;
        line-height: 1.6;
        resize: none;
        outline: none;
    }

    .empty-preview {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        gap: 16px;
        color: #9ca3af;
    }

    .empty-preview .spinner {
        width: 32px;
        height: 32px;
        border: 3px solid rgba(139, 92, 246, 0.1);
        border-top-color: #8b5cf6;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    .animate-pulse {
        animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }

    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: .5; }
    }

    .hidden {
        display: none !important;
    }

    /* Uploaded image thumbnails */
    .uploaded-thumbnails-container {
        max-height: 200px;
        overflow-y: auto;
        margin-bottom: 16px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        padding: 8px;
        background: rgba(0, 0, 0, 0.15);
    }

    .uploaded-thumbnails-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 8px;
    }

    .thumbnail-wrapper {
        position: relative;
        aspect-ratio: 1;
        cursor: pointer;
        border-radius: 6px;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.1);
        transition: transform 0.2s, border-color 0.2s;
    }

    .thumbnail-wrapper:hover {
        transform: scale(1.05);
        border-color: #8b5cf6;
    }

    .thumbnail-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .thumbnail-actions {
        position: absolute;
        top: 4px;
        right: 4px;
        display: flex;
        gap: 4px;
        opacity: 0;
        transition: opacity 0.2s;
        z-index: 10;
    }

    .thumbnail-wrapper:hover .thumbnail-actions {
        opacity: 1;
    }

    .thumbnail-action-btn {
        background: rgba(0, 0, 0, 0.7);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: white;
        border-radius: 4px;
        width: 22px;
        height: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 11px;
        padding: 0;
        transition: background 0.2s;
    }

    .thumbnail-action-btn:hover {
        background: rgba(0, 0, 0, 0.9);
    }

    .thumbnail-action-btn.delete-btn:hover {
        background: #ef4444;
        border-color: #ef4444;
    }

    .media-more-container {
        display: flex;
        justify-content: flex-end;
        margin-top: 12px;
        width: 100%;
    }

    .media-more-btn {
        background: none;
        border: none;
        color: #8b5cf6;
        cursor: pointer;
        font-size: 13px;
        font-family: 'Outfit', sans-serif;
        font-weight: 600;
        padding: 4px 8px;
        transition: color 0.2s;
    }

    .media-more-btn:hover:not(:disabled) {
        color: #c084fc;
    }

    .media-more-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .card-action-btn {
        padding: 8px 12px;
        border-radius: 20px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        background: rgba(22, 22, 22, 0.8);
        color: #ffffff;
        cursor: pointer;
        font-size: 11px;
        transition: all 0.3s;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    
    .card-action-btn:hover {
        background: rgba(255, 255, 255, 0.15);
        border-color: rgba(255, 255, 255, 0.4);
        transform: scale(1.05);
    }

    .card-action-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
    }

    /* Card WebView Preview Frame */
    .card-webview-frame {
        position: absolute;
        top: 0;
        bottom: 0;
        left: 50%;
        transform: translateX(-50%);
        width: 100%;
        max-width: 600px;
        padding: 40px 30px;
        box-sizing: border-box;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 24px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        transition: background-color 0.3s, color 0.3s;
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
        cursor: pointer;
        transition: transform 0.2s;
    }

    .card-webview-cover-wrapper:hover {
        transform: scale(1.02);
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
        cursor: pointer;
        transition: transform 0.2s;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.08);
        display: block;
        margin: 16px auto;
    }

    :global(.card-webview-body img:hover) {
        transform: scale(1.02);
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
</style>
