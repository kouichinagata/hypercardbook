<script lang="ts">
    import { onMount, tick } from 'svelte';
    import { marked } from 'marked';
    import { goto } from '$app/navigation';
    import { browser } from '$app/environment';

    let { markdown = '', backUrl = '' } = $props();

    // Book state
    let title = $state('');
    let author = $state('');
    let coverImage = $state('');
    let authorImage = $state('');
    let authorBio = $state('');
    let themeColor = $state('black');
    let spreads = $state<Array<{ title: string; leftMarkdown: string; rightMarkdown: string }>>([]);

    let currentIndex = $state(-1); // -1 = Cover
    let currentSubPage = $state(0); // 0 = Left page, 1 = Right page (for vertical smartphone mode)
    let isOpened = $state(false);
    let viewMode = $state('spread'); // 'spread' or 'vertical'
    let uiTheme = $state('light'); // 'light' or 'dark' (for UI background)
    let insertToc = $state(false);
    let isFullscreen = $state(false);

    let bookEl: HTMLDivElement | null = $state(null);
    let pageSliderEl: HTMLInputElement | null = $state(null);

    // Watch markdown changes and re-parse
    $effect(() => {
        if (markdown) {
            parseBookMarkdown(markdown);
        }
    });

    // Reactive states matching total pages calculation
    let hasToc = $derived(insertToc);
    let hasBio = $derived(!!authorBio);
    let total = $derived.by(() => {
        if (!spreads || spreads.length === 0) return -1;
        let t = spreads.length - 1;
        if (hasToc) t += 1;
        if (hasBio) t += 1;
        return t;
    });

    // Watch open state based on index
    $effect(() => {
        if (currentIndex === -1) {
            isOpened = false;
        } else {
            isOpened = true;
        }
    });

    // Watch viewMode and trigger resize scale adjust
    $effect(() => {
        if (viewMode) {
            tick().then(() => {
                adjustBookScale();
            });
        }
    });

    // Trigger mermaid rendering when page content updates
    $effect(() => {
        if (currentIndex !== undefined || currentSubPage !== undefined) {
            tick().then(() => {
                renderMermaid();
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

    function parseBookMarkdown(md: string) {
        const trimmedMd = md.trim();
        
        // Reset properties
        let parsedTitle = '';
        let parsedAuthor = '';
        let parsedCoverImage = '';
        let parsedAuthorImage = '';
        let parsedAuthorBio = '';
        let parsedThemeColor = 'black';
        let parsedSpreads: typeof spreads = [];

        // Extract frontmatter
        const fmMatch = trimmedMd.match(/^---\s*([\s\S]*?)\s*---/);
        if (fmMatch) {
            const fmLines = fmMatch[1].split('\n');
            fmLines.forEach(line => {
                const parts = line.split(':');
                if (parts.length >= 2) {
                    const k = parts[0].trim();
                    const v = parts.slice(1).join(':').trim();
                    if (k === 'title') parsedTitle = v;
                    if (k === 'author') parsedAuthor = v;
                    if (k === 'cover_image') parsedCoverImage = normalizePath(v);
                    if (k === 'author_image') parsedAuthorImage = normalizePath(v);
                    if (k === 'theme_color') parsedThemeColor = v;
                }
            });
            
            const bioMatch = fmMatch[1].match(/author_bio:\s*\|\s*\n([\s\S]*)/);
            if (bioMatch) {
                parsedAuthorBio = bioMatch[1].trim();
            }
        }

        // Split pages
        const pagesRaw = trimmedMd.split(/Page\s*\d+:/g).slice(1);
        for (let i = 0; i < pagesRaw.length; i += 2) {
            const leftPart = pagesRaw[i] || "";
            const rightPart = pagesRaw[i+1] || "";
            
            const titleMatch = rightPart.match(/##\s*(.*)/);
            const pageTitle = titleMatch ? titleMatch[1] : `見開き ${parsedSpreads.length + 1}`;

            let cleanLeft = leftPart.trim();
            if (cleanLeft.endsWith('---')) {
                cleanLeft = cleanLeft.substring(0, cleanLeft.length - 3).trim();
            }
            let cleanRight = rightPart.trim();
            if (cleanRight.endsWith('---')) {
                cleanRight = cleanRight.substring(0, cleanRight.length - 3).trim();
            }

            parsedSpreads.push({
                title: pageTitle,
                leftMarkdown: cleanLeft,
                rightMarkdown: cleanRight
            });
        }

        title = parsedTitle;
        author = parsedAuthor;
        coverImage = parsedCoverImage;
        authorImage = parsedAuthorImage;
        authorBio = parsedAuthorBio;
        themeColor = parsedThemeColor;
        spreads = parsedSpreads;
    }

    function getEmbedUrl(url: string): string {
        if (!url) return '';
        
        // TikTok
        if (url.includes('tiktok.com')) {
            const parts = url.split('/');
            const videoId = parts[parts.length - 1].split('?')[0];
            return `https://www.tiktok.com/embed/v2/${videoId}`;
        }
        
        // YouTube Shorts & standard YouTube
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

        // Instagram Reels
        if (url.includes('instagram.com/reel/') || url.includes('instagram.com/p/')) {
            const keyword = url.includes('/reel/') ? '/reel/' : '/p/';
            const parts = url.split(keyword);
            const postId = parts[1].split('/')[0].split('?')[0];
            return `https://www.instagram.com/${keyword === '/reel/' ? 'reel' : 'p'}/${postId}/embed`;
        }
        
        return url;
    }

    function renderPage(content: string): string {
        if (!content) return '';
        
        const lines = content.split('\n');
        const processedLines = lines.map(line => {
            const trimmed = line.trim();
            const videoMatch = trimmed.match(/^video:\s*(.*)/);
            if (videoMatch) {
                const videoUrl = videoMatch[1].trim();
                return `<div class="video-container"><iframe src="${getEmbedUrl(videoUrl)}" allowfullscreen></iframe></div>`;
            }
            
            const imageMatch = trimmed.match(/^image:\s*(.*)/);
            if (imageMatch) {
                const imageUrl = imageMatch[1].trim();
                return `<div class="image-container"><img src="${normalizePath(imageUrl)}" alt="画像"></div>`;
            }
            
            return line;
        });
        
        let html = marked.parse(processedLines.join('\n')) as string;
        html = html.replace(/src="books\//g, 'src="/books/');
        return html;
    }

    function renderMarkdownOnly(content: string): string {
        if (!content) return "";
        let html = marked.parse(content) as string;
        html = html.replace(/src="books\//g, 'src="/books/');
        return html;
    }

    function getLeftPageNum() {
        if (currentIndex === -1) return "";
        if (hasBio && currentIndex === total) return "";
        if (hasToc && currentIndex === 0) return "";
        const dataIndex = hasToc ? currentIndex - 1 : currentIndex;
        return (dataIndex * 2 + 1).toString();
    }

    function getRightPageNum() {
        if (currentIndex === -1) return "";
        if (hasBio && currentIndex === total) return "";
        if (hasToc && currentIndex === 0) return "";
        const dataIndex = hasToc ? currentIndex - 1 : currentIndex;
        return (dataIndex * 2 + 2).toString();
    }

    function getProgressText() {
        if (currentIndex === -1) return "表紙";
        if (hasBio && currentIndex === total) return "裏表紙";
        if (hasToc && currentIndex === 0) return "目次";
        const dataIndex = hasToc ? currentIndex - 1 : currentIndex;
        return `${dataIndex + 1} / ${spreads.length}`;
    }

    function getPageNumberStr(contentIndex: number) {
        if (contentIndex === -1) return "表紙";
        if (contentIndex < spreads.length) {
            return `${contentIndex * 2 + 1}`;
        }
        return `${spreads.length * 2 + 1}`;
    }

    // Navigation logic
    function goPrev() {
        const isVertical = viewMode === 'vertical';
        if (isVertical) {
            if (currentSubPage === 1) {
                currentSubPage = 0;
            } else {
                if (currentIndex > -1) {
                    currentIndex--;
                    if (currentIndex >= 0 && currentIndex < total) {
                        currentSubPage = 1;
                    } else {
                        currentSubPage = 0;
                    }
                }
            }
        } else {
            if (currentIndex > -1) {
                currentIndex--;
            }
        }
    }

    function goNext() {
        const isVertical = viewMode === 'vertical';
        if (isVertical) {
            if (currentIndex >= 0 && currentIndex <= total && currentSubPage === 0) {
                currentSubPage = 1;
            } else {
                if (currentIndex < total) {
                    currentIndex++;
                    currentSubPage = 0;
                }
            }
        } else {
            if (currentIndex < total) {
                currentIndex++;
            }
        }
    }

    function goFirst() {
        currentIndex = -1;
        currentSubPage = 0;
    }

    function goLast() {
        currentIndex = total;
        currentSubPage = 0;
    }

    function handleSliderInput(e: Event) {
        currentIndex = parseInt((e.target as HTMLInputElement).value);
        currentSubPage = 0;
    }

    function jumpToPage(index: number) {
        currentIndex = index;
        currentSubPage = 0;
    }

    function handleInsertTocChange(e: Event) {
        const isChecked = (e.target as HTMLInputElement).checked;
        const oldTotal = total;
        
        insertToc = isChecked;
        
        tick().then(() => {
            if (currentIndex >= 0) {
                if (isChecked && currentIndex < oldTotal) {
                    currentIndex = currentIndex + 1;
                } else if (!isChecked && currentIndex > 0) {
                    currentIndex = currentIndex - 1;
                } else if (!isChecked && currentIndex === 0) {
                    currentIndex = -1;
                }
            }
        });
    }

    function toggleViewMode() {
        const isVertical = viewMode === 'spread' ? 'vertical' : 'spread';
        viewMode = isVertical;
        if (isVertical === 'vertical') {
            currentSubPage = 0;
        }
        adjustBookScale();
    }

    function toggleTheme() {
        uiTheme = uiTheme === 'dark' ? 'light' : 'dark';
        if (browser) {
            document.documentElement.setAttribute('data-theme', uiTheme);
        }
    }

    function toggleFullscreen() {
        if (!browser) return;
        const elem = document.documentElement;
        if (!document.fullscreenElement) {
            elem.requestFullscreen().catch(err => {
                console.error(`全画面表示エラー: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    }

    function adjustBookScale() {
        if (!bookEl) return;
        const isVertical = viewMode === 'vertical';
        if (isVertical) {
            bookEl.style.transform = '';
            bookEl.style.transformOrigin = '';
            bookEl.style.margin = '';
            return;
        }
        if (browser && document.fullscreenElement) {
            const viewportHeight = window.innerHeight;
            const viewportWidth = window.innerWidth;
            const availableHeight = viewportHeight - 75;
            const availableWidth = viewportWidth - 40;
            const bookWidth = 1040;
            const bookHeight = 715;
            const scaleX = availableWidth / bookWidth;
            const scaleY = availableHeight / bookHeight;
            const scale = Math.min(scaleX, scaleY);
            
            bookEl.style.transform = `scale(${scale})`;
            bookEl.style.transformOrigin = 'center center';
            bookEl.style.margin = '0';
        } else {
            bookEl.style.transform = '';
            bookEl.style.transformOrigin = '';
            bookEl.style.margin = '';
        }
    }

    function handleBookClick(e: MouseEvent) {
        if ((e.target as HTMLElement).closest('a') || (e.target as HTMLElement).closest('.control-panel')) {
            return;
        }
        
        const isVertical = viewMode === 'vertical';
        
        if (currentIndex === -1) {
            currentIndex = 0;
            currentSubPage = 0;
            return;
        }

        const rect = bookEl!.getBoundingClientRect();
        const x = e.clientX - rect.left;

        if (x > rect.width / 2) {
            // Right click (Next)
            if (isVertical) {
                if (currentSubPage === 0) {
                    currentSubPage = 1;
                } else {
                    if (currentIndex < total) {
                        currentIndex++;
                        currentSubPage = 0;
                    } else {
                        currentIndex = -1;
                        currentSubPage = 0;
                    }
                }
            } else {
                if (currentIndex < total) {
                    currentIndex++;
                } else {
                    currentIndex = -1; // back to cover
                }
            }
        } else {
            // Left click (Prev)
            if (isVertical) {
                if (currentSubPage === 1) {
                    currentSubPage = 0;
                } else {
                    if (currentIndex > 0) {
                        currentIndex--;
                        currentSubPage = 1;
                    } else {
                        currentIndex = -1;
                        currentSubPage = 0;
                    }
                }
            } else {
                if (currentIndex > 0) {
                    currentIndex--;
                } else {
                    currentIndex = -1; // back to cover
                }
            }
        }
    }

    function renderMermaid() {
        if (browser && (window as any).mermaid) {
            try {
                const mermaidDivs = document.querySelectorAll('.mermaid');
                if (mermaidDivs.length > 0) {
                    (window as any).mermaid.init(undefined, mermaidDivs);
                }
            } catch (e) {
                console.error("Mermaid render error:", e);
            }
        }
    }

    onMount(() => {
        const savedTheme = document.documentElement.getAttribute('data-theme') || 'light';
        uiTheme = savedTheme;

        // Add capture listener for image errors to add .broken-image styling
        const handleImageError = (e: Event) => {
            const target = e.target as HTMLElement;
            if (target && target.tagName === 'IMG') {
                target.classList.add('broken-image');
            }
        };
        document.addEventListener('error', handleImageError, true);

        // Apply viewMode based on width
        const isNarrow = window.innerWidth <= 768;
        viewMode = isNarrow ? 'vertical' : 'spread';
        currentSubPage = 0;

        // Setup custom renderer for marked
        const renderer = new marked.Renderer();
        (renderer as any).code = function(code: any, lang: any) {
            let codeText = typeof code === 'object' ? code.text : code;
            let codeLang = typeof code === 'object' ? code.lang : lang;
            if (codeLang === 'mermaid') {
                return `<div class="mermaid">${codeText}</div>`;
            }
            return `<pre><code>${codeText}</code></pre>`;
        };
        marked.use({ renderer });

        // Initialize mermaid globally
        if ((window as any).mermaid) {
            (window as any).mermaid.initialize({
                startOnLoad: false,
                theme: uiTheme === 'dark' ? 'dark' : 'default',
                securityLevel: 'loose'
            });
        }

        window.addEventListener('resize', adjustBookScale);
        const handleFullscreenChange = () => {
            isFullscreen = !!document.fullscreenElement;
            adjustBookScale();
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);

        return () => {
            window.removeEventListener('resize', adjustBookScale);
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('error', handleImageError, true);
        };
    });
</script>

<svelte:head>
    <!-- Marked and Mermaid load -->
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
</svelte:head>

<div class="book-workspace" data-theme={uiTheme} data-book-theme={themeColor} class:vertical-mode={viewMode === 'vertical'}>
    {#if backUrl}
        <button 
            id="backToShelfBtn"
            class="theme-switch" 
            style="position: fixed; top: 20px; left: 20px; z-index: 9999; padding: 8px 14px; font-size: 12px; border-radius: 20px;" 
            onclick={() => goto(backUrl)}
        >
            戻る
        </button>
    {/if}

    <div class="header-area">
        <div class="theme-switch-container">
            <button class="theme-switch" onclick={toggleViewMode} title="見開き/縦並び切替">
                {viewMode === 'vertical' ? '📖' : '📃'}
            </button>
            <button class="theme-switch" onclick={toggleTheme}>
                {uiTheme === 'dark' ? '☀️' : '🌙'}
            </button>
        </div>
        <div class="instruction-text">
            {currentIndex === -1 ? '表紙をクリックして読む' : ''}
        </div>
    </div>

    <div class="book-viewport">
        <div 
            class="book-body" 
            class:opened={isOpened} 
            onclick={handleBookClick}
            onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    goNext();
                }
            }}
            role="button"
            tabindex="0"
            bind:this={bookEl}
            id="book"
        >
            <!-- 表紙エリア -->
            <div class="cover-overlay" id="cover" style:transform={isOpened ? 'rotateY(-110deg)' : 'none'} style:opacity={isOpened ? 0 : 1} style:pointer-events={isOpened ? 'none' : 'auto'}>
                {#if coverImage}
                    <img src={coverImage} alt={title} class="cover-image" id="coverImg" />
                {/if}
                <div class="cover-title" id="coverTitle">{title || ''}</div>
                {#if author}
                    <div class="cover-author" id="coverAuthor">著者：{author}</div>
                {/if}
            </div>

            <!-- 見開き中身 -->
            <div class="book-content" style:opacity={isOpened ? 1 : 0}>
                <!-- 左ページ -->
                <div class="page-side" style:display={(currentIndex !== -1 && (viewMode === 'spread' || currentSubPage === 0)) ? 'flex' : 'none'}>
                    {#if hasBio && currentIndex === total}
                        <div class="image-container" id="imageArea" style:display="flex">
                            <img src={normalizePath(authorImage || 'author_avatar.png')} alt="著者近影" style="width: auto !important; height: auto !important; max-width: 100% !important; max-height: 100% !important; border-radius: 50%; object-fit: cover; box-shadow: 0 6px 15px rgba(0,0,0,0.15);" />
                        </div>
                    {:else if hasToc && currentIndex === 0}
                        <div class="markdown-body left-markdown" id="leftTextArea" style:display="block"></div>
                    {:else}
                        {@const dataIndex = hasToc ? currentIndex - 1 : currentIndex}
                        {#if spreads[dataIndex]}
                            <div class="markdown-body left-markdown" id="leftTextArea" style:display="block">
                                {@html renderPage(spreads[dataIndex].leftMarkdown)}
                            </div>
                        {/if}
                    {/if}
                    <div class="page-number left-num" id="leftPageNum">
                        {getLeftPageNum()}
                    </div>
                </div>

                <!-- 右ページ -->
                <div class="page-side" style:display={(currentIndex !== -1 && (viewMode === 'spread' || currentSubPage === 1)) ? 'flex' : 'none'}>
                    {#if hasBio && currentIndex === total}
                        <div class="markdown-body" id="textArea" style:display="block">
                            {@html renderMarkdownOnly(authorBio)}
                        </div>
                    {:else if hasToc && currentIndex === 0}
                        <div class="markdown-body" id="textArea" style:display="block">
                            <div class="book-toc-container">
                                <h2>目次</h2>
                                <ul class="book-toc-list">
                                    {#each spreads as spread, i}
                                        <li>
                                            <a href="javascript:void(0)" onclick={(e) => { e.preventDefault(); jumpToPage(i + 1); }}>
                                                <span class="toc-title">{spread.title || `見開き ${i + 1}`}</span>
                                                <span class="toc-dots"></span>
                                                <span class="toc-page">{getPageNumberStr(i)}</span>
                                            </a>
                                        </li>
                                    {/each}
                                    {#if authorBio}
                                        <li>
                                            <a href="javascript:void(0)" onclick={(e) => { e.preventDefault(); jumpToPage(total); }}>
                                                <span class="toc-title">著者紹介</span>
                                                <span class="toc-dots"></span>
                                                <span class="toc-page">{getPageNumberStr(spreads.length)}</span>
                                            </a>
                                        </li>
                                    {/if}
                                </ul>
                            </div>
                        </div>
                    {:else}
                        {@const dataIndex = hasToc ? currentIndex - 1 : currentIndex}
                        {#if spreads[dataIndex]}
                            <div class="markdown-body" id="textArea" style:display="block">
                                {@html renderPage(spreads[dataIndex].rightMarkdown)}
                            </div>
                        {/if}
                    {/if}
                    <div class="page-number right-num" id="rightPageNum">
                        {getRightPageNum()}
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- コントロールパネル -->
    <div class="control-panel">
        <button class="control-btn" onclick={goFirst} title="最初のページへ">⇤</button>
        <button class="control-btn" onclick={goPrev} title="前のページへ">◀</button>
        <input 
            type="range" 
            bind:this={pageSliderEl}
            min="-1" 
            max={total} 
            value={currentIndex} 
            oninput={handleSliderInput} 
            class="page-slider"
        >
        <button class="control-btn" onclick={goNext} title="次のページへ">▶</button>
        <button class="control-btn" onclick={goLast} title="最後のページへ">⇥</button>
        <button class="control-btn" onclick={toggleFullscreen} title="全画面表示">
            {isFullscreen ? '↩︎' : '⛶'}
        </button>
    </div>

    <!-- ページダイレクトナビゲーション (目次) -->
    <div class="footer-box" style:display={hasToc ? 'none' : 'block'}>
        <div class="book-toc-container" style="max-width: 494px; margin: 0 auto; text-align: left; position: relative;">
            <div class="toc-header-wrapper" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 2px solid var(--text-color); padding-bottom: 6px;">
                <h2 style="margin: 0; font-size: 1.3rem;">目次</h2>
                <label class="toc-checkbox-label" style="font-size: 0.9rem; opacity: 0.8; margin-left: auto;">
                    <input type="checkbox" checked={insertToc} onchange={handleInsertTocChange} id="insertTocCheckbox" /> 目次を本に含める
                </label>
            </div>
            <ul class="book-toc-list" style:display="block">
                {#each spreads as spread, i}
                    <li>
                        <a href="javascript:void(0)" onclick={(e) => { e.preventDefault(); jumpToPage(hasToc ? i + 1 : i); }}>
                            <span class="toc-title">{spread.title || `見開き ${i + 1}`}</span>
                            <span class="toc-dots"></span>
                            <span class="toc-page">{getPageNumberStr(i)}</span>
                        </a>
                    </li>
                {/each}
                {#if authorBio}
                    <li>
                        <a href="javascript:void(0)" onclick={(e) => { e.preventDefault(); jumpToPage(total); }}>
                            <span class="toc-title">著者紹介</span>
                            <span class="toc-dots"></span>
                            <span class="toc-page">{getPageNumberStr(spreads.length)}</span>
                        </a>
                    </li>
                {/if}
            </ul>
        </div>
    </div>
</div>

<style>
    /* Scoped exact styles from hyperbook.html */
    .book-workspace {
        --bg-color: #e0e0e0;
        --text-color: #2c3e50;
        --book-cover-bg: #1c1c1c; /* 濃いグレー */
        --page-color: #ffffff;
        --edge-color: #bbb;
        --link-blue: #2a5ca8;

        margin: 0; padding: 0;
        background: var(--bg-color);
        color: var(--text-color);
        font-family: "游明朝", "Yu Mincho", "Hiragino Mincho ProN", serif;
        display: flex; flex-direction: column; align-items: center;
        min-height: 100vh; transition: 0.4s; overflow-x: hidden;
        width: 100%;
        box-sizing: border-box;
    }

    .book-workspace[data-theme="dark"] {
        --bg-color: #121212;
        --text-color: #f0f0f0;
        --book-cover-bg: #161616;
        --page-color: #2d2d2e;
        --edge-color: #444;
        --link-blue: #66a3ff;
    }

    /* --- 上部エリア --- */
    .header-area {
        width: 100%; max-width: 1200px;
        display: flex; flex-direction: column; align-items: center;
        padding-top: 20px; position: relative;
    }

    .theme-switch-container {
        position: absolute; top: 20px; right: 10px;
        display: flex; gap: 8px; z-index: 1000;
    }
    .theme-switch {
        padding: 8px 12px; border-radius: 20px;
        border: 1px solid var(--text-color);
        background: var(--page-color); color: var(--text-color);
        cursor: pointer; font-size: 11px;
        transition: 0.3s;
    }

    .instruction-text {
        font-size: 0.85rem; margin-bottom: 12px; font-weight: normal;
        color: var(--text-color); opacity: 0.7; min-height: 1.2rem;
        letter-spacing: 0.05em;
    }

    /* --- 本の本体 --- */
    .book-viewport {
        width: 100%; display: flex; justify-content: center;
        perspective: 2000px; padding-bottom: 20px;
    }

    .book-body {
        position: relative;
        width: 494px;
        max-width: 100%;
        height: auto;
        aspect-ratio: 494 / 715;
        background-color: var(--page-color);
        transition: all 0.8s cubic-bezier(0.645, 0.045, 0.355, 1);
        transform-style: preserve-3d;
        box-shadow: 5px 5px 0 var(--edge-color), 10px 10px 0 var(--book-cover-bg), 15px 25px 40px rgba(0,0,0,0.3);
        border-radius: 4px 10px 10px 4px;
        cursor: pointer;
        flex-shrink: 0;
    }

    .book-body.opened {
        width: 1040px;
        aspect-ratio: 1040 / 715;
    }

    .cover-overlay {
        position: absolute; top: 0; left: 0; width: 100%; height: 100%;
        background-color: var(--book-cover-bg);
        color: white; z-index: 100;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        transition: transform 1.2s, opacity 0.6s;
        transform-origin: left; padding: 20px; box-sizing: border-box;
        border-radius: 4px 10px 10px 4px; backface-visibility: hidden;
    }

    .cover-image { width: 85%; max-height: 455px; object-fit: contain; margin-bottom: 20px; }
    .cover-title { font-size: 2.1rem; margin: 5px 0; font-weight: bold; }
    .cover-author { font-size: 1.4rem; opacity: 0.8; }

    .book-content {
        display: flex; width: 100%; height: 100%;
        transition: opacity 0.5s 0.4s;
    }

    .book-content::after {
        content: ""; position: absolute; left: 50%; top: 0; bottom: 0; width: 40px;
        transform: translateX(-50%);
        background: linear-gradient(to right, transparent, rgba(0,0,0,0.1) 45%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.1) 55%, transparent);
        z-index: 10;
        pointer-events: none;
    }

    .page-side { flex: 1; padding: 20px; display: flex; flex-direction: column; justify-content: center; align-items: center; position: relative; overflow: hidden;}

    :global(.book-workspace .video-container) {
        width: 100%; max-width: 350px; aspect-ratio: 9/16;
        background: #000; border-radius: 10px;
        box-shadow: 0 10px 20px rgba(0,0,0,0.4); overflow: hidden;
    }
    :global(.book-workspace iframe) { width: 100%; height: 100%; border: none; }

    .markdown-body {
        font-size: 1.1rem; line-height: 1.6; padding: 0 15px;
        text-align: left; overflow-y: auto; max-height: 90%;
        width: 100%; box-sizing: border-box;
    }
    .markdown-body :global(h2) { font-size: 1.4rem; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-top: 0; }
    .markdown-body :global(a) { color: var(--link-blue); text-decoration: underline; }
    .markdown-body :global(.video-container),
    .markdown-body :global(.image-container) {
        margin: 15px auto;
    }

    .markdown-body :global(img) {
        max-width: 100%;
        max-height: 420px;
        height: auto;
        object-fit: contain;
        border-radius: 8px;
        display: block;
        margin: 15px auto;
        box-shadow: 0 4px 10px rgba(0,0,0,0.1);
    }
    .book-workspace[data-theme="dark"] .markdown-body :global(img) {
        box-shadow: 0 4px 15px rgba(0,0,0,0.5);
    }

    /* --- Left Page Flexibility --- */
    .image-container {
        width: 100%; max-width: 312px; aspect-ratio: 9/16;
        border-radius: 10px; overflow: hidden;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 10px 20px rgba(0,0,0,0.2);
        background: rgba(0, 0, 0, 0.04);
    }
    .book-workspace[data-theme="dark"] .image-container {
        background: rgba(255, 255, 255, 0.04);
    }
    .image-container img {
        width: 100%; height: 100%; object-fit: contain;
    }
    .left-markdown {
        font-size: 1.1rem; line-height: 1.6; padding: 0 15px;
        text-align: left; overflow-y: auto; max-height: 90%;
        width: 100%; box-sizing: border-box;
    }

    /* --- Page Numbering --- */
    .page-number {
        position: absolute; bottom: 12px;
        left: 50%; transform: translateX(-50%);
        font-size: 0.75rem; opacity: 0.4;
        font-family: system-ui, -apple-system, sans-serif;
        pointer-events: none;
    }

    /* --- Control Panel --- */
    .control-panel {
        display: flex; align-items: center; justify-content: center;
        gap: 12px; margin-top: 15px; margin-bottom: 15px;
        background: rgba(255, 255, 255, 0.4);
        backdrop-filter: blur(10px);
        padding: 8px 16px; border-radius: 30px;
        border: 1px solid rgba(255, 255, 255, 0.3);
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
        max-width: 494px; width: 90%; box-sizing: border-box;
        transition: all 0.3s;
        z-index: 999;
    }
    .book-workspace[data-theme="dark"] .control-panel {
        background: rgba(0, 0, 0, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.08);
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
    }
    .control-btn {
        background: none; border: none;
        color: var(--text-color); font-size: 1.1rem;
        cursor: pointer; padding: 6px; width: 32px; height: 32px;
        display: flex; align-items: center; justify-content: center;
        border-radius: 50%; transition: background 0.2s, transform 0.1s;
    }
    .control-btn:hover {
        background: rgba(0, 0, 0, 0.05);
        transform: scale(1.1);
    }
    .book-workspace[data-theme="dark"] .control-btn:hover {
        background: rgba(255, 255, 255, 0.08);
    }
    .control-btn:active {
        transform: scale(0.95);
    }
    .page-slider {
        flex: 1; height: 4px;
        background: rgba(0, 0, 0, 0.1);
        border-radius: 2px; outline: none;
        -webkit-appearance: none; appearance: none;
        cursor: pointer;
    }
    .book-workspace[data-theme="dark"] .page-slider {
        background: rgba(255, 255, 255, 0.2);
    }
    .page-slider::-webkit-slider-thumb {
        -webkit-appearance: none; appearance: none;
        width: 14px; height: 14px; border-radius: 50%;
        background: var(--text-color); cursor: pointer;
        transition: transform 0.1s;
    }
    .page-slider::-webkit-slider-thumb:hover {
        transform: scale(1.3);
    }
    .page-progress {
        font-size: 0.85rem; font-weight: bold; min-width: 60px; text-align: center;
        font-family: system-ui, -apple-system, sans-serif;
        color: var(--text-color); opacity: 0.8;
    }

    /* --- Bottom Link List / TOC --- */
    .footer-box {
        margin-top: 20px;
        padding: 0 20px 50px;
        width: 90%;
        max-width: 1040px;
        text-align: center;
    }

    .toc-checkbox-label {
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        font-family: system-ui, -apple-system, sans-serif;
        color: var(--text-color);
    }

    /* --- Table of Contents Inside Book --- */
    .book-toc-container {
        width: 100%;
        padding: 10px 15px;
        box-sizing: border-box;
        background: transparent;
    }
    .book-toc-container h2 {
        text-align: center;
        margin-bottom: 25px;
        font-size: 1.6rem;
        border-bottom: 2px solid var(--text-color);
        padding-bottom: 8px;
    }
    .book-toc-list {
        list-style: none;
        padding: 0;
        margin: 0;
        width: 100%;
    }
    .book-toc-list li {
        margin-bottom: 12px;
    }
    .book-toc-list li a {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        text-decoration: none;
        color: var(--text-color);
        font-size: 1.05rem;
        font-weight: bold;
        transition: opacity 0.2s;
    }
    .book-toc-list li a:hover {
        opacity: 0.7;
    }
    .toc-title {
        flex-shrink: 0;
        padding-right: 6px;
        z-index: 2;
        background: transparent;
    }
    .toc-dots {
        flex-grow: 1;
        border-bottom: 2px dotted var(--text-color);
        opacity: 0.3;
        margin: 0 4px 4px 4px;
        min-width: 20px;
    }
    .toc-page {
        flex-shrink: 0;
        padding-left: 6px;
        font-family: system-ui, sans-serif;
        font-weight: bold;
        z-index: 2;
        background: transparent;
    }

    /* --- Author Biography Page Stylings --- */
    .author-photo-container {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        width: 100%; height: 100%;
    }

    /* --- Fullscreen Styles --- */
    :global(.book-workspace:fullscreen) {
        background: var(--bg-color);
    }
    :global(.book-workspace:fullscreen) .header-area {
        display: none !important;
    }
    :global(.book-workspace:fullscreen) .footer-box {
        display: none !important;
    }
    :global(.book-workspace:fullscreen) .book-viewport {
        height: calc(100vh - 75px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 !important;
        margin: 0 !important;
    }
    :global(.book-workspace:fullscreen) .control-panel {
        margin-top: 5px !important;
        margin-bottom: 5px !important;
    }

    /* --- 縦長スマートフォン表示モード (Vertical Smartphone Mode) --- */
    .book-workspace.vertical-mode {
        display: flex !important;
        flex-direction: column !important;
        height: 100vh !important;
        overflow: hidden !important;
        min-height: 0 !important;
    }
    .book-workspace.vertical-mode .footer-box {
        display: none !important;
    }
    .book-workspace.vertical-mode .book-content::after {
        display: none !important;
    }
    .book-workspace.vertical-mode .header-area {
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        padding: 0 !important;
        height: 0 !important;
        overflow: visible !important;
    }
    .book-workspace.vertical-mode .instruction-text {
        display: none !important;
    }
    .book-workspace.vertical-mode .book-viewport {
        flex: 1 !important;
        height: calc(100vh - 65px) !important;
        min-height: 0 !important;
        padding: 0 !important;
        margin: 0 !important;
        width: 100vw !important;
        display: flex !important;
        align-items: stretch !important;
        justify-content: center !important;
    }
    .book-workspace.vertical-mode .book-body {
        width: 100vw !important;
        height: 100% !important;
        max-width: 100% !important;
        box-shadow: none !important;
        border-radius: 0 !important;
        transform: none !important;
        margin: 0 !important;
        background: transparent !important;
        aspect-ratio: auto !important;
    }
    .book-workspace.vertical-mode .book-body.opened {
        width: 100vw !important;
        height: 100% !important;
        max-width: 100% !important;
        aspect-ratio: auto !important;
    }
    .book-workspace.vertical-mode .cover-overlay {
        display: none !important;
    }
    .book-workspace.vertical-mode .book-content {
        display: flex !important;
        flex-direction: row !important;
        width: 100% !important;
        height: 100% !important;
        opacity: 1 !important;
        gap: 0 !important;
    }
    .book-workspace.vertical-mode .page-side {
        width: 100% !important;
        height: 100% !important;
        max-height: 100% !important;
        box-shadow: none !important;
        border-radius: 0 !important;
        padding: 24px 16px 40px 16px !important;
        box-sizing: border-box !important;
        flex: none !important;
    }
    .book-workspace.vertical-mode .control-panel {
        width: 100vw !important;
        max-width: 100% !important;
        height: 65px !important;
        margin: 0 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        box-sizing: border-box !important;
        background: var(--bg-color) !important;
        border-top: 1px solid rgba(255, 255, 255, 0.1) !important;
        border-radius: 0;
    }

    /* Video page padding/layout overrides (33% margin reduction for normal/fullscreen views) */
    .page-side:has(.markdown-body :global(.video-container)) {
        padding: 14px !important;
    }
    .page-side:has(.markdown-body :global(.video-container)) .markdown-body {
        padding: 0 10px !important;
        max-height: 100% !important;
        height: calc(100% - 20px) !important;
        overflow: hidden !important;
    }
    .page-side:has(.markdown-body :global(.video-container)) .markdown-body :global(.video-container) {
        margin: 15px auto !important;
    }

    /* Smartphone vertical mode - video page edge-to-edge max width */
    .book-workspace.vertical-mode .page-side:has(.markdown-body :global(.video-container)) {
        padding: 0 !important;
    }
    .book-workspace.vertical-mode .page-side:has(.markdown-body :global(.video-container)) .markdown-body {
        padding: 0 !important;
        height: 100% !important;
        max-height: 100% !important;
        overflow: hidden !important;
    }
    .book-workspace.vertical-mode .page-side:has(.markdown-body :global(.video-container)) :global(.video-container) {
        width: 100% !important;
        max-width: 100% !important;
        height: 100% !important;
        max-height: 100% !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        margin: 0 !important;
    }

    /* white: 表紙は光沢のある白、本文紙は現在のまま */
    .book-workspace[data-book-theme="white"] #cover {
        background: linear-gradient(135deg, #ffffff 0%, #f7f7f7 50%, #e3e3e3 100%) !important;
        box-shadow: inset 0 2px 5px rgba(255, 255, 255, 1), inset 0 -2px 5px rgba(0, 0, 0, 0.1);
        color: #1a1a1a !important;
    }
    .book-workspace[data-book-theme="white"] #coverTitle {
        color: #1a1a1a !important;
    }
    .book-workspace[data-book-theme="white"] #coverAuthor {
        color: #555555 !important;
    }

    /* blue: ビジネス、男の子向け、紙は白に濃い青文字 */
    .book-workspace[data-book-theme="blue"] #cover {
        background: linear-gradient(135deg, #0f2b5c 0%, #1e3c72 100%) !important;
        color: #ffffff !important;
        box-shadow: inset 0 2px 5px rgba(255, 255, 255, 0.15);
    }
    .book-workspace[data-book-theme="blue"] #coverTitle, 
    .book-workspace[data-book-theme="blue"] #coverAuthor {
        color: #ffffff !important;
    }
    .book-workspace[data-book-theme="blue"] .page-side {
        background-color: #e3f2fd !important; /* 超薄い水色 */
        color: #0b2240 !important;
    }
    .book-workspace[data-book-theme="blue"] .markdown-body,
    .book-workspace[data-book-theme="blue"] .left-markdown,
    .book-workspace[data-book-theme="blue"] .page-number {
        color: #0b2240 !important;
    }
    .book-workspace[data-book-theme="blue"] .markdown-body :global(h2) {
        border-bottom: 1px solid rgba(11, 34, 64, 0.2);
    }
    .book-workspace[data-book-theme="blue"] .markdown-body :global(a) {
        color: #0044cc !important;
    }

    /* pink: 女性用、女の子向け、紙は超薄いピンクに文字はグレー */
    .book-workspace[data-book-theme="pink"] #cover {
        background: linear-gradient(135deg, #ffdeed 0%, #ffb3d1 100%) !important;
        color: #4a4a4a !important;
        box-shadow: inset 0 2px 5px rgba(255, 255, 255, 0.6);
    }
    .book-workspace[data-book-theme="pink"] #coverTitle {
        color: #4a4a4a !important;
    }
    .book-workspace[data-book-theme="pink"] #coverAuthor {
        color: #6a6a6a !important;
    }
    .book-workspace[data-book-theme="pink"] .page-side {
        background-color: #fff0f3 !important;
        color: #555555 !important;
    }
    .book-workspace[data-book-theme="pink"] .markdown-body,
    .book-workspace[data-book-theme="pink"] .left-markdown,
    .book-workspace[data-book-theme="pink"] .page-number {
        color: #555555 !important;
    }
    .book-workspace[data-book-theme="pink"] .markdown-body :global(h2) {
        border-bottom: 1px solid rgba(85, 85, 85, 0.2);
    }
    .book-workspace[data-book-theme="pink"] .markdown-body :global(a) {
        color: #cc4477 !important;
    }

    /* gold: 皮表紙風茶に金色タイトル、紙は古紙風、焦茶文字 */
    .book-workspace[data-book-theme="gold"] #cover {
        background: linear-gradient(135deg, #4e2f15 0%, #2e1605 100%) !important;
        box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.6);
        border-left: 5px solid rgba(255, 215, 0, 0.35);
        color: #ffd700 !important;
    }
    .book-workspace[data-book-theme="gold"] #coverTitle {
        color: #ffd700 !important;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8), 0 0 6px rgba(255, 215, 0, 0.4);
    }
    .book-workspace[data-book-theme="gold"] #coverAuthor {
        color: #e6c300 !important;
    }
    .book-workspace[data-book-theme="gold"] .page-side {
        background-color: #f2e8cf !important;
        background-image: radial-gradient(circle, rgba(255, 255, 255, 0.1) 0%, rgba(0, 0, 0, 0.02) 100%) !important;
        color: #321c0b !important;
    }
    .book-workspace[data-book-theme="gold"] .markdown-body,
    .book-workspace[data-book-theme="gold"] .left-markdown,
    .book-workspace[data-book-theme="gold"] .page-number {
        color: #321c0b !important;
    }
    .book-workspace[data-book-theme="gold"] .markdown-body :global(h2) {
        border-bottom: 1px solid rgba(50, 28, 11, 0.2);
    }
    .book-workspace[data-book-theme="gold"] .markdown-body :global(a) {
        color: #8b5a2b !important;
    }

    :global(.book-workspace img.broken-image) {
        border: 2px dashed rgba(239, 68, 68, 0.5) !important;
        min-width: 150px !important;
        min-height: 150px !important;
        background-color: rgba(239, 68, 68, 0.05) !important;
        cursor: pointer;
    }
</style>
