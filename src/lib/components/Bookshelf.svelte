<script lang="ts">
    import { onMount, tick } from 'svelte';
    import { goto } from '$app/navigation';

    let {
        books = [],
        currentUserId = null,
        showActions = false,
        selectedBookId = $bindable(''),
        onPromptSelect = null,
        onEditBook = null,
        onDeleteBook = null,
        onDownloadBook = null,
        fromPage = 'home',
        booksParam = '',
        titleParam = '',
        logoParam = ''
    } = $props();

    let measureElements = $state<HTMLDivElement[]>([]);
    let shelfRows = $state<any[][]>([]);

    function recalculateRows() {
        if (!books || books.length === 0) {
            shelfRows = [];
            return;
        }

        if (measureElements.length === 0) {
            shelfRows = [books];
            return;
        }

        const rowsMap = new Map<number, any[]>();
        measureElements.forEach((el, index) => {
            if (!el) return;
            const offset = el.offsetTop;
            if (!rowsMap.has(offset)) {
                rowsMap.set(offset, []);
            }
            rowsMap.get(offset)!.push(books[index]);
        });

        const sortedOffsets = Array.from(rowsMap.keys()).sort((a, b) => a - b);
        shelfRows = sortedOffsets.map(offset => rowsMap.get(offset)!);
    }

    onMount(() => {
        tick().then(() => {
            recalculateRows();
        });

        window.addEventListener('resize', recalculateRows);
        return () => {
            window.removeEventListener('resize', recalculateRows);
        };
    });

    $effect(() => {
        if (books) {
            tick().then(() => {
                recalculateRows();
            });
        }
    });

    function normalizePath(url: string): string {
        if (!url) return '';
        const trimmed = url.trim();
        if (trimmed.startsWith('books/') && !trimmed.startsWith('/')) {
            return '/' + trimmed;
        }
        return trimmed;
    }

    function handleBookClick(bookId: string) {
        const params = new URLSearchParams();
        params.set('from', fromPage);
        if (booksParam) params.set('books', booksParam);
        if (titleParam) params.set('title', titleParam);
        if (logoParam) params.set('logo', logoParam);
        goto(`/hyperbook/${bookId}?${params.toString()}`);
    }
</script>

<div class="shelf-container" id="shelfContainer">
    {#each shelfRows as rowBooks}
        <div class="shelf-row">
            <div class="shelf-books-area">
                {#each rowBooks as book}
                    <div class="book-item-wrapper">
                        {#if showActions}
                            <div class="book-action-bar">
                                <button 
                                    class="action-btn prompt-btn" 
                                    class:selected={selectedBookId === book.id}
                                    onclick={() => onPromptSelect?.(book)}
                                >
                                    Prompt
                                </button>
                                {#if !book.isSample && currentUserId && book.userId === currentUserId}
                                    <button 
                                        class="action-btn edit-btn icon-btn" 
                                        onclick={() => onEditBook?.(book)}
                                        title="Edit"
                                    >
                                        ✍️
                                    </button>
                                    <button 
                                        class="action-btn delete-btn icon-btn" 
                                        onclick={() => onDeleteBook?.(book)}
                                        title="Delete"
                                    >
                                        🗑️
                                    </button>
                                {/if}
                                {#if !book.isSample}
                                    <button 
                                        class="action-btn download-btn icon-btn" 
                                        onclick={() => onDownloadBook?.(book)}
                                        title="Download"
                                    >
                                        💾
                                    </button>
                                {/if}
                            </div>
                        {/if}

                        <div 
                            class="book-item" 
                            class:is-card={book.isCard}
                            onclick={() => handleBookClick(book.id)}
                            onkeydown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    handleBookClick(book.id);
                                }
                            }}
                            role="button"
                            tabindex="0"
                        >
                            {#if book.isCard}
                                <div class="book-cover card-cover" data-theme-color={book.themeColor || 'white'}>
                                    <div class="card-cover-title">{book.title}</div>
                                    {#if book.coverImage}
                                        <img 
                                            src={normalizePath(book.coverImage)} 
                                            alt={book.title} 
                                            class="card-cover-img" 
                                            onerror={(e) => (e.currentTarget as HTMLImageElement).style.display = 'none'}
                                        />
                                    {:else}
                                        <div class="card-cover-placeholder"></div>
                                    {/if}
                                    {#if book.subTitle}
                                        <div class="card-cover-subtitle">{book.subTitle}</div>
                                    {/if}
                                </div>
                            {:else}
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
                                        <div class="book-cover-author">
                                            {book.author}
                                        </div>
                                    {/if}
                                </div>
                            {/if}
                            <div class="book-tooltip">
                                <h4>{book.title}</h4>
                                {#if book.isCard && book.subTitle}
                                    <p>{book.subTitle}</p>
                                  {:else if book.author}
                                    <p>
                                        {book.author}
                                    </p>
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

<!-- Hidden Measure Container to detect shelf wrap points -->
<div class="measure-container">
    {#each books as book, idx}
        <div class="measure-book" bind:this={measureElements[idx]}></div>
    {/each}
</div>

<style>
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

    /* --- Action Bar (Prompt, Edit, Delete, Download) --- */
    .book-item-wrapper {
        display: flex;
        flex-direction: column;
        align-items: center;
        margin-bottom: 2px;
    }

    .book-action-bar {
        display: flex;
        gap: 3px;
        margin-bottom: 8px;
        width: 110px;
        align-items: center;
        justify-content: center;
        position: relative;
        z-index: 30;
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

    :global([data-theme="light"]) .action-btn {
        border-color: rgba(0, 0, 0, 0.15);
        background: rgba(0, 0, 0, 0.05);
        color: #3d2516;
    }

    :global([data-theme="light"]) .action-btn:hover {
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

    .book-item.is-card {
        transform-style: flat !important;
    }

    .book-item::before {
        content: ""; position: absolute; top: 0; right: -6px; width: 6px; height: 100%;
        background: var(--shelf-wood-dark);
        transform: rotateY(90deg); transform-origin: left;
        box-shadow: inset -1px 0 3px rgba(0,0,0,0.5);
        border-radius: 0 2px 2px 0;
    }

    .book-item.is-card::before {
        display: none !important;
    }

    .book-item.is-card .book-cover {
        border-radius: 8px !important;
        box-shadow: 0 4px 10px rgba(0,0,0,0.15) !important;
        display: flex !important;
        flex-direction: column !important;
        justify-content: space-between !important;
        padding: 10px 8px !important;
    }

    .book-item.is-card:hover {
        transform: translateY(-12px) !important;
    }

    .book-item.is-card:hover .book-cover {
        box-shadow: 0 8px 18px rgba(0,0,0,0.25) !important;
    }

    .card-cover-title {
        font-size: 0.65rem;
        font-weight: 800;
        color: inherit;
        line-height: 1.2;
        margin-bottom: 4px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        width: 100%;
        text-align: center;
        font-family: system-ui, -apple-system, sans-serif;
    }

    .card-cover-img {
        width: 90%;
        height: 75px;
        object-fit: cover;
        border-radius: 4px;
        margin: auto 0;
    }

    .card-cover-placeholder {
        flex-grow: 1;
    }

    .card-cover-subtitle {
        font-size: 0.55rem;
        opacity: 0.75;
        color: inherit;
        line-height: 1.2;
        margin-top: 4px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        width: 100%;
        text-align: center;
        font-family: system-ui, -apple-system, sans-serif;
    }

    .book-cover {
        width: 100%; height: 100%;
        background-color: var(--book-cover-bg);
        color: white;
        border-radius: 2px 4px 4px 2px;
        box-shadow: 3px 3px 0 #bbb, 5px 5px 0 #161616, 7px 9px 10px rgba(0,0,0,0.4);
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
        box-shadow: 3px 3px 0 #bbb, 5px 5px 0 #161616, 7px 9px 10px rgba(0, 0, 0, 0.25), inset 0 2px 3px rgba(255, 255, 255, 1), inset 0 -2px 3px rgba(0, 0, 0, 0.1);
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
        box-shadow: 3px 3px 0 #bbb, 5px 5px 0 #161616, 7px 9px 10px rgba(0, 0, 0, 0.4), inset 0 2px 3px rgba(255, 255, 255, 0.15);
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
        box-shadow: 3px 3px 0 #bbb, 5px 5px 0 #161616, 7px 9px 10px rgba(0, 0, 0, 0.25), inset 0 2px 3px rgba(255, 255, 255, 0.6);
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
        box-shadow: 3px 3px 0 #bbb, 5px 5px 0 #2e1605, 7px 9px 10px rgba(0, 0, 0, 0.5), inset 0 0 10px rgba(0, 0, 0, 0.4);
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

    /* Hover - Left exactly as it was in +page.svelte */
    .book-item:hover {
        transform: translateY(-12px) translateZ(10px) rotateY(-8deg);
        z-index: 20;
    }
    
    .book-item:hover .book-cover {
        box-shadow: 2px 2px 0 #bbb, 4px 4px 0 #161616, 10px 14px 22px rgba(0,0,0,0.5);
    }

    /* Tooltip */
    .book-tooltip {
        position: absolute; bottom: 105%; left: 50%;
        transform: translateX(-50%) translateY(10px);
        background: rgba(26, 18, 11, 0.95);
        color: #f5ebe0; padding: 6px 12px; border-radius: 6px;
        font-size: 0.75rem; width: 140px; text-align: center;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        pointer-events: none; opacity: 0;
        transition: opacity 0.3s, transform 0.3s;
        z-index: 100; box-sizing: border-box;
        border: 1px solid rgba(255, 255, 255, 0.15);
        font-family: system-ui, -apple-system, sans-serif;
    }
    .book-tooltip h4 { margin: 0 0 3px 0; font-size: 0.8rem; font-weight: bold; }
    .book-tooltip p { margin: 0; opacity: 0.8; font-size: 0.7rem; }

    .book-item:hover .book-tooltip {
        opacity: 1; transform: translateX(-50%) translateY(0);
    }
    
    .book-item:hover .book-cover[data-theme-color="white"] {
        box-shadow: 3px 3px 0 #bbb, 5px 5px 0 #161616, 11px 15px 22px rgba(0, 0, 0, 0.35), inset 0 2px 3px rgba(255, 255, 255, 1), inset 0 -2px 3px rgba(0, 0, 0, 0.1);
    }
    
    .book-item:hover .book-cover[data-theme-color="blue"] {
        box-shadow: 3px 3px 0 #bbb, 5px 5px 0 #161616, 11px 15px 22px rgba(0, 0, 0, 0.5), inset 0 2px 3px rgba(255, 255, 255, 0.15);
    }
    
    .book-item:hover .book-cover[data-theme-color="pink"] {
        box-shadow: 3px 3px 0 #bbb, 5px 5px 0 #161616, 11px 15px 22px rgba(0, 0, 0, 0.35), inset 0 2px 3px rgba(255, 255, 255, 0.6);
    }
    
    .book-item:hover .book-cover[data-theme-color="gold"] {
        box-shadow: 3px 3px 0 #bbb, 5px 5px 0 #2e1605, 11px 15px 22px rgba(0, 0, 0, 0.6), inset 0 0 10px rgba(0, 0, 0, 0.4);
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
        
        .book-tooltip {
            width: 110px;
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
