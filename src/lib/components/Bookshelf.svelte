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
        logoParam = '',
        showStackBtn = false,
        isStackSelection = false,
        selectedStackBookIds = [],
        onStackClick = null,
        onToggleSelection = null,
        onDuplicateStack = null,
        onToggleStackSelectionMode = null,
        showMoreBtn = false,
        onMoreClick = null,
        isPublicShelf = false,
        showPapeRoboBtn = false,
        showHyperRoboBtn = false,
        isHyperRoboSelection = false,
        selectedHyperRoboBookIds = [],
        onToggleHyperRoboSelectionMode = null,
        onHyperRoboClick = null
    } = $props();

    let displayBooks = $derived(showMoreBtn ? [...books, { id: 'more-btn-virtual', isMoreBtn: true, title: 'more…' }] : books);

    let measureElements = $state<HTMLDivElement[]>([]);
    let shelfRows = $state<any[][]>([]);

    function recalculateRows() {
        if (!displayBooks || displayBooks.length === 0) {
            shelfRows = [];
            return;
        }

        if (measureElements.length === 0) {
            shelfRows = [displayBooks];
            return;
        }

        const rowsMap = new Map<number, any[]>();
        measureElements.forEach((el, index) => {
            if (!el) return;
            const offset = el.offsetTop;
            if (!rowsMap.has(offset)) {
                rowsMap.set(offset, []);
            }
            rowsMap.get(offset)!.push(displayBooks[index]);
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
        if (displayBooks) {
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

    function handleBookClick(book: any) {
        const isCard = book.isCard;
        const bookId = book.id;

        const params = new URLSearchParams();
        params.set('from', fromPage);
        if (booksParam) params.set('books', booksParam);
        if (titleParam) params.set('title', titleParam);
        if (logoParam) params.set('logo', logoParam);
        
        const path = isCard ? `/hypercard/${bookId}` : `/hyperbook/${bookId}`;
        window.open(`${path}?${params.toString()}`, '_blank');
    }

    function handleItemClick(book: any) {
        if (isStackSelection) {
            onToggleSelection?.(book);
            return;
        }
        if (isHyperRoboSelection) {
            if (!book.isStack && book.playMode !== 'hyperrobo') {
                onToggleSelection?.(book);
            }
            return;
        }
        if (book.isStack) {
            onStackClick?.(book);
        } else if (book.playMode === 'hyperrobo') {
            onHyperRoboClick?.(book);
        } else if (book.playMode === 'paperobo' && book.launchUrl) {
            window.open(book.launchUrl, '_blank');
        } else {
            handleBookClick(book);
        }
    }

    // Initialize Supabase browser client for authentication sharing
    import { createBrowserClient } from '@supabase/ssr';
    import { env } from '$env/dynamic/public';

    const supabase = createBrowserClient(
        env.PUBLIC_SUPABASE_URL || '',
        env.PUBLIC_SUPABASE_ANON_KEY || ''
    );

    async function handlePapeRoboLaunch() {
        const { data: { session } } = await supabase.auth.getSession();
        let targetUrl = 'https://paperobo.hypercardbook.org/ai'; // Production URL

        if (typeof window !== 'undefined') {
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                targetUrl = 'http://localhost:5180/ai'; // Local development URL
            }
        }

        if (session) {
            const accessToken = session.access_token;
            const refreshToken = session.refresh_token;
            // Append token in hash fragment to securely pass it to PapeRobo
            window.open(`${targetUrl}#access_token=${encodeURIComponent(accessToken)}&refresh_token=${encodeURIComponent(refreshToken)}`, '_blank');
        } else {
            window.open(targetUrl, '_blank');
        }
    }
</script>


<div class="shelf-container" id="shelfContainer">
    {#if currentUserId && (showPapeRoboBtn || showHyperRoboBtn || showStackBtn)}
        <div class="top-shelf-actions">
            {#if showPapeRoboBtn}
                <button 
                    type="button" 
                    class="top-shelf-paperobo-btn" 
                    onclick={handlePapeRoboLaunch}
                >
                    🧸 PapeRobo
                </button>
            {/if}

            {#if showHyperRoboBtn}
                <button 
                    type="button" 
                    class="top-shelf-hyperrobo-btn" 
                    onclick={() => onToggleHyperRoboSelectionMode?.()}
                >
                    {isHyperRoboSelection ? 'Cancel' : '🤖 HyperRobo'}
                </button>
            {/if}

            {#if showStackBtn}
                <button 
                    type="button" 
                    class="top-shelf-stack-btn" 
                    onclick={() => onToggleStackSelectionMode?.()}
                >
                    {isStackSelection ? 'Cancel' : '🗒️ Stack'}
                </button>
            {/if}
        </div>
    {/if}

    {#each shelfRows as rowBooks, rowIndex}
        <div class="shelf-row">
            <div class="shelf-books-area">
                {#each rowBooks as book (book.id)}
                    <div class="book-item-wrapper">
                        {#if book.isMoreBtn}
                            <div 
                                class="book-item is-more-btn" 
                                onclick={() => onMoreClick?.()}
                                onkeydown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        onMoreClick?.();
                                    }
                                }}
                                role="button"
                                tabindex="0"
                            >
                                <div class="book-cover more-cover">
                                    <div class="more-icon">📖</div>
                                    <div class="more-text">more…</div>
                                </div>
                            </div>
                        {:else}
                            {#if showActions && !isStackSelection && !isHyperRoboSelection}
                                <div class="book-action-bar">
                                    {#if book.isSample || book.isPublic || (currentUserId && book.userId === currentUserId) || book.isStack}
                                        <button 
                                            class={(book.playMode === 'paperobo' || book.playMode === 'hyperrobo' || (book.isStack && isPublicShelf)) ? 'paperobo-action-btn prompt-btn' : 'action-btn prompt-btn'} 
                                            class:selected={selectedBookId === book.id}
                                            onclick={() => {
                                                if (book.isStack) {
                                                    onDuplicateStack?.(book);
                                                } else {
                                                    onPromptSelect?.(book);
                                                }
                                            }}
                                            disabled={(!currentUserId && !book.isStack) || (book.isStack && isPublicShelf) || book.playMode === 'paperobo' || book.playMode === 'hyperrobo'}
                                        >
                                            {book.isStack ? 'Duplicate' : 'Prompt'}
                                        </button>
                                    {/if}
                                    {#if !book.isSample && currentUserId && book.userId === currentUserId && !isPublicShelf}
                                        <button 
                                            class={(book.playMode === 'paperobo' || book.playMode === 'hyperrobo') ? 'paperobo-action-btn edit-btn icon-btn' : 'action-btn edit-btn icon-btn'} 
                                            onclick={() => onEditBook?.(book)}
                                            title={book.isStack ? 'Edit Stack' : 'Edit'}
                                            disabled={book.playMode === 'paperobo'}
                                        >
                                            ✍️
                                        </button>
                                        <button 
                                            class={(book.playMode === 'paperobo' || book.playMode === 'hyperrobo') ? 'paperobo-action-btn delete-btn icon-btn' : 'action-btn delete-btn icon-btn'} 
                                            onclick={() => onDeleteBook?.(book)}
                                            title="Delete"
                                            disabled={book.playMode === 'paperobo'}
                                        >
                                            🗑️
                                        </button>
                                    {/if}
                                    {#if !book.isSample && currentUserId && book.userId === currentUserId && !isPublicShelf}
                                        <button 
                                            class={(book.playMode === 'paperobo' || book.playMode === 'hyperrobo') ? 'paperobo-action-btn download-btn icon-btn' : 'action-btn download-btn icon-btn'} 
                                            onclick={() => onDownloadBook?.(book)}
                                            title="Download"
                                            disabled={book.playMode === 'paperobo' || book.playMode === 'hyperrobo'}
                                        >
                                            💾
                                        </button>
                                    {/if}
                                </div>
                            {/if}

                            <div 
                                class="book-item" 
                                class:is-card={book.isCard}
                                class:is-stack={book.isStack}
                                class:is-phone={book.playMode === 'paperobo'}
                                class:selected-in-selection={(isStackSelection && selectedStackBookIds.includes(book.id)) || (isHyperRoboSelection && selectedHyperRoboBookIds.includes(book.id))}
                                class:unselectable-in-selection={isHyperRoboSelection && (book.isStack || book.playMode === 'hyperrobo')}
                                onclick={() => handleItemClick(book)}
                                onkeydown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        handleItemClick(book);
                                    }
                                }}
                                role="button"
                                tabindex="0"
                            >
                                {#if book.playMode === 'paperobo'}
                                    <div class="book-cover paperobo-phone-cover">
                                        <div class="phone-bezel">
                                            <!-- スマホステータスバー -->
                                            <div class="phone-status-bar">
                                                <span class="phone-time">17:37</span>
                                                <div class="phone-notch"></div>
                                                <span class="phone-network">5G 100%</span>
                                            </div>

                                            {#if book.coverImage}
                                                <img 
                                                    src={normalizePath(book.coverImage)} 
                                                    alt={book.title} 
                                                    class="phone-screen-img" 
                                                    onerror={(e) => (e.currentTarget as HTMLImageElement).style.display = 'none'}
                                                />
                                            {/if}

                                            <!-- 通話中ステータス -->
                                            <div class="phone-call-status">
                                                <div class="phone-avatar-name">
                                                    <span class="phone-username">{book.title}</span>
                                                </div>
                                                <div class="phone-call-duration">通話中 ・ 00:02</div>
                                            </div>

                                            <!-- 右下のアクションボタン (緑・赤) -->
                                            <div class="phone-action-buttons">
                                                <div class="phone-icon-btn phone-btn-green">
                                                    <span class="btn-icon">📹</span>
                                                </div>
                                                <div class="phone-icon-btn phone-btn-red">
                                                    <span class="btn-icon">✕</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                {:else if book.playMode === 'hyperrobo' && book.hideHyperbook}
                                    {@const pairedBook = books.find(b => b.id === book.hyperbookId || b.slug === book.hyperbookId)}
                                    <!-- 逆版のHyperRoboカバー（PapeRoboと同一、一切省略しない） -->
                                    <div class="book-cover paperobo-phone-cover">
                                        <div class="phone-bezel">
                                            <!-- スマホステータスバー -->
                                            <div class="phone-status-bar">
                                                <span class="phone-time">17:37</span>
                                                <div class="phone-notch"></div>
                                                <span class="phone-network">5G 100%</span>
                                            </div>

                                            {#if book.coverImage}
                                                <img 
                                                    src={normalizePath(book.coverImage)} 
                                                    alt={book.title} 
                                                    class="phone-screen-img" 
                                                    onerror={(e) => (e.currentTarget as HTMLImageElement).style.display = 'none'}
                                                />
                                            {/if}

                                            <!-- 左上ぴったりの縮小されたオレンジの本の表紙 -->
                                            <div class="mini-book-overlay">
                                                <div class="mini-book-cover" style="background-color: #e67e22;">
                                                    {#if pairedBook && pairedBook.coverImage}
                                                        <img src={normalizePath(pairedBook.coverImage)} alt="" class="mini-book-img" />
                                                    {/if}
                                                    <div class="mini-book-title">{pairedBook ? pairedBook.title : book.title}</div>
                                                </div>
                                            </div>

                                            <!-- 通話中ステータス -->
                                            <div class="phone-call-status">
                                                <div class="phone-avatar-name">
                                                    <span class="phone-username">{book.title}</span>
                                                </div>
                                                <div class="phone-call-duration">通話中 ・ 00:02</div>
                                            </div>

                                            <!-- 右下のアクションボタン (緑・赤) -->
                                            <div class="phone-action-buttons">
                                                <div class="phone-icon-btn phone-btn-green">
                                                    <span class="btn-icon">📹</span>
                                                </div>
                                                <div class="phone-icon-btn phone-btn-red">
                                                    <span class="btn-icon">✕</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                {:else if book.playMode === 'hyperrobo'}
                                    <div class="book-cover hyperrobo-cover" style="background: linear-gradient(135deg, #ca6f1e 0%, #873a00 100%);">
                                        {#if book.coverImage}
                                            <div class="hyperrobo-phone-wrapper">
                                                <img 
                                                    src={normalizePath(book.coverImage)} 
                                                    alt={book.title} 
                                                    class="hyperrobo-phone-img" 
                                                    onerror={(e) => (e.currentTarget as HTMLImageElement).style.display = 'none'}
                                                />
                                            </div>
                                        {:else}
                                            <div class="hyperrobo-phone-icon hyperrobo-phone-icon-fallback" aria-hidden="true">📱</div>
                                        {/if}
                                        <div class="book-cover-title">{book.title}</div>
                                        {#if book.author}
                                            <div class="book-cover-author">
                                                {book.author}
                                            </div>
                                        {/if}
                                        {#if (isStackSelection && selectedStackBookIds.includes(book.id)) || (isHyperRoboSelection && selectedHyperRoboBookIds.includes(book.id))}
                                            <div class="stack-select-check-overlay">
                                                <div class="check-circle">✓</div>
                                            </div>
                                        {/if}
                                    </div>
                                {:else if book.isCard}
                                    {@const isPreset = ['white', 'black', 'blue', 'pink', 'gold'].includes(book.themeColor)}
                                    <div 
                                        class="book-cover card-cover" 
                                        data-theme-color={isPreset ? book.themeColor : 'white'}
                                        style={!isPreset && book.themeColor ? `background: ${book.themeColor};` : ''}
                                    >
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
                                        {#if (isStackSelection && selectedStackBookIds.includes(book.id)) || (isHyperRoboSelection && selectedHyperRoboBookIds.includes(book.id))}
                                            <div class="stack-select-check-overlay">
                                                <div class="check-circle">✓</div>
                                            </div>
                                        {/if}
                                    </div>
                                {:else if book.isStack}
                                    <div class="book-cover" data-theme-color="white">
                                        <div class="book-cover-title">{book.title}</div>
                                        <div class="stack-indicator">🗒️ Stack</div>
                                        {#if (isStackSelection && selectedStackBookIds.includes(book.id)) || (isHyperRoboSelection && selectedHyperRoboBookIds.includes(book.id))}
                                            <div class="stack-select-check-overlay">
                                                <div class="check-circle">✓</div>
                                            </div>
                                        {/if}
                                    </div>
                                {:else}
                                    {@const isPreset = ['white', 'black', 'blue', 'pink', 'gold'].includes(book.themeColor)}
                                    <div 
                                        class="book-cover" 
                                        data-theme-color={isPreset ? book.themeColor : 'black'}
                                        style={!isPreset && book.themeColor ? `background: ${book.themeColor};` : ''}
                                    >
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
                                        {#if (isStackSelection && selectedStackBookIds.includes(book.id)) || (isHyperRoboSelection && selectedHyperRoboBookIds.includes(book.id))}
                                            <div class="stack-select-check-overlay">
                                                <div class="check-circle">✓</div>
                                            </div>
                                        {/if}
                                    </div>
                                {/if}
                                <div class="book-tooltip">
                                    <h4>{book.title}</h4>
                                    {#if book.description}
                                        <p>{book.description}</p>
                                    {:else if book.isCard && book.subTitle}
                                        <p>{book.subTitle}</p>
                                    {:else if book.author}
                                        <p>
                                            {book.author}
                                        </p>
                                    {/if}
                                </div>
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>
            <div class="shelf-board"></div>
        </div>
    {/each}

    <!-- Hidden Measure Container to detect shelf wrap points -->
    <div class="measure-container">
        {#each displayBooks as book, idx (book.id)}
            <div class="measure-book" bind:this={measureElements[idx]}></div>
        {/each}
    </div>
</div>

<style>
    /* --- 本棚コンテナ --- */
    .shelf-container {
        position: relative;
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

    .action-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        background: rgba(255, 255, 255, 0.01) !important;
        border-color: rgba(255, 255, 255, 0.05) !important;
        color: rgba(255, 255, 255, 0.3) !important;
        pointer-events: none;
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


    /* --- Stack Specific Styles --- */
    .top-shelf-actions {
        position: absolute;
        top: -45px;
        right: 0;
        z-index: 100;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .top-shelf-stack-btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid var(--text-color, #f5ebe0);
        color: var(--text-color, #f5ebe0);
        padding: 8px 16px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        transition: all 0.2s ease-in-out;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        backdrop-filter: blur(10px);
        font-family: system-ui, sans-serif;
    }

    .top-shelf-paperobo-btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid var(--text-color, #f5ebe0);
        color: var(--text-color, #f5ebe0);
        padding: 8px 16px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        transition: all 0.2s ease-in-out;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        backdrop-filter: blur(10px);
        font-family: system-ui, sans-serif;
    }

    .top-shelf-paperobo-btn:hover {
        background: rgba(255, 255, 255, 0.18);
        transform: scale(1.05);
    }

    :global([data-theme="light"]) .top-shelf-paperobo-btn {
        background: rgba(61, 37, 22, 0.06);
        border-color: var(--text-color, #3d2516);
        color: var(--text-color, #3d2516);
    }

    :global([data-theme="light"]) .top-shelf-paperobo-btn:hover {
        background: rgba(61, 37, 22, 0.12);
    }

    .top-shelf-stack-btn:hover {
        background: rgba(255, 255, 255, 0.18);
        transform: scale(1.05);
    }

    :global([data-theme="light"]) .top-shelf-stack-btn {
        background: rgba(61, 37, 22, 0.06);
        border-color: var(--text-color, #3d2516);
        color: var(--text-color, #3d2516);
    }

    :global([data-theme="light"]) .top-shelf-stack-btn:hover {
        background: rgba(61, 37, 22, 0.12);
    }

    /* Stack Book Cover (Yellow, double thickness) */
    .book-item.is-stack .book-cover {
        background: #FFF1AB !important;
        color: #1a1a1a !important;
        border: 1px solid rgba(0, 0, 0, 0.15) !important;
        border-radius: 2px 5px 5px 2px !important;
        box-shadow: 
            2px 2px 0 #e0e0e0,
            3px 3px 0 #888,
            5px 5px 0 #e0e0e0,
            6px 6px 0 #888,
            8px 8px 0 #e0e0e0,
            10px 10px 0 #2c3e50, /* Stack back cover color */
            13px 15px 15px rgba(0, 0, 0, 0.35) !important;
    }

    .book-item.is-stack::before {
        width: 10px !important;
        right: -10px !important;
        background: repeating-linear-gradient(
            90deg,
            #e0e0e0,
            #e0e0e0 3px,
            #888 3px,
            #888 4px
        ) !important;
        box-shadow: inset -1px 0 3px rgba(0,0,0,0.2) !important;
    }

    .book-item.is-stack:hover .book-cover {
        box-shadow: 
            2px 2px 0 #e0e0e0,
            3px 3px 0 #888,
            5px 5px 0 #e0e0e0,
            6px 6px 0 #888,
            8px 8px 0 #e0e0e0,
            10px 10px 0 #2c3e50,
            16px 20px 25px rgba(0, 0, 0, 0.45) !important;
    }

    .stack-indicator {
        font-size: 0.5rem;
        background: rgba(139, 92, 246, 0.12);
        color: #7c3aed;
        padding: 2px 6px;
        border-radius: 10px;
        margin-top: 8px;
        font-weight: bold;
        border: 1px solid rgba(139, 92, 246, 0.25);
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    /* Stack Selection styles */
    .book-item.unselectable-in-selection {
        opacity: 0.3;
        pointer-events: none;
        filter: grayscale(100%);
    }

    .book-item.selected-in-selection .book-cover {
        outline: 3px solid #8b5cf6 !important;
        outline-offset: 4px;
        box-shadow: 0 0 15px rgba(139, 92, 246, 0.7) !important;
    }

    .stack-select-check-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(139, 92, 246, 0.2);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10;
        border-radius: inherit;
    }

    .check-circle {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: #8b5cf6;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.1rem;
        font-weight: bold;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }

    @media (max-width: 600px) {
        .shelf-stack-mode-btn {
            top: 10px;
            right: 20px;
            padding: 4px 8px;
            font-size: 0.7rem;
        }
    }

    /* Styles for virtual more button */
    .book-item.is-more-btn {
        transform-style: flat !important;
    }
    .book-item.is-more-btn::before {
        display: none !important;
    }
    .book-item.is-more-btn .book-cover.more-cover {
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%);
        border: 2px dashed rgba(255, 255, 255, 0.25);
        border-radius: 8px;
        backdrop-filter: blur(10px);
        color: #cbd5e1;
        box-shadow: none;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        transition: all 0.3s ease;
    }
    :global([data-theme="light"]) .book-item.is-more-btn .book-cover.more-cover {
        background: linear-gradient(135deg, rgba(61, 37, 22, 0.05) 0%, rgba(61, 37, 22, 0.02) 100%);
        border-color: rgba(61, 37, 22, 0.25);
        color: #3d2516;
    }
    .book-item.is-more-btn:hover {
        transform: translateY(-8px) !important;
    }
    .book-item.is-more-btn:hover .book-cover.more-cover {
        border-color: #8b5cf6;
        color: #8b5cf6;
        background: rgba(139, 92, 246, 0.08);
        box-shadow: 0 0 15px rgba(139, 92, 246, 0.2);
    }
    .more-icon {
        font-size: 2rem;
    }
    .more-text {
        font-size: 0.8rem;
        font-weight: 600;
        letter-spacing: 0.5px;
    }
    @media (max-width: 600px) {
        .more-icon {
            font-size: 1.5rem;
        }
        .more-text {
            font-size: 0.7rem;
        }
    }

    /* --- PapeRobo スマホ枠スタイル --- */
    .book-item.is-phone {
        width: 75px !important; /* 現代のスマートな縦長比率 */
        height: 160px !important; /* 高さは他の本と完全に揃える */
        transform-style: flat !important;
    }
    .book-item.is-phone::before {
        display: none !important;
    }
    .book-item.is-phone:hover {
        transform: translateY(-12px) !important;
    }
    .book-item.is-phone:hover .paperobo-phone-cover {
        box-shadow: 0 12px 24px rgba(0,0,0,0.5) !important;
    }

    @media (max-width: 600px) {
        .book-item.is-phone {
            width: 56px !important;
            height: 120px !important; /* モバイル表示時の本の高さに揃える */
        }
    }

    .paperobo-phone-cover {
        padding: 0 !important;
        border: 3px solid #1a1a1a !important; /* 黒枠をスリムに */
        border-radius: 12px !important;
        background: #0f1c15 !important;
        box-shadow: 0 8px 20px rgba(0,0,0,0.4) !important;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        width: 100%;
        height: 100%;
        position: relative;
        box-sizing: border-box;
    }
    
    .phone-bezel {
        width: 100%;
        height: 100%;
        position: relative;
        display: flex;
        flex-direction: column;
    }

    .phone-screen-img {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        z-index: 1;
    }

    /* スマホヘッダー (ステータスバー) */
    .phone-status-bar {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 14px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 2px 4px 0;
        z-index: 10;
        background: rgba(15, 28, 21, 0.65);
        color: #ffffff;
        font-size: 5px; /* 75px幅に合わせてフォントを縮小 */
        font-weight: 600;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }

    .phone-notch {
        width: 20px;
        height: 5px;
        background: #000000;
        border-radius: 3px;
    }

    .phone-time, .phone-network {
        letter-spacing: 0.05px;
    }

    /* 左上：通話中・名前UI */
    .phone-call-status {
        position: absolute;
        top: 18px;
        left: 4px;
        z-index: 10;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }
    .phone-avatar-name {
        display: flex;
        align-items: center;
        background: rgba(0, 0, 0, 0.55);
        padding: 1px 4px;
        border-radius: 6px;
        border: 0.5px solid rgba(255, 255, 255, 0.25);
    }
    .phone-username {
        color: #ffffff;
        font-size: 5px; /* 縮小 */
        font-weight: bold;
        max-width: 45px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-family: system-ui, sans-serif;
    }
    .phone-call-duration {
        color: #ffffff;
        font-size: 4px; /* 縮小 */
        background: rgba(0, 0, 0, 0.55);
        padding: 1px 4px;
        border-radius: 6px;
        width: fit-content;
        border: 0.5px solid rgba(255, 255, 255, 0.25);
        font-family: system-ui, sans-serif;
    }

    /* 右下：緑と赤の通話ボタン */
    .phone-action-buttons {
        position: absolute;
        bottom: 8px;
        right: 4px;
        z-index: 10;
        display: flex;
        flex-direction: column;
        gap: 3px;
    }
    .phone-icon-btn {
        width: 14px; /* 18pxから縮小 */
        height: 14px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 5px rgba(0,0,0,0.4);
    }
    .phone-btn-green {
        background: #ffffff;
    }
    .phone-btn-green .btn-icon {
        font-size: 6px;
        color: #22c55e;
    }
    .phone-btn-red {
        background: #ef4444;
    }
    .phone-btn-red .btn-icon {
        font-size: 5px;
        color: #ffffff;
        font-weight: bold;
    }

    /* PapeRobo専用 アクションボタン無効化用スタイル */
    .paperobo-action-btn {
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
    .paperobo-action-btn.icon-btn {
        width: 22px;
        height: 24px;
        font-size: 11px;
        flex-shrink: 0;
        padding: 0;
    }
    .paperobo-action-btn.prompt-btn {
        padding: 0 6px;
        font-weight: 500;
        flex-shrink: 0;
    }
    .paperobo-action-btn:disabled {
        opacity: 0.55; /* 他のボタンに影響を与えずに、ここでだけ無効化時の見た目を自然に薄くする */
        cursor: not-allowed;
        pointer-events: none;
    }
    .paperobo-action-btn:hover {
        background: rgba(255, 255, 255, 0.12);
    }
    :global([data-theme="light"]) .paperobo-action-btn {
        border-color: rgba(0, 0, 0, 0.15);
        background: rgba(0, 0, 0, 0.05);
        color: #3d2516;
    }
    :global([data-theme="light"]) .paperobo-action-btn:hover {
        background: rgba(0, 0, 0, 0.08);
    }

    /* --- HyperRobo ボタン & カバー スタイル --- */
    .top-shelf-hyperrobo-btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid var(--text-color, #f5ebe0);
        color: var(--text-color, #f5ebe0);
        padding: 8px 16px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        transition: all 0.2s ease-in-out;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        backdrop-filter: blur(10px);
        font-family: system-ui, sans-serif;
    }
    .top-shelf-hyperrobo-btn:hover {
        background: rgba(255, 255, 255, 0.18);
        transform: scale(1.05);
    }
    :global([data-theme="light"]) .top-shelf-hyperrobo-btn {
        background: rgba(61, 37, 22, 0.06);
        border-color: var(--text-color, #3d2516);
        color: var(--text-color, #3d2516);
    }
    :global([data-theme="light"]) .top-shelf-hyperrobo-btn:hover {
        background: rgba(61, 37, 22, 0.12);
    }

    .book-cover.hyperrobo-cover {
        position: relative;
    }

    .hyperrobo-phone-wrapper {
        position: absolute;
        top: 0;
        left: 0;
        z-index: 2;
        width: 30px;
        height: 48px;
        margin: 0;
        box-sizing: content-box;
        border: 2px solid #1a1a1a;
        border-radius: 6px;
        overflow: hidden;
        background-color: #1a1a1a;
        pointer-events: none;
    }

    .hyperrobo-phone-img {
        height: 100%;
        width: auto;
        max-width: none;
        display: block;
    }

    .hyperrobo-phone-icon {
        position: absolute;
        top: 0;
        left: 0;
        z-index: 2;
        width: 48px;
        height: 48px;
        margin: 0;
        object-fit: contain;
        object-position: 0 0;
        pointer-events: none;
    }

    .hyperrobo-phone-icon-fallback {
        display: grid;
        place-items: center;
        font-size: 34px;
        line-height: 1;
    }

    /* --- 逆版HyperRoboカバー内の縮小本スタイル --- */
    .mini-book-overlay {
        position: absolute;
        top: 4px;
        left: 4px;
        width: 32px;
        height: 46px;
        z-index: 10;
        border-radius: 2px;
        overflow: hidden;
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.15);
    }
    .mini-book-cover {
        width: 100%;
        height: 100%;
        position: relative;
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        align-items: center;
        box-sizing: border-box;
        padding: 2px;
    }
    .mini-book-img {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        z-index: 1;
    }
    .mini-book-title {
        position: relative;
        z-index: 2;
        font-size: 5px;
        color: #ffffff;
        font-weight: bold;
        line-height: 1.1;
        text-align: center;
        word-break: break-all;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 4;
        -webkit-box-orient: vertical;
        text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8), -1px -1px 2px rgba(0, 0, 0, 0.8);
        margin-top: 2px;
        width: 100%;
    }

</style>
