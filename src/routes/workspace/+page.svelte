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
</script>

<div class="workspace-layout">
    <!-- Left Panel: Chat -->
    <div class="chat-panel">
        <div class="panel-header">
            <div class="header-left">
                <button class="back-home-btn" onclick={() => goto('/')}>← ホーム</button>
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
                placeholder="本を追加・改造するための指示を入力..."
                disabled={isGenerating}
            />
            <button type="submit" disabled={isGenerating || !currentInput.trim()}>
                送信
            </button>
        </form>
    </div>

    <!-- Right Panel: Editor / Preview -->
    <div class="preview-panel">
        <div class="panel-tabs">
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
                Source (Markdown)
            </button>
        </div>

        <div class="panel-body">
            <div class="preview-container" class:hidden={activeTab !== 'preview'}>
                {#if markdown}
                    <Book {markdown} />
                {:else}
                    <div class="empty-preview">
                        <div class="spinner"></div>
                        <p>本を生成しています。しばらくお待ちください...</p>
                    </div>
                {/if}
            </div>
            
            <textarea
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
        padding: 12px 20px 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        gap: 8px;
        background-color: #12131c;
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
</style>
