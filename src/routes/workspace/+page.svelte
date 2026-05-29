<script lang="ts">
    import { onMount, tick } from 'svelte';
    import { page } from '$app/state';
    import { goto } from '$app/navigation';
    import Book from '$lib/components/Book.svelte';

    let { data } = $props();

    // Chat and Markdown states
    let markdown = $state('');
    let bookUuid = $state('');
    let activeTab = $state('preview'); // 'preview' or 'source'

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
                    bookId: bookUuid
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

        const initPrompt = page.url.searchParams.get('prompt');

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

    function handlePreviewImageClick(e: { src: string; alt: string }) {
        console.log('handlePreviewImageClick in workspace called! src:', e.src, 'alt:', e.alt);
        replaceTargetUrl = e.src;
        replaceTargetAlt = e.alt;
        showMediaPanel = true;

        // Auto search by alt text (using space instead of hyphens)
        const cleanQuery = e.alt ? e.alt.replace(/[-_]/g, ' ').trim() : '';
        mediaSearchQuery = cleanQuery;
        if (cleanQuery) {
            searchMedia();
        } else {
            mediaSearchResults = [];
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
            replaceImageUrl(url);
        } else {
            insertImageAtCursor(url, altText || '画像');
        }
        showMediaPanel = false;
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
                            {message.text.replace(/```markdown[\s\S]*?```/g, '[本を生成・更新しました]').trim()}
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
                {#if markdown}
                    <Book {markdown} handleImageClick={handlePreviewImageClick} />
                {:else}
                    <div class="empty-preview">
                        <div class="spinner"></div>
                        <p>本を生成しています。しばらくお待ちください...</p>
                    </div>
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
</style>
