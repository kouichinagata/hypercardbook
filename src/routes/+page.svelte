<script lang="ts">
    import { onMount, tick } from 'svelte';
    import { goto, invalidateAll } from '$app/navigation';
    import { createBrowserClient } from '@supabase/ssr';
    import { env } from '$env/dynamic/public';

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
    let textareaEl = $state<HTMLTextAreaElement | null>(null);

    // Bookshelf grid states
    let uiTheme = $state('dark');
    let measureElements = $state<HTMLDivElement[]>([]);
    let shelfRows = $state<any[][]>([]);

    onMount(() => {
        const saved = localStorage.getItem('shelf-theme');
        if (saved) {
            uiTheme = saved;
        }

        tick().then(() => {
            recalculateRows();
        });

        window.addEventListener('resize', recalculateRows);
        return () => {
            window.removeEventListener('resize', recalculateRows);
        };
    });

    function toggleTheme() {
        uiTheme = uiTheme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('shelf-theme', uiTheme);
    }

    function recalculateRows() {
        if (!data.books || data.books.length === 0) {
            shelfRows = [];
            return;
        }

        if (measureElements.length === 0) {
            shelfRows = [data.books];
            return;
        }

        const rowsMap = new Map<number, any[]>();
        measureElements.forEach((el, index) => {
            if (!el) return;
            const offset = el.offsetTop;
            if (!rowsMap.has(offset)) {
                rowsMap.set(offset, []);
            }
            rowsMap.get(offset)!.push(data.books[index]);
        });

        const sortedOffsets = Array.from(rowsMap.keys()).sort((a, b) => a - b);
        shelfRows = sortedOffsets.map(offset => rowsMap.get(offset)!);
    }

    // Reactively update shelfRows when loaded books data changes
    $effect(() => {
        if (data.books) {
            tick().then(() => {
                recalculateRows();
            });
        }
    });

    // Handle prompt selection context toggles
    function handlePromptSelect(book: any) {
        if (selectedBookId === book.id) {
            selectedBookId = '';
        } else {
            selectedBookId = book.id;
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
        const encodedPrompt = encodeURIComponent(prompt.trim());
        let targetUrl = `/workspace?prompt=${encodedPrompt}`;
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

    function normalizePath(url: string): string {
        if (!url) return '';
        const trimmed = url.trim();
        if (trimmed.startsWith('books/') && !trimmed.startsWith('/')) {
            return '/' + trimmed;
        }
        return trimmed;
    }

    // Computed placeholder text based on book context selection
    let placeholderText = $derived(
        selectedBookId 
            ? "Please enter the prompt to create the book. (Based on selected book's settings)" 
            : "Please enter the prompt to create the book."
    );
</script>

<div class="landing-container" data-theme={uiTheme}>
    <!-- Hidden Measure Container to detect shelf wrap points -->
    <div class="measure-container">
        {#each data.books as book, idx}
            <div class="measure-book" bind:this={measureElements[idx]}></div>
        {/each}
    </div>

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
            <textarea
                bind:this={textareaEl}
                bind:value={prompt}
                placeholder={placeholderText}
                required
                rows="4"
                disabled={isSubmitting}
            ></textarea>
            
            <button type="submit" class="submit-btn" disabled={isSubmitting}>
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
            <div class="shelf-container" id="shelfContainer">
                {#each shelfRows as rowBooks}
                    <div class="shelf-row">
                        <div class="shelf-books-area">
                            {#each rowBooks as book}
                                <div class="book-item-wrapper">
                                    <!-- Prompt, Edit, Delete, Download Buttons positioned above the book cover -->
                                    <div class="book-action-bar">
                                        <button 
                                            class="action-btn prompt-btn" 
                                            class:selected={selectedBookId === book.id}
                                            onclick={() => handlePromptSelect(book)}
                                        >
                                            Prompt
                                        </button>
                                        {#if data.currentUserId && book.userId === data.currentUserId}
                                            <button 
                                                class="action-btn edit-btn icon-btn" 
                                                onclick={() => handleEditBook(book)}
                                                title="Edit"
                                            >
                                                ✍️
                                            </button>
                                            <button 
                                                class="action-btn delete-btn icon-btn" 
                                                onclick={() => handleDeleteBook(book)}
                                                title="Delete"
                                            >
                                                🗑️
                                            </button>
                                        {/if}
                                        <button 
                                            class="action-btn download-btn icon-btn" 
                                            onclick={() => handleDownloadBook(book)}
                                            title="Download"
                                        >
                                            💾
                                        </button>
                                    </div>

                                    <!-- Interactive 3D Book Cover -->
                                    <div 
                                        class="book-item" 
                                        onclick={() => goto(`/hyperbook/${book.id}?from=home`)}
                                        onkeydown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                goto(`/hyperbook/${book.id}?from=home`);
                                            }
                                        }}
                                        role="button"
                                        tabindex="0"
                                    >
                                        <div class="book-cover" data-theme-color={book.themeColor || 'black'}>
                                            {#if book.coverImage}
                                                <img 
                                                    src={normalizePath(book.coverImage)} 
                                                    alt={book.title} 
                                                    class="book-cover-img" 
                                                    onerror={(e) => (e.currentTarget as HTMLImageElement).style.display = 'none'}
                                                />
                                            {/if}
                                            <div class="book-cover-title">{book.title}</div>
                                            {#if book.author}
                                                <div class="book-cover-author">Author: {book.author}</div>
                                            {/if}
                                        </div>
                                        <div class="book-tooltip">
                                            <h4>{book.title}</h4>
                                            {#if book.author}
                                                <p>Author: {book.author}</p>
                                            {/if}
                                        </div>
                                    </div>
                                </div>
                            {/each}
                        </div>
                        <div class="shelf-board"></div>
                    </div>
                {/each}
            </div>
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

    .shelf-container {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 60px;
        perspective: 1000px;
        box-sizing: border-box;
    }

    .shelf-row {
        display: flex;
        flex-direction: column;
        position: relative;
        width: 100%;
    }

    .shelf-books-area {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
        gap: 30px; padding: 10px 40px 0;
        background-color: var(--shelf-back-color);
        box-sizing: border-box; min-height: 250px;
        align-items: end; justify-items: center;
        border-radius: 8px 8px 0 0;
        box-shadow: inset 0 -30px 40px rgba(0,0,0,0.4);
        border-bottom: 2px solid var(--shelf-wood-dark);
        transition: background-color 0.4s;
    }

    .shelf-board {
        position: relative; height: 16px;
        background: var(--shelf-wood-light);
        border-bottom: 6px solid var(--shelf-wood-dark);
        border-radius: 2px;
        box-shadow: 0 10px 20px var(--shelf-shadow);
        z-index: 10;
        width: 100%;
    }
    
    .shelf-board::before {
        content: ""; position: absolute; top: -8px; left: 0; right: 0; height: 8px;
        background: var(--shelf-wood-top);
        transform: perspective(200px) rotateX(20deg);
        transform-origin: bottom;
    }

    .book-item-wrapper {
        display: flex;
        flex-direction: column;
        align-items: center;
        margin-bottom: 2px;
    }

    /* --- Action Panel Above Book --- */
    .book-action-bar {
        display: flex;
        gap: 3px;
        margin-bottom: 8px;
        width: 110px;
        align-items: center;
        justify-content: center;
    }

    .action-btn {
        height: 24px;
        padding: 0 4px;
        font-size: 9px;
        border-radius: 4px;
        cursor: pointer;
        border: 1px solid rgba(255, 255, 255, 0.15);
        background: rgba(255, 255, 255, 0.05);
        color: #f5ebe0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
        box-sizing: border-box;
        font-family: system-ui, sans-serif;
    }

    .action-btn.prompt-btn {
        padding: 0 6px;
        font-weight: 500;
        flex-shrink: 0;
    }

    .action-btn.icon-btn {
        width: 22px;
        height: 24px;
        font-size: 11px;
        flex-shrink: 0;
        padding: 0;
    }

    .action-btn:hover {
        background: rgba(255, 255, 255, 0.12);
    }

    .landing-container[data-theme="light"] .action-btn {
        border-color: rgba(0, 0, 0, 0.15);
        background: rgba(0, 0, 0, 0.05);
        color: #3d2516;
    }

    .landing-container[data-theme="light"] .action-btn:hover {
        background: rgba(0, 0, 0, 0.08);
    }

    .action-btn.prompt-btn.selected {
        background: #8b5cf6 !important;
        border-color: #8b5cf6 !important;
        color: #ffffff !important;
        font-weight: bold;
    }

    /* --- Book Item --- */
    .book-item {
        width: 110px; height: 160px;
        position: relative; cursor: pointer;
        transform-style: preserve-3d;
        transition: transform 0.4s cubic-bezier(0.165, 0.84, 0.44, 1), box-shadow 0.4s;
        z-index: 5;
        outline: none;
    }

    .book-item::before {
        content: ""; position: absolute; top: 0; right: -6px; width: 6px; height: 100%;
        background: var(--shelf-wood-dark);
        transform: rotateY(90deg); transform-origin: left;
        box-shadow: inset -1px 0 3px rgba(0,0,0,0.5);
        border-radius: 0 2px 2px 0;
    }

    .book-cover {
        width: 100%; height: 100%;
        background-color: var(--book-cover-bg);
        color: white;
        border-radius: 2px 4px 4px 2px;
        box-shadow: 2px 2px 0 #bbb, 4px 4px 0 #161616, 6px 8px 10px rgba(0,0,0,0.4);
        transition: 0.3s;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 8px;
        box-sizing: border-box;
        text-align: center;
        position: relative;
        overflow: hidden;
    }

    .book-cover-img {
        width: 85%;
        max-height: 70px;
        object-fit: contain;
        margin-bottom: 8px;
        transition: 0.3s;
    }

    .book-cover-title {
        font-size: 0.65rem;
        font-weight: bold;
        margin: 2px 0;
        color: white;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        line-height: 1.2;
        font-family: "游明朝", "Yu Mincho", "Hiragino Mincho ProN", serif;
    }

    .book-cover-author {
        font-size: 0.5rem;
        opacity: 0.8;
        color: white;
        margin-top: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        width: 90%;
        font-family: "游明朝", "Yu Mincho", "Hiragino Mincho ProN", serif;
    }

    /* --- Cover Theme Styles --- */
    .book-cover[data-theme-color="black"] {
        background-color: var(--book-cover-bg);
        color: #ffffff;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .book-cover[data-theme-color="black"] .book-cover-title {
        color: #ffffff;
    }
    .book-cover[data-theme-color="black"] .book-cover-author {
        color: rgba(255, 255, 255, 0.85);
    }

    .book-cover[data-theme-color="white"] {
        background: linear-gradient(135deg, #ffffff 0%, #f7f7f7 50%, #e3e3e3 100%);
        box-shadow: 2px 2px 0 #bbb, 4px 4px 0 #161616, 6px 8px 10px rgba(0, 0, 0, 0.25), inset 0 2px 3px rgba(255, 255, 255, 1), inset 0 -2px 3px rgba(0, 0, 0, 0.1);
        color: #1a1a1a;
        border: 1px solid rgba(0, 0, 0, 0.15);
    }
    .book-cover[data-theme-color="white"] .book-cover-title {
        color: #1a1a1a;
    }
    .book-cover[data-theme-color="white"] .book-cover-author {
        color: #555555;
    }

    .book-cover[data-theme-color="blue"] {
        background: linear-gradient(135deg, #0f2b5c 0%, #1e3c72 100%);
        box-shadow: 2px 2px 0 #bbb, 4px 4px 0 #161616, 6px 8px 10px rgba(0, 0, 0, 0.4), inset 0 2px 3px rgba(255, 255, 255, 0.15);
        color: #ffffff;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .book-cover[data-theme-color="blue"] .book-cover-title {
        color: #ffffff;
    }
    .book-cover[data-theme-color="blue"] .book-cover-author {
        color: rgba(255, 255, 255, 0.85);
    }

    .book-cover[data-theme-color="pink"] {
        background: linear-gradient(135deg, #ffdeed 0%, #ffb3d1 100%);
        box-shadow: 2px 2px 0 #bbb, 4px 4px 0 #161616, 6px 8px 10px rgba(0, 0, 0, 0.25), inset 0 2px 3px rgba(255, 255, 255, 0.6);
        color: #4a4a4a;
        border: 1px solid rgba(255, 179, 209, 0.4);
    }
    .book-cover[data-theme-color="pink"] .book-cover-title {
        color: #4a4a4a;
    }
    .book-cover[data-theme-color="pink"] .book-cover-author {
        color: #6a6a6a;
    }

    .book-cover[data-theme-color="gold"] {
        background: linear-gradient(135deg, #4e2f15 0%, #2e1605 100%);
        box-shadow: 2px 2px 0 #bbb, 4px 4px 0 #2e1605, 6px 8px 10px rgba(0, 0, 0, 0.5), inset 0 0 10px rgba(0, 0, 0, 0.4);
        border-left: 2px solid rgba(255, 215, 0, 0.35);
        color: #ffd700;
        border: 1px solid rgba(78, 47, 21, 0.4);
    }
    .book-cover[data-theme-color="gold"] .book-cover-title {
        color: #ffd700;
        text-shadow: 0 1px 2px rgba(0,0,0,0.8), 0 0 3px rgba(255, 215, 0, 0.3);
    }
    .book-cover[data-theme-color="gold"] .book-cover-author {
        color: #e6c300;
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

    /* Hidden Measure Container */
    .measure-container {
        position: absolute;
        visibility: hidden;
        pointer-events: none;
        left: 0;
        right: 0;
        width: 90%;
        max-width: 960px;
        margin: 0 auto;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
        gap: 30px;
        padding: 10px 40px 0;
        box-sizing: border-box;
        z-index: -100;
    }

    .measure-book {
        width: 110px;
        height: 160px;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }

    /* Mobile styles */
    @media (max-width: 600px) {
        .shelf-books-area {
            grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
            gap: 20px;
            padding: 10px 20px 0;
            min-height: 200px;
        }
        
        .book-item {
            width: 80px;
            height: 120px;
        }

        
        .book-cover {
            padding: 4px;
        }
        
        .book-cover-img {
            max-height: 50px;
            margin-bottom: 4px;
        }
        
        .book-cover-title {
            font-size: 0.55rem;
            line-height: 1.1;
        }
        
        .book-cover-author {
            font-size: 0.45rem;
        }

        .book-action-bar {
            width: 80px;
            gap: 2px;
        }

        .action-btn {
            height: 18px;
            font-size: 8px;
            padding: 0 3px;
        }

        .action-btn.prompt-btn {
            padding: 0 4px;
        }

        .action-btn.icon-btn {
            width: 16px;
            height: 18px;
            font-size: 9px;
        }

        .measure-container {
            grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
            gap: 20px;
            padding: 10px 20px 0;
        }
        .measure-book {
            width: 80px;
            height: 120px;
        }
    }
</style>
