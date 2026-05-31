<script lang="ts">
    import { onMount, tick } from 'svelte';
    import { goto, invalidateAll } from '$app/navigation';
    import { createBrowserClient } from '@supabase/ssr';
    import { env } from '$env/dynamic/public';
    import Bookshelf from '$lib/components/Bookshelf.svelte';

    let { data } = $props();

    // Initialize Supabase browser client for logout action
    const supabase = createBrowserClient(
        env.PUBLIC_SUPABASE_URL || '',
        env.PUBLIC_SUPABASE_ANON_KEY || ''
    );

    async function handleLogout() {
        const { error } = await supabase.auth.signOut();
        if (error) {
            console.error('Logout error:', error);
        } else {
            window.location.reload();
        }
    }

    // Prompt and Selection states
    let prompt = $state('');
    let isSubmitting = $state(false);
    let selectedBookId = $state('');
    let selectedMode = $state('book'); // 'book' or 'card'
    let textareaEl = $state<HTMLTextAreaElement | null>(null);

    // Bookshelf theme state
    let uiTheme = $state('dark');

    onMount(() => {
        const saved = localStorage.getItem('shelf-theme');
        if (saved) {
            uiTheme = saved;
        }
    });

    function toggleTheme() {
        uiTheme = uiTheme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('shelf-theme', uiTheme);
    }

    // Handle prompt selection context toggles
    function handlePromptSelect(book: any) {
        if (selectedBookId === book.id) {
            selectedBookId = '';
        } else {
            selectedBookId = book.id;
            selectedMode = book.isCard ? 'card' : 'book';
            tick().then(() => {
                if (textareaEl) {
                    textareaEl.focus();
                }
            });
        }
    }

    // Submit handler
    function handleSubmit(e: SubmitEvent) {
        e.preventDefault();
        if (!prompt.trim() || isSubmitting) return;

        isSubmitting = true;
        try {
            sessionStorage.setItem('workspace_init_prompt', prompt.trim());
        } catch (err) {
            console.error('Failed to store prompt in sessionStorage:', err);
        }
        let targetUrl = `/workspace?mode=${selectedMode}`;
        if (selectedBookId) {
            targetUrl += `&id=${selectedBookId}`;
        }
        goto(targetUrl);
    }

    // Edit handler
    function handleEditBook(book: any) {
        goto(`/workspace?id=${book.id}`);
    }

    // Delete handler
    async function handleDeleteBook(book: any) {
        if (!confirm(`Are you sure you want to delete "${book.title}"?`)) return;

        try {
            const response = await fetch('/api/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: book.id })
            });

            if (response.ok) {
                await invalidateAll();
                if (selectedBookId === book.id) {
                    selectedBookId = '';
                }
            } else {
                const errData = await response.json();
                alert(`Failed to delete: ${errData.error}`);
            }
        } catch (err) {
            console.error('Delete book error:', err);
            alert('An error occurred during deletion.');
        }
    }

    // Download handler
    async function handleDownloadBook(book: any) {
        try {
            const { data, error } = await supabase
                .from('books')
                .select('markdown_content')
                .eq('id', book.id)
                .single();

            if (error || !data?.markdown_content) {
                alert('Failed to find download data.');
                return;
            }

            const blob = new Blob([data.markdown_content], { type: 'text/markdown;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${book.title || 'book'}.md`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Download book error:', err);
            alert('An error occurred during download.');
        }
    }



</script>

<div class="landing-container" data-theme={uiTheme}>
    <!-- Theme switch and login/logout buttons at top right -->
    <div class="theme-switch-container">
        {#if data.session?.user}
            <div class="user-profile">
                {#if data.session.user.user_metadata?.avatar_url}
                    <img 
                        src={data.session.user.user_metadata.avatar_url} 
                        alt="User Avatar" 
                        class="user-avatar" 
                        referrerpolicy="no-referrer"
                    />
                {/if}
                <span class="user-name">
                    {data.session.user.user_metadata?.full_name || data.session.user.user_metadata?.name || 'User'}
                </span>
            </div>
            <button class="theme-switch logout-btn" onclick={handleLogout}>
                Logout
            </button>
        {:else}
            <button class="theme-switch login-btn" onclick={() => goto('/login')}>
                Login
            </button>
        {/if}
        <button class="theme-switch" onclick={toggleTheme}>
            {uiTheme === 'dark' ? '☀️' : '🌙'}
        </button>
    </div>

    <!-- Prompt input box repositioned slightly higher -->
    <div class="landing-panel">
        <h1 class="title">HyperCardBook</h1>
        <p class="subtitle">HyperCardBook is an AI for generating Markdown ebooks.</p>

        <form onsubmit={handleSubmit} class="prompt-form">
            <div class="prompt-textarea-wrapper">
                <textarea
                    bind:this={textareaEl}
                    bind:value={prompt}
                    placeholder="Please enter the prompt to create the book."
                    required
                    rows="4"
                    disabled={!data.currentUserId || isSubmitting}
                ></textarea>
                <div class="mode-toggle-container">
                    <label class="mode-toggle-label">
                        <input type="radio" name="mode" value="book" bind:group={selectedMode} disabled={!data.currentUserId || isSubmitting} />
                        <span>Book</span>
                    </label>
                    <label class="mode-toggle-label">
                        <input type="radio" name="mode" value="card" bind:group={selectedMode} disabled={!data.currentUserId || isSubmitting} />
                        <span>Card</span>
                    </label>
                </div>
            </div>
            
            <button type="submit" class="submit-btn" disabled={!data.currentUserId || isSubmitting || !prompt.trim()}>
                {#if isSubmitting}
                    <div class="spinner"></div>
                {:else}
                    Run
                {/if}
            </button>
        </form>
    </div>

    <!-- 3D wooden bookshelf displayed directly on the landing page -->
    <div class="bookshelf-section">
        {#if !data.books || data.books.length === 0}
            <div class="empty-shelf">
                <p>本棚にはまだ本がありません。プロンプトを入力して生成してください。</p>
            </div>
        {:else}
            <Bookshelf
                books={data.books}
                currentUserId={data.currentUserId}
                showActions={true}
                bind:selectedBookId={selectedBookId}
                onPromptSelect={handlePromptSelect}
                onEditBook={handleEditBook}
                onDeleteBook={handleDeleteBook}
                onDownloadBook={handleDownloadBook}
                fromPage="home"
            />
        {/if}
    </div>
</div>

<style>
    .landing-container {
        --bg-color: #0b0c10;
        --shelf-back-color: #1e130c;
        --text-color: #f5ebe0;
        --shelf-wood-dark: #1f1007;
        --shelf-wood-light: #3a1f0e;
        --shelf-wood-top: #542f17;
        --shelf-shadow: rgba(0, 0, 0, 0.85);
        --card-bg: rgba(255, 255, 255, 0.05);
        --card-border: rgba(255, 255, 255, 0.1);
        --book-cover-bg: #161616;

        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        width: 100vw;
        min-height: 100vh;
        background-color: var(--bg-color);
        transition: background 0.4s, color 0.4s;
        box-sizing: border-box;
        overflow-x: hidden;
        padding-bottom: 60px;
    }

    .landing-container[data-theme="light"] {
        --bg-color: #f4eae1;
        --shelf-back-color: #e6ccb2;
        --text-color: #3d2516;
        --shelf-wood-dark: #5c3a21;
        --shelf-wood-light: #8b5a2b;
        --shelf-wood-top: #b07d4f;
        --shelf-shadow: rgba(61, 37, 22, 0.3);
        --card-bg: rgba(0, 0, 0, 0.03);
        --card-border: rgba(0, 0, 0, 0.08);
        --book-cover-bg: #1c1c1c;
    }

    /* --- Theme Switch Button --- */
    .theme-switch-container {
        position: absolute; top: 20px; right: 20px;
        z-index: 1000;
        display: flex;
        gap: 8px;
        align-items: center;
    }

    .user-profile {
        display: flex;
        align-items: center;
        gap: 8px;
        background: var(--card-bg);
        border: 1px solid var(--card-border);
        padding: 4px 12px 4px 4px;
        border-radius: 20px;
        backdrop-filter: blur(10px);
    }

    .user-avatar {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        object-fit: cover;
    }

    .user-name {
        font-size: 11px;
        color: var(--text-color);
        font-weight: 600;
        max-width: 100px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-family: system-ui, sans-serif;
    }

    .theme-switch {
        padding: 8px 16px; border-radius: 20px;
        border: 1px solid var(--text-color);
        background: var(--card-bg); color: var(--text-color);
        cursor: pointer; font-size: 12px; transition: 0.3s;
        backdrop-filter: blur(10px);
        font-family: system-ui, sans-serif;
    }
    .theme-switch:hover {
        opacity: 0.8; transform: scale(1.05);
    }

    /* --- Prompt Input Box --- */
    .landing-panel {
        width: 90%;
        max-width: 500px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.08);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        padding: 30px;
        border-radius: 16px;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4);
        text-align: center;
        animation: fadeIn 0.5s ease-out forwards;
        margin-top: 60px;
        margin-bottom: 40px;
        box-sizing: border-box;
    }

    .landing-container[data-theme="light"] .landing-panel {
        background: rgba(0, 0, 0, 0.02);
        border: 1px solid rgba(0, 0, 0, 0.08);
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.06);
    }

    .title {
        font-family: 'Outfit', sans-serif;
        font-size: 32px;
        font-weight: 800;
        letter-spacing: -0.02em;
        margin: 0 0 8px 0;
        color: var(--text-color);
    }

    .subtitle {
        font-size: 14px;
        color: var(--text-color);
        opacity: 0.6;
        margin: 0 0 30px 0;
    }

    .prompt-form {
        display: flex;
        flex-direction: column;
        gap: 20px;
    }

    textarea {
        width: 100%;
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        padding: 14px;
        color: #ffffff;
        font-size: 14px;
        line-height: 1.5;
        resize: none;
        outline: none;
        transition: border-color 0.3s;
        box-sizing: border-box;
    }

    .landing-container[data-theme="light"] textarea {
        background: rgba(255, 255, 255, 0.8);
        border: 1px solid rgba(0, 0, 0, 0.15);
        color: #3d2516;
    }

    textarea:focus {
        border-color: #8b5cf6;
    }

    .prompt-textarea-wrapper {
        position: relative;
        width: 100%;
        display: flex;
        flex-direction: column;
    }

    .mode-toggle-container {
        position: absolute;
        bottom: 12px;
        right: 12px;
        display: flex;
        background: rgba(0, 0, 0, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 20px;
        padding: 2px;
        gap: 2px;
        z-index: 10;
    }

    .landing-container[data-theme="light"] .mode-toggle-container {
        background: rgba(255, 255, 255, 0.9);
        border: 1px solid rgba(0, 0, 0, 0.15);
    }

    .mode-toggle-label {
        display: flex;
        align-items: center;
        cursor: pointer;
    }

    .mode-toggle-label input {
        display: none;
    }

    .mode-toggle-label span {
        padding: 4px 12px;
        font-size: 11px;
        font-weight: 600;
        border-radius: 16px;
        color: #9ca3af;
        transition: all 0.2s;
        font-family: 'Outfit', sans-serif;
    }

    .mode-toggle-label input:checked + span {
        background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
        color: #ffffff;
        box-shadow: 0 2px 6px rgba(139, 92, 246, 0.4);
    }

    .submit-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 46px;
        background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
        border: none;
        border-radius: 8px;
        color: #ffffff;
        font-family: 'Outfit', sans-serif;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    }

    .submit-btn:hover:not(:disabled) {
        filter: brightness(1.1);
    }

    .submit-btn:disabled {
        opacity: 0.7;
        cursor: not-allowed;
    }

    /* --- Bookshelf Section --- */
    .bookshelf-section {
        width: 90%;
        max-width: 960px;
        display: flex;
        flex-direction: column;
        align-items: center;
        box-sizing: border-box;
    }

    .empty-shelf {
        font-size: 16px;
        opacity: 0.7;
        text-align: center;
        padding: 40px;
        color: var(--text-color);
    }

    .spinner {
        width: 18px;
        height: 18px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top-color: #ffffff;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }
</style>
