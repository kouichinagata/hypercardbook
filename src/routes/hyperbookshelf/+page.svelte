<script lang="ts">
    import { onMount, tick } from 'svelte';
    import { goto } from '$app/navigation';

    let { data } = $props();

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

    function normalizePath(url: string): string {
        if (!url) return '';
        const trimmed = url.trim();
        if (trimmed.startsWith('books/') && !trimmed.startsWith('/')) {
            return '/' + trimmed;
        }
        return trimmed;
    }
</script>

<div class="bookshelf-wrapper" data-theme={uiTheme}>
    <!-- Hidden Measure Container to detect wrap points -->
    <div class="measure-container">
        {#each data.books as book, idx}
            <div class="measure-book" bind:this={measureElements[idx]}></div>
        {/each}
    </div>

    <!-- Navigation Action Buttons (styled matching original themeBtn style) -->
    <div style="position: absolute; top: 20px; left: 20px; z-index: 1000;">
        <button class="theme-switch" onclick={() => goto('/')}>
            ← 作成画面
        </button>
    </div>

    <div class="theme-switch-container">
        <button class="theme-switch" onclick={toggleTheme}>
            {uiTheme === 'dark' ? '☀️' : '🌙'}
        </button>
    </div>

    {#if !data.books || data.books.length === 0}
        <div class="error-message" style="display: block; margin-top: 100px;">
            <strong>書籍の読み込みに失敗しました:</strong><br>
            書籍ファイルが見つかりません。作成画面から書籍を生成してください。
        </div>
    {:else}
        <div class="shelf-container" id="shelfContainer">
            {#each shelfRows as rowBooks}
                <div class="shelf-row">
                    <div class="shelf-books-area">
                        {#each rowBooks as book}
                            <div 
                                class="book-item" 
                                onclick={() => goto(`/hyperbook/${book.id}?from=hyperbookshelf`)}
                                onkeydown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        goto(`/hyperbook/${book.id}?from=hyperbookshelf`);
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
                                        <div class="book-cover-author">著者：{book.author}</div>
                                    {/if}
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

    /* --- 本棚コンテナ --- */
    .shelf-container {
        width: 90%; max-width: 960px;
        margin-top: 40px; margin-bottom: 60px;
        display: flex; flex-direction: column; gap: 60px;
        perspective: 1000px;
        box-sizing: border-box;
    }

    /* --- 個別の段 --- */
    .shelf-row {
        display: flex; flex-direction: column; position: relative;
        width: 100%;
    }

    /* 本を並べる床面 */
    .shelf-books-area {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
        gap: 30px; padding: 10px 40px 0;
        background-color: var(--shelf-back-color);
        box-sizing: border-box; min-height: 220px;
        align-items: end; justify-items: center;
        border-radius: 8px 8px 0 0;
        box-shadow: inset 0 -30px 40px rgba(0,0,0,0.4);
        border-bottom: 2px solid var(--shelf-wood-dark);
        transition: background-color 0.4s;
    }

    /* 3Dの棚板 (木製天板) */
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

    /* --- 本アイテム --- */
    .book-item {
        width: 110px; height: 160px;
        position: relative; cursor: pointer;
        margin-bottom: 2px;
        transform-style: preserve-3d;
        transition: transform 0.4s cubic-bezier(0.165, 0.84, 0.44, 1), box-shadow 0.4s;
        z-index: 5;
        outline: none;
    }

    /* 本の立体表現の厚み */
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

    /* --- カバーテーマのスタイル定義 --- */
    /* black (デフォルト) */
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

    /* white (光沢のある白) */
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

    /* blue (ビジネス、男の子向け) */
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

    /* pink (女性用、女の子向け) */
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

    /* gold (皮表紙風茶に金色タイトル) */
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


    /* --- エラー表示 --- */
    .error-message {
        background: rgba(231, 76, 60, 0.2);
        color: #e74c3c; border: 1px solid rgba(231, 76, 60, 0.3);
        padding: 10px 20px; border-radius: 8px; margin: 15px auto;
        max-width: 500px; width: 90%; font-size: 0.85rem; text-align: center;
    }

    /* Hidden Measure Container (detect wrap points) */
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

    /* レスポンシブ */
    @media (max-width: 600px) {
        .shelf-books-area { grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); gap: 20px; padding: 10px 20px 0; min-height: 180px;}
        .book-item { width: 80px; height: 120px; }
        .book-cover { padding: 4px; }
        .book-cover-img { max-height: 50px; margin-bottom: 4px; }
        .book-cover-title { font-size: 0.55rem; line-height: 1.1; }
        .book-cover-author { font-size: 0.45rem; }

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
