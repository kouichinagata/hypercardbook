<script lang="ts">
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import Bookshelf from '$lib/components/Bookshelf.svelte';

    let { data } = $props();

    let uiTheme = $state('dark');

    function parseStackMarkdown(markdown: string): Array<{ type: 'book' | 'card' | 'stack', id: string, title: string }> {
        const items: Array<{ type: 'book' | 'card' | 'stack', id: string, title: string }> = [];
        if (!markdown) return items;
        const lines = markdown.split('\n');
        lines.forEach(line => {
            const trimmed = line.trim();
            const match = trimmed.match(/^-\s*\[(.*?)\]\((book|card|stack):(.*)\)/);
            if (match) {
                const title = match[1];
                const type = match[2] as 'book' | 'card' | 'stack';
                const id = match[3].trim();
                items.push({ type, id, title });
            }
        });
        return items;
    }

    function handleStackClick(book: any) {
        const subItems = parseStackMarkdown(book.markdownContent || book.markdown_content || '');
        const itemIds = subItems.map(item => item.id);
        window.open(`/hyperbookshelf?books=${itemIds.join(',')}&title=${encodeURIComponent(book.title)}`, '_blank');
    }

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
</script>

<div class="bookshelf-wrapper" data-theme={uiTheme}>
    <div class="theme-switch-container">
        <button class="theme-switch" onclick={toggleTheme}>
            {uiTheme === 'dark' ? '☀️' : '🌙'}
        </button>
    </div>

    {#if data.booksParam}
        <div class="back-btn-container">
            <button class="back-btn" onclick={() => { if (window.history.length === 1 || window.opener) { window.close(); } else { goto('/'); } }}>back</button>
        </div>
    {/if}

    {#if data.logo || data.title}
        <div class="bookshelf-header">
            {#if data.logo}
                <img src={data.logo} alt="Logo" class="bookshelf-logo" />
            {/if}
            {#if data.title}
                <h1 class="bookshelf-title">{data.title}</h1>
            {/if}
        </div>
    {/if}

    {#if !data.books || data.books.length === 0}
        <div class="error-message" style="display: block; margin-top: 100px;">
            <strong>書籍の読み込みに失敗しました:</strong><br>
            書籍ファイルが見つかりません。作成画面から書籍を生成してください。
        </div>
    {:else}
        <Bookshelf
            books={data.books}
            showActions={false}
            fromPage="hyperbookshelf"
            booksParam={data.booksParam || ''}
            titleParam={data.title || ''}
            logoParam={data.logo || ''}
            onStackClick={handleStackClick}
        />
    {/if}
</div>

<style>
    .bookshelf-wrapper {
        --bg-color: #000000; /* ダークモードの背景色を黒に */
        --shelf-back-color: #1e130c; /* 棚の背面を濃い茶系に変更 */
        --text-color: #f5ebe0;
        --shelf-wood-dark: #1f1007; /* 濃い茶系 */
        --shelf-wood-light: #3a1f0e; /* 濃い茶系 */
        --shelf-wood-top: #542f17; /* 濃い茶系 */
        --shelf-shadow: rgba(0, 0, 0, 0.85); /* 影を強調 */
        --card-bg: rgba(255, 255, 255, 0.05);
        --card-border: rgba(255, 255, 255, 0.1);
        --book-cover-bg: #161616;

        margin: 0; padding: 0;
        background: var(--bg-color);
        color: var(--text-color);
        font-family: "游明朝", "Yu Mincho", "Hiragino Mincho ProN", serif;
        display: flex; flex-direction: column; align-items: center;
        min-height: 100vh; transition: background 0.4s, color 0.4s;
        overflow-x: hidden;
        width: 100vw;
        box-sizing: border-box;
    }

    .bookshelf-wrapper[data-theme="light"] {
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

    /* --- テーマ切り替えボタン --- */
    .theme-switch-container {
        position: absolute; top: 20px; right: 20px;
        z-index: 1000;
        display: flex;
        gap: 8px;
        align-items: center;
    }

    .theme-switch {
        padding: 8px 16px; border-radius: 20px;
        border: 1px solid var(--text-color);
        background: var(--card-bg); color: var(--text-color);
        cursor: pointer; font-size: 12px; transition: 0.3s;
        backdrop-filter: blur(10px);
        font-family: system-ui, sans-serif;
    }
    .theme-switch-container .theme-switch {
        height: 34px;
        padding: 0 16px;
        box-sizing: border-box;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--card-border);
        background: var(--card-bg);
    }
    .theme-switch:hover {
        opacity: 0.8; transform: scale(1.05);
    }

    /* --- ヘッダー（タイトル＆ロゴ）ゴシック体適用 --- */
    .bookshelf-header {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 15px;
        margin-top: 60px;
        margin-bottom: 20px;
        text-align: center;
        flex-wrap: wrap;
        font-family: system-ui, -apple-system, sans-serif;
    }

    .bookshelf-logo {
        max-height: 50px;
        max-width: 150px;
        object-fit: contain;
    }

    .bookshelf-title {
        font-size: 2rem;
        margin: 0;
        font-family: system-ui, -apple-system, sans-serif;
        color: var(--text-color);
        font-weight: bold;
    }

    /* --- Back Button --- */
    .back-btn-container {
        position: absolute;
        top: 20px;
        left: 20px;
        z-index: 1000;
    }

    .back-btn {
        padding: 8px 16px;
        border-radius: 20px;
        border: 1px solid var(--text-color);
        background: var(--card-bg);
        color: var(--text-color);
        cursor: pointer;
        font-size: 12px;
        transition: 0.3s;
        backdrop-filter: blur(10px);
        font-family: system-ui, sans-serif;
    }
    .back-btn:hover {
        opacity: 0.8;
        transform: scale(1.05);
    }

    /* --- エラー表示 --- */
    .error-message {
        background: rgba(231, 76, 60, 0.2);
        color: #e74c3c; border: 1px solid rgba(231, 76, 60, 0.3);
        padding: 10px 20px; border-radius: 8px; margin: 15px auto;
        max-width: 500px; width: 90%; font-size: 0.85rem; text-align: center;
    }
</style>
