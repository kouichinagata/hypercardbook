<script lang="ts">
    import { onMount, tick, untrack } from 'svelte';
    import { marked } from 'marked';
    import { goto } from '$app/navigation';
    import { browser } from '$app/environment';

    import { LANGUAGES } from '$lib/languages';

    let { 
        markdown = '', 
        backUrl = '', 
        id = '', 
        activePluginIds = [], 
        language = 'ja',
        onHookAiResult = null,
        currentIndex = $bindable(-1),
        currentUserId = 'global',
        isWorkspace = false
    } = $props();

    // Iframe postMessage connection states
    let iframeSource: MessageEventSource | null = null;
    let iframeOrigin = '*';
    let pages = $state<string[]>([]);

    // Text to Speech states & methods
    let isSpeaking = $state(false);

    function handleToggleSpeak() {
        if (!browser || !window.speechSynthesis) return;
        
        if (isSpeaking) {
            window.speechSynthesis.cancel();
            isSpeaking = false;
            return;
        }
        
        if (currentIndex === -1) {
            let textToSpeak = `Title: ${title}`;
            if (author) textToSpeak += `, Author: ${author}`;
            speak(textToSpeak);
            return;
        }
        
        const currentSpread = spreads[currentIndex];
        if (!currentSpread) return;
        
        let textToSpeak = '';
        if (currentSpread.leftMarkdown) textToSpeak += currentSpread.leftMarkdown + '\n';
        if (currentSpread.rightMarkdown) textToSpeak += currentSpread.rightMarkdown;
        
        if (!textToSpeak.trim()) return;
        speak(textToSpeak);
    }

    function speak(text: string) {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        
        const cleanText = text
            .replace(/<[^>]*>/g, '')
            .replace(/#+\s*/g, '')
            .replace(/[*_`~-]/g, '')
            .trim();
            
        if (!cleanText) return;
        
        isSpeaking = true;
        const utterance = new SpeechSynthesisUtterance(cleanText);
        
        // Ensure robust language code matching from LANGUAGES definition
        const matchedLang = LANGUAGES.find(l => l.code === language) || 
                            LANGUAGES.find(l => l.code.split('-')[0].toLowerCase() === (language || 'ja').split('-')[0].toLowerCase());
        utterance.lang = matchedLang ? matchedLang.locale : 'ja-JP';
        
        console.log(`[TTS] Speaking with lang: ${utterance.lang} (raw language prop: ${language})`);

        utterance.onend = () => {
            isSpeaking = false;
        };
        utterance.onerror = (event) => {
            console.error('[TTS] SpeechSynthesisUtterance error:', event);
            isSpeaking = false;
        };
        
        // Add a slight delay before speaking to avoid engine sync bugs in Chrome/macOS
        setTimeout(() => {
            if (isSpeaking && window.speechSynthesis) {
                window.speechSynthesis.speak(utterance);
            }
        }, 50);
    }

    $effect(() => {
        // Cancel speaking ONLY if currentIndex changes
        // Access currentIndex to establish dependency
        const _ = currentIndex;
        
        untrack(() => {
            if (browser && window.speechSynthesis && isSpeaking) {
                window.speechSynthesis.cancel();
                isSpeaking = false;
            }
        });
    });

    // Helper to calculate the single-page index matching the flat pages array
    function getPlainPageIndex(): number {
        return getPlainPageIndexFor(currentIndex, currentSubPage);
    }

    // Helper to calculate the single-page index for custom parameters
    function getPlainPageIndexFor(index: number, subPage: number): number {
        if (index === -1) return 0; // Cover
        
        let dataIndex = hasToc ? index - 1 : index;
        
        // TOC page
        if (hasToc && index === 0) {
            return 0;
        }
        
        // Author Bio page
        if (hasBio && index === total) {
            return pages.length - 1;
        }
        
        if (dataIndex < 0) dataIndex = 0;
        if (dataIndex >= spreads.length) dataIndex = spreads.length - 1;
        
        let pageIdx = dataIndex * 2;
        if (subPage === 1) {
            pageIdx += 1;
        }
        
        if (pageIdx >= pages.length) pageIdx = pages.length - 1;
        if (pageIdx < 0) pageIdx = 0;
        
        return pageIdx;
    }

    // Helper to jump to a single-page index (plain index) matching the flat pages array
    function jumpToPlainPageIndex(plainIndex: number) {
        if (plainIndex <= 0) {
            currentIndex = hasToc ? 0 : -1;
            currentSubPage = 0;
            return;
        }
        
        if (hasBio && plainIndex >= pages.length - 1) {
            currentIndex = total;
            currentSubPage = 0;
            return;
        }
        
        let dataIndex = Math.floor(plainIndex / 2);
        let subPage = plainIndex % 2;
        let targetIdx = hasToc ? dataIndex + 1 : dataIndex;
        
        if (targetIdx > total) targetIdx = total;
        if (targetIdx < -1) targetIdx = -1;
        
        currentIndex = targetIdx;
        currentSubPage = subPage;
    }

    // Reactive sync for page change
    $effect(() => {
        // Establish reactive dependency
        const _idx = currentIndex;
        const _sub = currentSubPage;
        const currentIdx = getPlainPageIndex();
        const currentSub = currentSubPage;
        
        untrack(() => {
            if (iframeSource) {
                (iframeSource as any).postMessage({
                    type: 'HCB_PAGE_CHANGED',
                    payload: {
                        currentPageIndex: currentIdx,
                        currentSubPage: currentSub
                    }
                }, iframeOrigin);
                console.log('[HyperCardBook] Sent HCB_PAGE_CHANGED to iframe:', currentIdx);
            }
        });
    });

    // Book state
    let title = $state('');
    let author = $state('');
    let coverImage = $state('');
    let authorImage = $state('');
    let authorBio = $state('');
    let themeColor = $state('black');
    let parsedId = $state('');
    let bookId = $derived(id || parsedId);
    let spreads = $state<Array<{ title: string; leftMarkdown: string; rightMarkdown: string }>>([]);
    let bookLocalStyles = $state('');
    let pluginStyles = $state('');
    let userStyles = $derived(bookLocalStyles + '\n' + pluginStyles);
    let bookmarkHtml = $state('');
    let hooks = $state<{ [key: string]: string }>({});
    let pageHooks = $state<{ [pageIndex: number]: Array<{ eventName: string, skillName: string, args: string[] }> }>({});

    // Dynamic ES Module Skill runner using Blob URL
    async function runPageSkill(skillName: string, args: string[]) {
        try {
            // 1. Try user custom skill first
            let url = `/api/skills/${currentUserId}/${skillName}/index.js`;
            let res = await fetch(url);
            if (!res.ok) {
                // 2. Fallback to global skill
                url = `/api/skills/global/${skillName}/index.js`;
                res = await fetch(url);
            }
            if (!res.ok) {
                console.warn(`[SkillRunner] Skill "${skillName}" not found in user or global directory.`);
                return;
            }

            const code = await res.text();
            const blob = new Blob([code], { type: 'application/javascript' });
            const blobUrl = URL.createObjectURL(blob);
            const module = await import(blobUrl);
            const executeFn = module.default;
            URL.revokeObjectURL(blobUrl);

            if (typeof executeFn === 'function') {
                const context = {
                    goCard: (index: number) => {
                        if (index !== undefined && index !== null && index >= 0) {
                            currentIndex = index;
                            currentSubPage = 0;
                        }
                    },
                    saveData: (key: string, value: any) => {
                        if (browser) localStorage.setItem(key, JSON.stringify(value));
                    },
                    getData: (key: string) => {
                        if (!browser) return null;
                        const item = localStorage.getItem(key);
                        try { return item ? JSON.parse(item) : null; } catch { return item; }
                    },
                    alert: (msg: string) => {
                        if (browser) window.alert(msg);
                    },
                    stackId: bookId,
                    currentCard: currentIndex,
                    cardText: getCardText(currentIndex)
                };
                await executeFn(context, ...args);
            }
        } catch (err) {
            console.error(`[SkillRunner] Error executing page skill "${skillName}":`, err);
        }
    }

    async function executePageHooks(eventName: string, plainPageIdx: number) {
        const hooksForPage = pageHooks[plainPageIdx];
        if (!hooksForPage) return;
        for (const h of hooksForPage) {
            if (h.eventName.toLowerCase() === eventName.toLowerCase()) {
                await runPageSkill(h.skillName, h.args);
            }
        }
    }

    // HyperHooks Execution Engine
    function getCardText(index: number): string {
        if (index === -1) return "Cover: " + title;
        if (hasBio && index === total) return authorBio;
        if (hasToc && index === 0) return "Contents";
        const dataIndex = hasToc ? index - 1 : index;
        const spread = spreads[dataIndex];
        if (!spread) return "";
        return (spread.leftMarkdown || "") + "\n" + (spread.rightMarkdown || "");
    }

    function executeLocalHook(scriptText: string, payload: any = {}) {
        try {
            const context = {
                goCard: (index: number) => {
                    if (index === undefined || index === null || index < 0) return;
                    currentIndex = index;
                    currentSubPage = 0;
                },
                saveData: (key: string, value: any) => {
                    if (browser) localStorage.setItem(key, JSON.stringify(value));
                },
                getData: (key: string) => {
                    if (!browser) return null;
                    const item = localStorage.getItem(key);
                    try { return item ? JSON.parse(item) : null; } catch { return item; }
                },
                alert: (msg: string) => {
                    if (browser) window.alert(msg);
                },
                stackId: bookId,
                currentCard: currentIndex,
                cardText: getCardText(currentIndex),
                ...payload
            };

            const fn = new Function('context', `
                with(context) {
                    ${scriptText}
                }
            `);
            fn(context);
        } catch (e) {
            console.error(`[HyperHooks] Local execution error:`, e);
        }
    }

    async function executeAiHook(eventName: string, instruction: string, payload: any) {
        try {
            const cardText = getCardText(currentIndex);
            const res = await fetch('/api/hook-ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    eventName,
                    instruction,
                    cardText,
                    stackId: bookId,
                    currentCard: currentIndex
                })
            });

            if (res.ok) {
                const data = await res.json();
                if (data.result && onHookAiResult) {
                    onHookAiResult({
                        eventName,
                        result: data.result,
                        command: data.command
                    });
                }
                if (data.command) {
                    executeLocalHook(data.command, payload);
                }
            } else {
                console.error(`[HyperHooks] AI execution failed:`, res.statusText);
            }
        } catch (err) {
            console.error(`[HyperHooks] Error executing AI hook:`, err);
        }
    }

    async function executeHook(eventName: string, eventPayload: any = {}) {
        const hookContent = hooks[eventName];
        if (!hookContent) return;

        console.log(`[HyperHooks] Triggered event: ${eventName}`);

        // [AI]タグが含まれているか、またはプログラム的でない（自然言語）場合にAI実行
        const isAiRequired = hookContent.includes('[AI]') || 
                             (!hookContent.includes(';') && !hookContent.includes('(') && !/^[a-zA-Z0-9_\s\.\(\)\;\{\}\[\]\'\"]+$/.test(hookContent));

        if (isAiRequired) {
            console.log(`[HyperHooks] Dynamic AI execution required for event: ${eventName}`);
            await executeAiHook(eventName, hookContent, eventPayload);
        } else {
            console.log(`[HyperHooks] Local execution for event: ${eventName}`);
            executeLocalHook(hookContent, eventPayload);
        }
    }

    // Monitor HyperHooks lifecycle events
    let prevOpened = false;
    $effect(() => {
        const opened = isOpened;
        untrack(() => {
            if (opened && !prevOpened) {
                executeHook('openStack');
            } else if (!opened && prevOpened) {
                executeHook('closeStack');
            }
            prevOpened = opened;
        });
    });

    let prevIndex = -1;
    let prevSubPage = 0;
    $effect(() => {
        const currentIdx = currentIndex;
        const currentSub = currentSubPage;
        untrack(() => {
            if (currentIdx !== prevIndex || currentSub !== prevSubPage) {
                // closeCard
                if (prevIndex !== -1) {
                    executeHook('closeCard', { prevCard: prevIndex, prevSub: prevSubPage });
                    
                    const prevPlainIdx = getPlainPageIndexFor(prevIndex, prevSubPage);
                    executePageHooks('onClosePage', prevPlainIdx);
                    if (viewMode === 'spread') {
                        executePageHooks('onClosePage', prevPlainIdx + 1);
                    }
                }
                // openCard
                if (currentIdx !== -1) {
                    executeHook('openCard', { currentCard: currentIdx, currentSub: currentSub });
                    
                    const leftIdx = getPlainPageIndex();
                    executePageHooks('onOpenPage', leftIdx);
                    if (viewMode === 'spread') {
                        executePageHooks('onOpenPage', leftIdx + 1);
                    }
                }
            }
            prevIndex = currentIdx;
            prevSubPage = currentSub;
        });
    });


    let currentSubPage = $state(0); // 0 = Left page, 1 = Right page (for vertical smartphone mode)
    let isOpened = $state(false);
    let viewMode = $state('spread'); // 'spread' or 'vertical'
    let uiTheme = $state('light'); // 'light' or 'dark' (for UI background)
    let insertToc = $state(false);
    let isFullscreen = $state(false);

    let bookEl: HTMLDivElement | null = $state(null);
    let pageSliderEl: HTMLInputElement | null = $state(null);

    // Watch markdown changes, handle translation if needed, and parse displayMarkdown
    let displayMarkdown = $state('');
    let isLoadingTranslation = $state(false);

    $effect(() => {
        if (markdown) {
            if (language === 'ja') {
                displayMarkdown = markdown;
                isLoadingTranslation = false;
            } else {
                loadTranslation();
            }
        }
    });

    async function loadTranslation() {
        if (!id || !language || language === 'ja') return;
        
        const isUserBook = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        if (!isUserBook) {
            const cacheKey = `sample-book-${id}-${language}`;
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                displayMarkdown = cached;
                isLoadingTranslation = false;
                return;
            }
        }

        isLoadingTranslation = true;
        try {
            const res = await fetch('/api/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bookId: id,
                    targetLanguage: language
                })
            });
            if (res.ok) {
                const data = await res.json();
                displayMarkdown = data.markdown;
                
                if (!isUserBook) {
                    const cacheKey = `sample-book-${id}-${language}`;
                    localStorage.setItem(cacheKey, data.markdown);
                }
            } else {
                console.error('Translation failed, fallback to original.');
                displayMarkdown = markdown;
            }
        } catch (err) {
            console.error('Error fetching translation:', err);
            displayMarkdown = markdown;
        } finally {
            isLoadingTranslation = false;
        }
    }

    $effect(() => {
        if (displayMarkdown) {
            parseBookMarkdown(displayMarkdown);
        }
    });

    $effect(() => {
        const ids = activePluginIds || [];
        const uId = currentUserId || 'global';
        const myPlugins = ids.filter((pId: string) => pId.startsWith('my-plugin-'));
        console.log('[Book.svelte Plugin CSS] activePluginIds:', ids, 'currentUserId:', uId, 'filtered myPlugins:', myPlugins);
        if (myPlugins.length > 0) {
            const url = `/api/skills/css?userId=${encodeURIComponent(uId)}&pluginIds=${encodeURIComponent(myPlugins.join(','))}`;
            console.log('[Book.svelte Plugin CSS] Fetching URL:', url);
            fetch(url)
                .then(res => {
                    console.log('[Book.svelte Plugin CSS] Fetch response status:', res.status);
                    if (res.ok) return res.json();
                    throw new Error(`Failed to fetch plugin CSS, status: ${res.status}`);
                })
                .then(data => {
                    console.log('[Book.svelte Plugin CSS] Received CSS length:', (data.css || '').length);
                    pluginStyles = data.css || '';
                })
                .catch(err => {
                    console.error('[Book.svelte Plugin CSS] Fetch error:', err);
                    pluginStyles = '';
                });
        } else {
            console.log('[Book.svelte Plugin CSS] No custom plugins to fetch.');
            pluginStyles = '';
        }
    });

    $effect(() => {
        if (!browser) return;
        let styleEl = document.getElementById('book-dynamic-styles');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'book-dynamic-styles';
            document.head.appendChild(styleEl);
        }
        styleEl.textContent = userStyles;
        console.log('[Book.svelte style element] Applied styles to #book-dynamic-styles, length:', userStyles.length);
        
        return () => {
            const el = document.getElementById('book-dynamic-styles');
            if (el) el.remove();
        };
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

    function extractLargestHeading(md: string): string | null {
        if (!md) return null;
        const lines = md.split('\n');
        let h1: string | null = null;
        let h2: string | null = null;
        let h3: string | null = null;
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (/^#\s+(.+)/.test(trimmed)) {
                const match = trimmed.match(/^#\s+(.+)/);
                if (match && !h1) h1 = match[1].trim();
            } else if (/^##\s+(.+)/.test(trimmed)) {
                const match = trimmed.match(/^##\s+(.+)/);
                if (match && !h2) h2 = match[1].trim();
            } else if (/^###\s+(.+)/.test(trimmed)) {
                const match = trimmed.match(/^###\s+(.+)/);
                if (match && !h3) h3 = match[1].trim();
            }
        }
        
        const rawTitle = h1 || h2 || h3;
        if (!rawTitle) return null;
        
        return rawTitle.replace(/[\*_`]/g, '').trim();
    }

    let tocItems = $derived.by(() => {
        const items: Array<{ title: string; pageStr: string; jumpIndex: number }> = [];
        
        spreads.forEach((spread, i) => {
            // Left page
            const leftHeading = extractLargestHeading(spread.leftMarkdown);
            if (leftHeading) {
                items.push({
                    title: leftHeading,
                    pageStr: (i * 2 + 1).toString(),
                    jumpIndex: hasToc ? i + 1 : i
                });
            }
            
            // Right page
            const rightHeading = extractLargestHeading(spread.rightMarkdown);
            if (rightHeading) {
                items.push({
                    title: rightHeading,
                    pageStr: (i * 2 + 2).toString(),
                    jumpIndex: hasToc ? i + 1 : i
                });
            }
        });
        
        if (hasBio) {
            items.push({
                title: "Author",
                pageStr: (spreads.length * 2 + 1).toString(),
                jumpIndex: total
            });
        }
        
        return items;
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
        let parsedIdLocal = '';
        let parsedTitle = '';
        let parsedAuthor = '';
        let parsedCoverImage = '';
        let parsedAuthorImage = '';
        let parsedAuthorBio = '';
        let parsedThemeColor = 'black';
        let parsedSpreads: typeof spreads = [];
        let parsedUserStyles = '';

        // Extract frontmatter
        let parsedBookmarkHtml = '';
        let parsedHooks: typeof hooks = {};

        const fmMatch = trimmedMd.match(/^---\s*([\s\S]*?)\s*---/);
        if (fmMatch) {
            const fmLines = fmMatch[1].split('\n');
            fmLines.forEach(line => {
                const parts = line.split(':');
                if (parts.length >= 2) {
                    const k = parts[0].trim();
                    const v = parts.slice(1).join(':').trim();
                    if (k === 'id') parsedIdLocal = v.replace(/[^a-zA-Z0-9_\-]/g, '');
                    if (k === 'title') parsedTitle = v;
                    if (k === 'author') parsedAuthor = v;
                    if (k === 'cover_image') parsedCoverImage = normalizePath(v);
                    if (k === 'author_image') parsedAuthorImage = normalizePath(v);
                    if (k === 'theme_color') parsedThemeColor = v;
                    
                    // Single-line hooks extraction (e.g. on_open_card: goCard(3))
                    if (k.startsWith('on_') && !v.startsWith('|')) {
                        // Convert snake_case to camelCase (e.g. on_open_card -> openCard)
                        const camelKey = k.substring(3).replace(/_([a-z])/g, (_, char) => char.toUpperCase());
                        parsedHooks[camelKey] = v;
                    }
                }
            });
            
            const bioMatch = fmMatch[1].match(/author_bio:\s*\|\s*\n([\s\S]*)/);
            if (bioMatch) {
                parsedAuthorBio = bioMatch[1].trim();
            }

            // Multi-line bookmark_html extraction
            const bookmarkMatch = fmMatch[1].match(/bookmark_html:\s*\|\s*\n([\s\S]*?)(?=\n[a-zA-Z0-9_\-]+\s*:|\n---|\s*$)/);
            if (bookmarkMatch) {
                parsedBookmarkHtml = bookmarkMatch[1].trim();
            } else {
                const bookmarkSingleMatch = fmMatch[1].match(/bookmark_html:\s*(.+)/);
                if (bookmarkSingleMatch && !bookmarkSingleMatch[1].trim().startsWith('|')) {
                    parsedBookmarkHtml = bookmarkSingleMatch[1].trim();
                }
            }

            // Multi-line hooks extraction
            const hookMatches = fmMatch[1].matchAll(/(on_[a-zA-Z0-9_\-]+):\s*\|\s*\n([\s\S]*?)(?=\n[a-zA-Z0-9_\-]+\s*:|\n---|\s*$)/g);
            for (const match of hookMatches) {
                const camelKey = match[1].substring(3).replace(/_([a-z])/g, (_, char) => char.toUpperCase()).trim();
                const content = match[2].trim();
                parsedHooks[camelKey] = content;
            }
        }

        // Split pages
        let contentWithoutFm = trimmedMd.replace(/^---\s*([\s\S]*?)\s*---/, '').trim();

        // Extract user style blocks from body
        const styleRegex = /<style>([\s\S]*?)<\/style>/gi;
        let styleMatch;
        while ((styleMatch = styleRegex.exec(contentWithoutFm)) !== null) {
            parsedUserStyles += styleMatch[1] + '\n';
        }
        contentWithoutFm = contentWithoutFm.replace(/<style>[\s\S]*?<\/style>/gi, '');

        let pagesRaw = contentWithoutFm.split(/(?:Page\s*\d+:|(?:^|\n)\s*\*\*\*\s*(?:\n|$))/i);
        pagesRaw = pagesRaw.map(p => p.trim()).filter(p => p.length > 0);

        // Parse page-level hooks and clean from rendering markdown
        let parsedPageHooks: typeof pageHooks = {};
        pagesRaw = pagesRaw.map((p, idx) => {
            const lines = p.split('\n');
            const cleanLines: string[] = [];
            const hooksList: Array<{ eventName: string, skillName: string, args: string[] }> = [];
            lines.forEach(line => {
                const trimmed = line.trim();
                if (trimmed.startsWith('/!')) {
                    const content = trimmed.substring(2).trim();
                    const parts = content.split(':');
                    if (parts.length >= 2) {
                        const eventName = parts[0].trim();
                        const rest = parts.slice(1).join(':').trim();
                        const restParts = rest.split(/\s+/);
                        const skillName = restParts[0].trim();
                        const args = restParts.slice(1).map(arg => arg.replace(/,$/, '').trim()).filter(Boolean);
                        hooksList.push({ eventName, skillName, args });
                    }
                } else {
                    cleanLines.push(line);
                }
            });
            if (hooksList.length > 0) {
                parsedPageHooks[idx] = hooksList;
            }
            return cleanLines.join('\n').trim();
        });
        pageHooks = parsedPageHooks;
        if (pagesRaw.length === 0 && contentWithoutFm.length > 0) {
            pagesRaw = [contentWithoutFm];
        }


        // Save parsed plain pages array for iframe AI context
        pages = pagesRaw.map(p => {
            let clean = p.trim();
            if (clean.endsWith('---')) {
                clean = clean.substring(0, clean.length - 3).trim();
            }
            return clean;
        });

        for (let i = 0; i < pagesRaw.length; i += 2) {
            const leftPart = pagesRaw[i] || "";
            const rightPart = pagesRaw[i+1] || "";
            
            const titleMatch = rightPart.match(/##\s*(.*)/) || leftPart.match(/##\s*(.*)/);
            const pageTitle = titleMatch ? titleMatch[1] : `Spread ${parsedSpreads.length + 1}`;

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
        parsedId = parsedIdLocal;
        bookmarkHtml = parsedBookmarkHtml;
        hooks = parsedHooks;
        bookLocalStyles = parsedUserStyles;
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
        
        let processed = content.split('\n').map(line => {
            const trimmed = line.trim();
            const videoMatch = trimmed.match(/^video:\s*(.*)/);
            if (videoMatch) {
                const videoUrl = videoMatch[1].trim();
                return `<div class="video-container"><iframe src="${getEmbedUrl(videoUrl)}" allowfullscreen></iframe></div>`;
            }
            return line;
        }).join('\n');

        processed = processed.replace(/(\n{2,})/g, (match, p1, offset, string) => {
            const before = string.substring(0, offset).trimEnd();
            const after = string.substring(offset + match.length).trimStart();
            if (before.endsWith('>') || after.startsWith('<') || after === '') {
                return match;
            }
            return '<br>'.repeat(match.length - 1) + '\n';
        });
        
        let html = marked.parse(processed) as string;
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
        if (currentIndex === -1) return "Cover";
        if (hasBio && currentIndex === total) return "Back Cover";
        if (hasToc && currentIndex === 0) return "Contents";
        const dataIndex = hasToc ? currentIndex - 1 : currentIndex;
        return `${dataIndex + 1} / ${spreads.length}`;
    }

    function getPageNumberStr(contentIndex: number) {
        if (contentIndex === -1) return "Cover";
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

    function handleInsertTocChange(isChecked: boolean) {
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
        // Prevent page turn when user is selecting text
        const selection = window.getSelection();
        if (selection && selection.toString().length > 0) {
            return;
        }

        if (
            (e.target as HTMLElement).closest('a') || 
            (e.target as HTMLElement).closest('.control-panel') ||
            (isWorkspace && (e.target as HTMLElement).tagName === 'IMG')
        ) {
            return;
        }
        
        executeHook('mouseUp', { clickEvent: e });
        
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
        marked.use({ renderer, breaks: true });

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

        // Iframe PostMessage communication support
        const handleMessage = (event: MessageEvent) => {
            if (!event.data || typeof event.data !== 'object') return;

            const { type, payload } = event.data;

            if (type === 'PAPE_READY') {
                console.log('[HyperCardBook] Received PAPE_READY from iframe');
                iframeSource = event.source;
                iframeOrigin = event.origin;

                // Send HCB_INIT_BOOK to iframe
                if (iframeSource) {
                    (iframeSource as any).postMessage({
                        type: 'HCB_INIT_BOOK',
                        payload: {
                            title: title,
                            totalPages: pages.length,
                            pages: $state.snapshot(pages),
                            currentPageIndex: getPlainPageIndex()
                        }
                    }, iframeOrigin);
                    console.log(`[HyperCardBook] Sent HCB_INIT_BOOK to iframe with ${pages.length} pages`);
                }
            } else if (type === 'PAPE_ACTION') {
                console.log('[HyperCardBook] Received PAPE_ACTION:', payload);
                if (payload) {
                    if (payload.action === 'next_page') {
                        jumpToPlainPageIndex(getPlainPageIndex() + 1);
                    } else if (payload.action === 'prev_page' || payload.action === 'previous_page') {
                        jumpToPlainPageIndex(getPlainPageIndex() - 1);
                    } else if (payload.action === 'go_to_page' || payload.action === 'jump_to_page') {
                        const targetIdx = Number(payload.pageIndex);
                        if (!isNaN(targetIdx)) {
                            jumpToPlainPageIndex(targetIdx);
                        }
                    }
                }
            }
        };

        window.addEventListener('message', handleMessage);

        return () => {
            window.removeEventListener('resize', adjustBookScale);
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('error', handleImageError, true);
            window.removeEventListener('message', handleMessage);
            if (browser && window.speechSynthesis) {
                window.speechSynthesis.cancel();
            }
        };
    });
</script>

<svelte:head>
    <!-- Marked and Mermaid load -->
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
</svelte:head>

<div class="book-workspace" data-theme={uiTheme} data-book-theme={['white', 'black', 'blue', 'pink', 'gold'].includes(themeColor) ? themeColor : 'black'} class:vertical-mode={viewMode === 'vertical'}>
    {#if backUrl}
        <button 
            id="backToShelfBtn"
            class="theme-switch" 
            style="position: fixed; top: 20px; left: 20px; z-index: 9999; padding: 8px 14px; font-size: 12px; border-radius: 20px;" 
            onclick={() => { if (window.history.length === 1 || window.opener) { window.close(); } else { goto(backUrl); } }}
        >
            Back
        </button>
    {/if}

    <div class="header-area">
        <div class="theme-switch-container">
            {#if activePluginIds.includes('reading-aloud')}
                <button class="theme-switch" onclick={handleToggleSpeak} title="Read Aloud">
                    {isSpeaking ? '⏸️' : '🔊'}
                </button>
            {/if}
            <button class="theme-switch" onclick={toggleViewMode} title="Switch View">
                {viewMode === 'vertical' ? '📖' : '📃'}
            </button>
            <button class="theme-switch" onclick={toggleTheme}>
                {uiTheme === 'dark' ? '☀️' : '🌙'}
            </button>
        </div>
        <div class="instruction-text">
            {currentIndex === -1 ? 'Click to read' : ''}
        </div>
    </div>

    <div class="book-viewport" style="position: relative;">
        {#if isLoadingTranslation}
            <div class="translation-loader" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.7); display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 1000; color: #fff; border-radius: 8px; backdrop-filter: blur(4px);">
                <div class="spinner" style="border: 4px solid rgba(255, 255, 255, 0.1); border-left-color: #8b5cf6; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin-bottom: 12px;"></div>
                <p style="font-family: inherit; font-size: 14px; letter-spacing: 0.05em; font-weight: 500; margin: 0;">Translating...</p>
            </div>
        {/if}
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
            <!-- はみ出ししおり用のスロット -->
            {#if bookmarkHtml}
                <div class="bookmark-slot" id="bookmarkSlot">
                    {@html bookmarkHtml}
                </div>
            {:else if activePluginIds.includes('bookmark-postit') && (hooks.openStack || hooks.closeCard)}
                <div class="bookmark-slot" id="bookmarkSlot">
                    <div class="default-bookmark">
                        📌 しおり
                    </div>
                </div>
            {/if}

            <!-- 表紙エリア -->
            <div class="cover-overlay" id="cover" style="background: {!['white', 'black', 'blue', 'pink', 'gold'].includes(themeColor) ? themeColor : ''}; transform: {isOpened ? 'rotateY(-110deg)' : 'none'}; opacity: {isOpened ? 0 : 1}; pointer-events: {isOpened ? 'none' : 'auto'};">
                {#if coverImage}
                    <img src={coverImage} alt={title} class="cover-image" id="coverImg" />
                {/if}
                <div class="cover-title" id="coverTitle">{title || ''}</div>
                {#if author}
                    <div class="cover-author" id="coverAuthor">{author}</div>
                {/if}
            </div>

            <!-- 見開き中身 -->
            <div class="book-content" style:opacity={isOpened ? 1 : 0}>
                <!-- 左ページ -->
                <div class="page-side" style:display={(currentIndex !== -1 && (viewMode === 'spread' || currentSubPage === 0)) ? 'flex' : 'none'}>
                    {#if hasBio && currentIndex === total}
                        <div class="image-container" id="imageArea" style:display="flex">
                            <img src={normalizePath(authorImage || 'author_avatar.png')} alt="Photo" style="width: auto !important; height: auto !important; max-width: 100% !important; max-height: 100% !important; border-radius: 50%; object-fit: cover; box-shadow: 0 6px 15px rgba(0,0,0,0.15);" />
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
                                <h2>Contents</h2>
                                <ul class="book-toc-list">
                                    {#each tocItems as item}
                                        <li>
                                            <a href="javascript:void(0)" onclick={(e) => { e.preventDefault(); jumpToPage(item.jumpIndex); }}>
                                                <span class="toc-title">{item.title}</span>
                                                <span class="toc-dots"></span>
                                                <span class="toc-page">{item.pageStr}</span>
                                            </a>
                                        </li>
                                    {/each}
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
    <div class="control-panel" class:opened={isOpened}>
        <button class="control-btn" onclick={goFirst} title="First Page">⇤</button>
        <button class="control-btn" onclick={goPrev} title="Previous Page">◀</button>
        <input 
            type="range" 
            bind:this={pageSliderEl}
            min="-1" 
            max={total} 
            value={currentIndex} 
            oninput={handleSliderInput} 
            class="page-slider"
        >
        <button class="control-btn" onclick={goNext} title="Next Page">▶</button>
        <button class="control-btn" onclick={goLast} title="Last Page">⇥</button>
        <button class="control-btn" onclick={toggleFullscreen} title="Fullscreen">
            {isFullscreen ? '↩︎' : '⛶'}
        </button>
    </div>

    <!-- ページダイレクトナビゲーション (目次) -->
    {#if hasToc}
        <div class="footer-box">
            <div style="max-width: 494px; margin: 0 auto; text-align: center;">
                <button 
                    id="restoreTocBtn"
                    class="theme-switch" 
                    style="padding: 8px 16px; font-size: 0.95rem; border-radius: 20px; cursor: pointer;"
                    onclick={() => handleInsertTocChange(false)}
                >
                    Close
                </button>
            </div>
        </div>
    {:else}
        <div class="footer-box">
            <div class="book-toc-container" style="max-width: 494px; margin: 0 auto; text-align: left; position: relative;">
                <div class="toc-header-wrapper" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 2px solid var(--text-color); padding-bottom: 6px;">
                    <h2 style="margin: 0; font-size: 1.3rem;">Contents</h2>
                    <label class="toc-checkbox-label" style="font-size: 0.9rem; opacity: 0.8; margin-left: auto;">
                        <input type="checkbox" checked={insertToc} onchange={(e) => handleInsertTocChange((e.target as HTMLInputElement).checked)} id="insertTocCheckbox" /> Add Contents page
                    </label>
                </div>
                <ul class="book-toc-list" style:display="block">
                    {#each tocItems as item}
                        <li>
                            <a href="javascript:void(0)" onclick={(e) => { e.preventDefault(); jumpToPage(item.jumpIndex); }}>
                                <span class="toc-title">{item.title}</span>
                                <span class="toc-dots"></span>
                                <span class="toc-page">{item.pageStr}</span>
                            </a>
                        </li>
                    {/each}
                </ul>
            </div>
        </div>
    {/if}
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
        --card-bg: rgba(0, 0, 0, 0.03);
        --card-border: rgba(0, 0, 0, 0.08);

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
        --card-bg: rgba(255, 255, 255, 0.05);
        --card-border: rgba(255, 255, 255, 0.1);
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
        align-items: center;
    }
    .theme-switch {
        padding: 8px 12px; border-radius: 20px;
        border: 1px solid var(--text-color);
        background: var(--page-color); color: var(--text-color);
        cursor: pointer; font-size: 11px;
        transition: 0.3s;
    }
    .theme-switch-container .theme-switch {
        height: 34px;
        padding: 0 12px;
        box-sizing: border-box;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--card-border);
        background: var(--card-bg);
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

    .bookmark-slot {
        position: absolute;
        top: 0;
        right: 30px;
        z-index: 150;
        pointer-events: auto;
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
        width: 494px; max-width: 100%; box-sizing: border-box;
        transition: all 0.3s;
        z-index: 999;
    }
    .control-panel.opened {
        width: 1040px;
        max-width: 100%;
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
        flex: 1; width: 100%; height: 4px;
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
    :global(:fullscreen) .book-workspace {
        background: var(--bg-color);
    }
    :global(:fullscreen) .header-area {
        display: none !important;
    }
    :global(:fullscreen) .footer-box {
        display: none !important;
    }
    :global(:fullscreen) .book-viewport {
        height: calc(100vh - 75px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 !important;
        margin: 0 !important;
    }
    :global(:fullscreen) .control-panel {
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

    .default-bookmark {
        background: #fef08a;
        color: #854d0e;
        padding: 10px 8px;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 11px;
        font-weight: bold;
        border-radius: 0 0 4px 4px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        border: 1px solid #fef08a;
        border-top: none;
        writing-mode: vertical-rl;
        letter-spacing: 0.1em;
        transition: transform 0.2s;
    }
    .default-bookmark:hover {
        transform: translateY(4px);
    }
</style>
