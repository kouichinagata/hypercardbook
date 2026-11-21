<script lang="ts">
    import { marked } from 'marked';
    import { onDestroy, onMount, tick } from 'svelte';
    import { browser } from '$app/environment';
    import './markdown-verify.css';
    import SignaturePad from '$lib/signature/SignaturePad.svelte';
    import { replaceSignedImages, replaceStampImages, isComplete, signSlotKinds, replaceSignMarkers, changeableSignKinds, replaceChangeableSigns, type SignKind } from '$lib/signature/markers';
    import { isVerifyDocument } from '$lib/signature/contract';
    import { replaceFieldMarkers, validateInput, scanFields, setFieldInMarkdown, changeableValues, applyChangeableValues, type FieldMarker } from '$lib/signature/fields';

    let {
        markdown = '',
        id = '',
        showNewTab = true,
        isEmbed = false,
        backUrl = '/',
        activePluginIds = [],
        currentUserId = 'global',
        onMarkdownChange = undefined,
        signer = undefined
    }: {
        markdown?: string; id?: string; showNewTab?: boolean; isEmbed?: boolean; backUrl?: string;
        activePluginIds?: string[]; currentUserId?: string;
        onMarkdownChange?: (markdown: string) => void;
        // Who may sign which slot, and how: sign() returns the new Markdown (the server has already saved it).
        // `changeable`: a {{MarkdownAIverify}} slot (signed again any number of times); `fields`: the changeable field values, saved with the signature.
        // canFill / fill do the same for Confirm fields ({{MarkdownAIinputConfirm}} / check / radio): text for an input, a boolean for check / radio.
        // fillChangeable saves a changeable field on the server each time it is changed; without it (the workspace) the change stays in the
        // Markdown on screen and the host saves it as usual.
        signer?: {
            canSign: (kind: SignKind) => boolean;
            sign: (slot: number, kind: SignKind, result: { svg: string; changeable?: boolean; fields?: (string | boolean | null)[] }) => Promise<string>;
            canFill?: () => boolean;
            fill?: (index: number, value: string | boolean) => Promise<string>;
            fillChangeable?: (index: number, value: string | boolean) => Promise<string>;
        };
    } = $props();

    // Iframe postMessage connection states
    let iframeSource: MessageEventSource | null = null;
    let iframeOrigin = '';
    const mermaidScriptUrl = 'https://cdn.jsdelivr.net/npm/mermaid@12.3.0/dist/mermaid.min.js';

    // iframe や直接アクセス時は非表示にするための判定
    let showBackBtn = $derived(
        browser && 
        backUrl && 
        (window.self === window.top) && 
        (window.history.length > 1) && 
        document.referrer !== ''
    );

    // Extract frontmatter-free raw markdown text
    let cleanMarkdownText = $derived.by(() => {
        if (!markdown) return '';
        return markdown.replace(/^---\s*[\s\S]*?\s*---/, '').trim();
    });

    const styleBlockPattern = new RegExp('<' + 'style>([\\s\\S]*?)<' + '[\\/]style>', 'gi');

    let cardLocalStyles = $derived.by(() => {
        if (!markdown) return '';
        const styleRegex = new RegExp(styleBlockPattern);
        let match;
        let styles = '';
        while ((match = styleRegex.exec(markdown)) !== null) {
            styles += match[1] + '\n';
        }
        return styles;
    });

    let cardUserStyles = $derived(cardLocalStyles);

    $effect(() => {
        if (!browser) return;
        let styleEl = document.getElementById('card-dynamic-styles');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'card-dynamic-styles';
            document.head.appendChild(styleEl);
        }
        // In embedded contexts (workspace, home modal, iframe embed) the host page owns
        // <body>/<html>, so rewrite those selectors to the card's own container to avoid
        // leaking author-provided CSS (e.g. `body { padding: 40px }`) onto the host layout.
        const cssToApply = isEmbed
            ? cardUserStyles.replace(/(^|[\s,{}])(html|body)(?=[\s,{.:#\[]|$)/gi, '$1.card-reader-container')
            : cardUserStyles;
        styleEl.textContent = cssToApply;
        console.log('[Card.svelte style element] Applied styles to #card-dynamic-styles, length:', cssToApply.length);

        return () => {
            const el = document.getElementById('card-dynamic-styles');
            if (el) el.remove();
        };
    });

    function loadScriptOnce(src: string) {
        return new Promise<void>((resolve, reject) => {
            const scriptTag = 'scr' + 'ipt';
            const existing = document.querySelector(`${scriptTag}[src="${src}"]`) as HTMLScriptElement | null;
            if (existing) {
                if (existing.dataset.loaded === 'true') {
                    resolve();
                    return;
                }
                existing.addEventListener('load', () => resolve(), { once: true });
                existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), {
                    once: true
                });
                return;
            }

            const script = document.createElement(scriptTag) as HTMLScriptElement;
            script.src = src;
            script.async = true;
            script.addEventListener(
                'load',
                () => {
                    script.dataset.loaded = 'true';
                    resolve();
                },
                { once: true }
            );
            script.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), {
                once: true
            });
            document.head.appendChild(script);
        });
    }

    onMount(() => {
        if (!browser) return;

        void loadScriptOnce(mermaidScriptUrl).then(() => {
            (window as any).mermaid.initialize({
                startOnLoad: false,
                theme: cardThemeColor === 'black' ? 'dark' : 'default',
            });
            // The body may have rendered before the script arrived, so draw the diagrams now
            const pending = [...document.querySelectorAll('.mermaid:not([data-processed="true"])')].filter((el) => el.getClientRects().length > 0);
            if (pending.length > 0) (window as any).mermaid.init(undefined, pending);
        }).catch((error) => {
            console.error('Mermaid script could not be loaded:', error);
        });

        const handleMessage = (event: MessageEvent) => {
            if (!event.data || typeof event.data !== 'object') return;

            const { type, payload } = event.data;

            if (type === 'PAPE_READY') {
                console.log('[HyperCard] Received PAPE_READY from iframe');
                iframeSource = event.source;
                iframeOrigin = event.origin;

                // Send HCB_INIT_BOOK to iframe (treating this card as a single-page book)
                if (iframeSource) {
                    (iframeSource as any).postMessage({
                        type: 'HCB_INIT_BOOK',
                        payload: {
                            title: cardTitle,
                            totalPages: 1,
                            pages: [cleanMarkdownText],
                            location: 'content',
                            viewMode: 'single',
                            currentPageIndex: 0,
                            visiblePageIndices: [0]
                        }
                    }, iframeOrigin);
                    console.log(`[HyperCard] Sent HCB_INIT_BOOK to iframe as a single-page card`);
                }
            }
        };

        window.addEventListener('message', handleMessage);
        
        return () => {
            window.removeEventListener('message', handleMessage);
        };
    });

    // Text to Speech states & methods
    let isSpeaking = $state(false);

    function handleToggleSpeak() {
        if (!browser || !window.speechSynthesis) return;
        
        if (isSpeaking) {
            window.speechSynthesis.cancel();
            isSpeaking = false;
            return;
        }
        
        const textToSpeak = cardBodyHtml.replace(/<[^>]*>/g, '').trim();
        
        if (!textToSpeak.trim()) return;
        speak(textToSpeak);
    }

    function speak(text: string) {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        
        isSpeaking = true;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ja-JP';
        utterance.onend = () => {
            isSpeaking = false;
        };
        utterance.onerror = () => {
            isSpeaking = false;
        };
        
        window.speechSynthesis.speak(utterance);
    }

    onDestroy(() => {
        if (browser && window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
    });

    $effect(() => {
        // Cancel speaking if markdown changes
        if (markdown && browser && window.speechSynthesis && isSpeaking) {
            window.speechSynthesis.cancel();
            isSpeaking = false;
        }
    });

    // Parse Card values
    let cardTitle = $derived.by(() => {
        const fmMatch = markdown.match(/^---\s*([\s\S]*?)\s*---/);
        if (fmMatch) {
            const fmLines = fmMatch[1].split('\n');
            for (let line of fmLines) {
                const parts = line.split(':');
                if (parts.length >= 2 && parts[0].trim() === 'title') {
                    return parts.slice(1).join(':').trim();
                }
            }
        }
        return 'Untitled Card';
    });

    let cardSlug = $derived.by(() => {
        const fmMatch = markdown.match(/^---\s*([\s\S]*?)\s*---/);
        if (fmMatch) {
            const fmLines = fmMatch[1].split('\n');
            for (let line of fmLines) {
                const parts = line.split(':');
                if (parts.length >= 2 && parts[0].trim() === 'id') {
                    return parts.slice(1).join(':').trim().replace(/[^a-zA-Z0-9_\-]/g, '');
                }
            }
        }
        return '';
    });

    let cardThemeColor = $derived.by(() => {
        const fmMatch = markdown.match(/^---\s*([\s\S]*?)\s*---/);
        if (fmMatch) {
            const fmLines = fmMatch[1].split('\n');
            for (let line of fmLines) {
                const parts = line.split(':');
                if (parts.length >= 2 && parts[0].trim() === 'theme_color') {
                    return parts.slice(1).join(':').trim();
                }
            }
        }
        return 'white';
    });

    // {{MarkdownAIverifyConfirm}} signature slots: pending (yellow) -> signed (blue, a plain Markdown image link) / error (red).
    // {{MarkdownAIverify}} slots can be signed again: clicking the signature opens the pad again.
    // Signing needs the host to provide both callbacks (the workspace of the user's own bookshelf); other views only show colors.
    let signingSlot = $state<number | null>(null);
    let signingChangeable = $state(false);
    let signErrorSlots = $state<number[]>([]);
    let signKinds = $derived(signSlotKinds(markdown));
    let changeableKinds = $derived(changeableSignKinds(markdown));

    async function saveSignature(slot: number, result: { svg: string }) {
        const changeable = signingChangeable;
        // The changeable fields on screen are saved together with the signature (the Sign button is what saves them)
        const values = changeableValues(markdown);
        try {
            const kind = (changeable ? changeableKinds[slot] : signKinds[slot]) ?? 'any';
            onMarkdownChange?.(await signer!.sign(slot, kind, { ...result, ...(changeable ? { changeable: true } : {}), ...(values.length ? { fields: values } : {}) }));
        } catch (err) {
            console.error('Signature failed:', err);
            if (changeable) alert(err instanceof Error ? err.message : 'Could not sign.');
            else signErrorSlots = [...signErrorSlots, slot];
        }
        signingSlot = null;
        signingChangeable = false;
    }

    function slotIsSignable(slot: number, changeable = false): boolean {
        const kind = changeable ? changeableKinds[slot] : signKinds[slot];
        return !!signer && !!kind && signer.canSign(kind);
    }

    // Confirm fields are live until the document is complete (every Confirm slot signed); a field is gone once confirmed.
    // Changeable fields stay live: each change is saved (by the server, or by the host from the Markdown on screen) and again with a signature.
    let fieldsLive = $derived(!!signer?.fill && !!signer.canFill?.() && !isComplete(markdown));
    let changeableLive = $derived(!!onMarkdownChange && !!signer?.canFill?.());

    // Changes are saved one after another, so a slower answer never overwrites a newer one
    let changeableQueue: Promise<void> = Promise.resolve();

    /** Save a changeable field's new value; focus stays where the user moved it */
    function keepChangeable(index: number, value: string | boolean) {
        const next = setFieldInMarkdown(markdown, index, value);
        if (next === null || next === markdown) return;
        changeableQueue = changeableQueue.then(async () => {
            let saved = next;
            if (signer?.fillChangeable) {
                try {
                    saved = await signer.fillChangeable(index, value);
                } catch (err) {
                    console.error('Saving the field failed:', err);
                    alert(err instanceof Error ? err.message : 'Could not save.');
                    return;
                }
            } else await new Promise((resolve) => setTimeout(resolve, 0));
            const focused = (document.activeElement as HTMLElement | null)?.closest?.('.field-slot')?.getAttribute('data-field');
            onMarkdownChange?.(saved);
            if (focused == null) return;
            await tick();
            (document.querySelector(`.card-webview-body .field-slot[data-field="${focused}"] :is(input, textarea)`) as HTMLElement | null)?.focus();
        });
    }

    function handleBodyChange(e: Event) {
        const box = e.target as HTMLInputElement | HTMLTextAreaElement | null;
        const slotEl = box?.closest?.('.field-slot[data-changeable]') as HTMLElement | null;
        if (!box || !slotEl || !changeableLive) return;
        const index = Number(slotEl.dataset.field);
        const field = scanFields(markdown)[index];
        if (!field || field.confirm) return;
        if (field.kind === 'check') keepChangeable(index, (box as HTMLInputElement).checked);
        else if (field.kind === 'radio') {
            if ((box as HTMLInputElement).checked) keepChangeable(index, true);
        } else {
            const problem = box.value === '' ? null : validateInput(field.input!, box.value);
            if (problem) {
                alert(problem);
                return;
            }
            keepChangeable(index, box.value);
        }
    }

    async function saveField(index: number, value: string | boolean) {
        try {
            const saved = await signer!.fill!(index, value);
            // The server's copy does not have the changeable values still on screen: keep them
            onMarkdownChange?.(applyChangeableValues(saved, changeableValues(markdown)) ?? saved);
        } catch (err) {
            console.error('Saving the field failed:', err);
            alert(err instanceof Error ? err.message : 'Could not save.');
        }
    }

    function commitField(slotEl: HTMLElement) {
        const index = Number(slotEl.dataset.field);
        const field = scanFields(markdown)[index];
        if (!field) return;
        if (field.kind === 'check') {
            saveField(index, (slotEl.querySelector('input') as HTMLInputElement).checked);
        } else if (field.kind === 'radio') {
            // The Confirm button sits on the last option; the selected one is whichever radio of the group is on
            const picked = slotEl.closest('.card-webview-body')?.querySelector(`input[name="${(slotEl.querySelector('input') as HTMLInputElement).name}"]:checked`) as HTMLInputElement | null;
            if (!picked) {
                alert('Select an option.');
                return;
            }
            saveField(Number(picked.dataset.field), true);
        } else {
            const box = slotEl.querySelector('input, textarea') as HTMLInputElement | HTMLTextAreaElement;
            const problem = validateInput(field.input!, box.value);
            if (problem) {
                alert(problem);
                return;
            }
            saveField(index, box.value);
        }
    }

    const attr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    function renderChangeableField(field: FieldMarker): string {
        const off = changeableLive ? '' : ' disabled';
        const n = field.index;
        const slot = (inner: string) => `<span class="field-slot" data-field="${n}" data-changeable="1">${inner}</span>`;
        if (field.kind === 'check') return slot(`<input class="field-toggle" type="checkbox"${field.checked ? ' checked' : ''}${off}>`);
        if (field.kind === 'radio') return slot(`<input class="field-toggle" type="radio" name="field-group-${field.group}" data-field="${n}"${field.checked ? ' checked' : ''}${off}>`);
        const spec = field.input!;
        const value = field.value ?? '';
        if (spec.type === 'date') return slot(`<input class="field-input" type="date" value="${attr(value)}"${off}>`);
        if (spec.type === 'textarea') return slot(`<textarea class="field-input" rows="4"${off}>${attr(value).replace(/\r?\n/g, '&#10;')}</textarea>`);
        const maxlength = spec.length === null ? '' : ` maxlength="${spec.length}"`;
        return slot(`<input class="field-input" type="text" value="${attr(value)}"${maxlength}${spec.type === 'digits' ? ' inputmode="numeric" pattern="[0-9]*"' : ''}${off}>`);
    }

    function renderField(field: FieldMarker): string {
        if (!field.confirm) return renderChangeableField(field);
        const off = fieldsLive ? '' : ' disabled';
        const n = field.index;
        // A check box or radio is followed by its label, so its Confirm button goes at the end of the label (see placeOkButtons)
        if (field.kind === 'check') {
            return `<span class="field-slot" data-field="${n}"><input class="field-toggle" type="checkbox"${field.checked ? ' checked' : ''}${off}></span>${okMark(n)}`;
        }
        if (field.kind === 'radio') {
            const mark = field.lastInGroup ? okMark(n) : '';
            return `<span class="field-slot" data-field="${n}"><input class="field-toggle" type="radio" name="field-group-${field.group}" data-field="${n}"${field.checked ? ' checked' : ''}${off}></span>${mark}`;
        }
        const spec = field.input!;
        let box: string;
        if (spec.type === 'date') box = `<input class="field-input" type="date"${off}>`;
        else if (spec.type === 'textarea') box = `<textarea class="field-input" rows="4"${off}></textarea>`;
        else {
            const maxlength = spec.length === null ? '' : ` maxlength="${spec.length}"`;
            box = `<input class="field-input" type="text"${maxlength}${spec.type === 'digits' ? ' inputmode="numeric" pattern="[0-9]*"' : ''}${off}>`;
        }
        return `<span class="field-slot" data-field="${n}">${box}<button type="button" class="field-ok"${off}>Confirm</button></span>`;
    }

    const okMark = (n: number) => `\u0000OK${n}\u0000`;

    /** Move each check box / radio Confirm mark past its label: to the end of the line, or of the table cell */
    function placeOkButtons(md: string): string {
        const off = fieldsLive ? '' : ' disabled';
        return md.replace(/\u0000OK(\d+)\u0000([^\r\n|\u0000]*?)([ \t]*)(?=\r?\n|\||\u0000|$)/g, (_m, n, label, tail) => `${label}<button type="button" class="field-ok" data-field="${n}"${off}>Confirm</button>${tail}`);
    }

    function handleBodyClick(e: MouseEvent) {
        const ok = (e.target as HTMLElement | null)?.closest?.('.field-ok') as HTMLElement | null;
        if (ok && fieldsLive) {
            // A text field's button sits in its slot; a check box / radio button sits after the label
            const slot = (ok.closest('.field-slot') ?? ok.closest('.card-webview-body')?.querySelector(`.field-slot[data-field="${ok.dataset.field}"]`)) as HTMLElement | null;
            if (slot) commitField(slot);
            return;
        }
        const again = (e.target as HTMLElement | null)?.closest?.('[data-cslot]') as HTMLElement | null;
        if (again) {
            if (!slotIsSignable(Number(again.dataset.cslot), true)) return;
            signingChangeable = true;
            signingSlot = Number(again.dataset.cslot);
            return;
        }
        const el = (e.target as HTMLElement | null)?.closest?.('.sign-pending') as HTMLElement | null;
        if (!el || !slotIsSignable(Number(el.dataset.slot))) return;
        // The last signature completes the document and locks its fields
        if (signKinds.length === 1 && scanFields(markdown).some((f) => f.confirm)) {
            alert('Fill in every field before the last signature.');
            return;
        }
        signingSlot = Number(el.dataset.slot);
    }

    function renderSignSlot(slot: number): string {
        if (signErrorSlots.includes(slot)) {
            return `<span class="sign-slot sign-error" data-slot="${slot}">sign error</span>`;
        }
        const signable = slotIsSignable(slot);
        const title = signable ? 'Click to sign' : 'You cannot sign this slot';
        return `<span class="sign-slot sign-pending" data-slot="${slot}" data-signable="${signable}" title="${title}">✍ sign here</span>`;
    }

    function renderChangeableSlot(slot: number, url: string | null): string {
        const signable = slotIsSignable(slot, true);
        if (url) {
            const title = signable ? 'Click to sign again' : 'Signature';
            return `<span class="sign-slot sign-signed${signable ? ' sign-again' : ''}" data-cslot="${slot}" title="${title}"><img src="${attr(url)}" alt="signature"></span>`;
        }
        const title = signable ? 'Click to sign' : 'You cannot sign this slot';
        return `<span class="sign-slot sign-pending" data-cslot="${slot}" data-signable="${signable}" title="${title}">✍ sign here</span>`;
    }

    // Templates, contracts and certificates get the business-document theme; an ordinary card (even with its own HTML form) does not
    let verifyDoc = $derived(isVerifyDocument(markdown));

    let cardBodyHtml = $derived.by(() => {
        if (!markdown) return '';
        // Fields are numbered on the whole Markdown, as the server does
        let cleanMd = placeOkButtons(replaceFieldMarkers(markdown, renderField)).replace(/^---\s*[\s\S]*?\s*---/, '').trim();
        // Remove the whole line of a style block so no blank line is left inside an HTML block (it would end the block)
        cleanMd = cleanMd.replace(new RegExp('^[ \\t]*<' + 'style>[\\s\\S]*?<' + '[\\/]style>[ \\t]*\\r?\\n?', 'gim'), '').replace(new RegExp(styleBlockPattern), '');
        // Seals pressed before the signature sit left-aligned in a row of inline boxes, so many of them wrap onto new lines
        cleanMd = replaceStampImages(cleanMd, (url) => `<span class="sign-slot sign-stamp"><img src="${url}" alt="seal"></span>`);
        cleanMd = replaceSignedImages(cleanMd, (url) => `<span class="sign-slot sign-signed"><img src="${url}" alt="signature"></span>`);
        cleanMd = replaceSignMarkers(cleanMd, renderSignSlot);
        cleanMd = replaceChangeableSigns(cleanMd, (slot, _kind, url) => renderChangeableSlot(slot, url));

        let processed = cleanMd.split('\n').map(line => {
            const trimmed = line.trim();
            const videoMatch = trimmed.match(/^video:\s*(.*)/);
            if (videoMatch) {
                const videoUrl = videoMatch[1].trim();
                return '<' + `div class="video-container"><iframe src="${getEmbedUrl(videoUrl)}" allowfullscreen></iframe></div>`;
            }
            return line;
        }).join('\n');

        // A Verify document spaces its blocks with CSS margins, not with injected <br>
        if (!verifyDoc) processed = processed.replace(/\n{2,}/g, (match: string, offset: number, string: string) => {
            if (((string.substring(0, offset).match(/^\s*(```|~~~)/gm) || []).length % 2) === 1 || /(```|~~~)$/.test(string.substring(0, offset).trimEnd())) return match;
            const before = string.substring(0, offset).trimEnd();
            const after = string.substring(offset + match.length).trimStart();
            if (before.endsWith('>') || after.startsWith('<') || after === '') {
                return match;
            }
            return '\n\n' + '<br>'.repeat(match.length - 1) + '\n\n';
        });
        
        // Setup custom renderer for card mermaid support
        const renderer = new marked.Renderer();
        (renderer as any).code = function(code: any, lang: any) {
            let codeText = typeof code === 'object' ? code.text : code;
            let codeLang = typeof code === 'object' ? code.lang : lang;
            if (codeLang === 'mermaid') {
                return '<' + `div class="mermaid">${codeText}</div>`;
            }
            return '<' + `pre><code>${codeText}</code></pre>`;
        };

        let html = marked.parse(processed, { renderer, breaks: true }) as string;
        html = html.replace(/src="books\//g, 'src="/books/');
        return html;
    });

    // Trigger mermaid rendering when card content updates
    $effect(() => {
        const _trigger = cardBodyHtml;
        import('svelte').then(({ tick }) => {
            tick().then(() => {
                if (browser && (window as any).mermaid) {
                    try {
                        // Skip diagrams inside a hidden pane (they would be measured as 0x0); the host re-renders when shown
                        const mermaidDivs = [...document.querySelectorAll('.mermaid:not([data-processed="true"])')].filter((el) => el.getClientRects().length > 0);
                        if (mermaidDivs.length > 0) {
                            (window as any).mermaid.init(undefined, mermaidDivs);
                        }
                    } catch (e) {
                        console.error("Card Mermaid render error:", e);
                    }
                }
            });
        });
    });

    function normalizePath(url: string): string {
        if (!url) return '';
        const trimmed = url.trim();
        if (trimmed.startsWith('books/') && !trimmed.startsWith('/')) {
            return '/' + trimmed;
        }
        return trimmed;
    }

    function getEmbedUrl(url: string): string {
        if (!url) return '';
        if (url.includes('tiktok.com')) {
            const parts = url.split('/');
            const videoId = parts[parts.length - 1].split('?')[0];
            return `https://www.tiktok.com/embed/v2/${videoId}`;
        }
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
        if (url.includes('instagram.com/reel/') || url.includes('instagram.com/p/')) {
            const keyword = url.includes('/reel/') ? '/reel/' : '/p/';
            const parts = url.split(keyword);
            const postId = parts[1].split('/')[0].split('?')[0];
            return `https://www.instagram.com/${keyword === '/reel/' ? 'reel' : 'p'}/${postId}/embed`;
        }
        return url;
    }


    let hasPublishedHtml = $state(false);

    $effect(() => {
        if (!browser) return;
        const targetSlug = cardSlug || id;
        if (targetSlug && currentUserId) {
            const publishedUrl = `/published/${currentUserId}/${targetSlug}.html`;
            fetch(publishedUrl)
                .then(res => {
                    if (res.ok) {
                        hasPublishedHtml = true;
                    }
                })
                .catch(err => {
                    console.error('Failed to check published HTML:', err);
                });
        }
    });

    function handleOpenPublishedHtml() {
        const targetSlug = cardSlug || id;
        if (targetSlug && currentUserId) {
            const publishedUrl = `/published/${currentUserId}/${targetSlug}.html`;
            window.open(publishedUrl, '_blank');
        }
    }
</script>

<div class="card-reader-container" data-theme-color={['white', 'black', 'blue', 'pink', 'gold'].includes(cardThemeColor) ? cardThemeColor : 'white'} class:embed-mode={isEmbed}>
    {#if !isEmbed && showBackBtn}
        <div class="reader-header-bar">
            <a class="back-btn" href={backUrl} onclick={(e) => { if (window.history.length === 1 || window.opener) { e.preventDefault(); window.close(); } }}>back</a>
        </div>
    {/if}

    <div class="card-webview-frame-wrapper" class:embed-mode={isEmbed}>
        {#if !isEmbed || activePluginIds.includes('reading-aloud')}
        <div class="card-action-container" class:embed-mode={isEmbed}>
            {#if activePluginIds.includes('reading-aloud')}
                <button class="card-action-btn" onclick={handleToggleSpeak} title="Read Aloud">
                    {isSpeaking ? '⏸️' : '🔊'}
                </button>
            {/if}
            {#if !isEmbed}
                {#if hasPublishedHtml}
                    <button class="card-action-btn" onclick={handleOpenPublishedHtml} title="Show Published HTML">
                        🌏
                    </button>
                {/if}
            {/if}
        </div>
        {/if}

        <div class="card-webview-frame" data-theme-color={['white', 'black', 'blue', 'pink', 'gold'].includes(cardThemeColor) ? cardThemeColor : 'white'} style={!['white', 'black', 'blue', 'pink', 'gold'].includes(cardThemeColor) ? `background-color: ${cardThemeColor};` : ''} class:embed-mode={isEmbed}>
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <div class="card-webview-body markdown-body" onclick={handleBodyClick} onchange={handleBodyChange}>
                {#if verifyDoc}
                    <div class="markdown-verify">{@html cardBodyHtml}</div>
                {:else}
                    {@html cardBodyHtml}
                {/if}
            </div>
        </div>
    </div>
</div>

{#if signingSlot !== null}
    <SignaturePad
        onsave={(result) => saveSignature(signingSlot!, result)}
        oncancel={() => ((signingSlot = null), (signingChangeable = false))}
    />
{/if}

<style>
    :global(.card-webview-body .field-slot) {
        display: inline-flex;
        gap: 6px;
        align-items: flex-start;
        vertical-align: middle;
    }
    :global(.card-webview-body .field-input) {
        padding: 4px 8px;
        border: 1px solid #bbb;
        border-radius: 6px;
        font: inherit;
        background: #fffbe0;
        color: #222;
    }
    :global(.card-webview-body textarea.field-input) {
        min-width: 16em;
    }
    :global(.card-webview-body .field-ok) {
        padding: 4px 10px;
        border: 1px solid #888;
        border-radius: 6px;
        background: #f3f3f3;
        color: #222;
        cursor: pointer;
    }
    :global(.card-webview-body .field-ok:disabled) {
        opacity: 0.5;
        cursor: default;
    }
    :global(.card-webview-body .field-toggle) {
        transform: scale(1.2);
        margin-right: 4px;
        vertical-align: middle;
    }
    :global(.card-webview-body .sign-slot) {
        display: inline-block;
        min-width: 8em;
        padding: 0 0.5em;
        border-radius: 4px;
        color: #555;
        vertical-align: middle;
    }
    :global(.card-webview-body .sign-pending) {
        background: #fff6b3;
        cursor: pointer;
    }
    :global(.card-webview-body .sign-focus) {
        outline: 3px solid #f59e0b;
        outline-offset: 2px;
    }
    :global(.card-webview-body .sign-signed) {
        background: #dbeafe;
    }
    :global(.card-webview-body .sign-again) {
        cursor: pointer;
    }
    :global(.card-webview-body .sign-signed img) {
        display: block;
        height: 3.5em;
        width: auto;
        margin: 0;
    }
    :global(.card-webview-body .sign-stamp) {
        min-width: 0;
        padding: 0;
        margin: 0 0.25em 0.25em 0;
        background: transparent;
    }
    :global(.card-webview-body .sign-stamp img) {
        display: block;
        height: 3.5em;
        width: auto;
        margin: 0;
    }
    :global(.card-webview-body .sign-error) {
        background: #fecaca;
    }
    .card-reader-container {
        width: 100vw;
        height: 100vh;
        background-color: #0b0c10;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .card-reader-container[data-theme-color="white"] {
        background-color: #f4eae1;
    }
    .card-reader-container[data-theme-color="black"] {
        background-color: #0b0c10;
    }

    .reader-header-bar {
        height: 50px;
        display: flex;
        align-items: center;
        padding: 0 20px;
        background-color: rgba(0, 0, 0, 0.4);
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        z-index: 100;
    }

    .back-btn {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #ffffff;
        padding: 6px 14px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
        text-decoration: none;
        transition: all 0.2s;
        font-family: system-ui, sans-serif;
    }

    .back-btn:hover {
        background: rgba(255, 255, 255, 0.12);
        transform: scale(1.02);
    }

    .card-webview-frame-wrapper {
        flex: 1;
        width: 100%;
        display: flex;
        flex-direction: column;
        position: relative;
        overflow-y: auto;
        padding: 0;
        box-sizing: border-box;
    }

    /* Card Action Buttons (Floating Panel) */
    .card-action-container {
        position: absolute;
        top: 20px;
        right: 40px;
        z-index: 100;
        display: flex;
        gap: 8px;
    }

    .card-action-btn {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: 1px solid rgba(255, 255, 255, 0.15);
        background: rgba(255, 255, 255, 0.08);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 16px;
        transition: all 0.2s;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
    }

    .card-action-btn:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.18);
        transform: scale(1.05);
    }

    .card-action-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    /* Card WebView Preview Frame */
    .card-webview-frame {
        width: 100%;
        max-width: 100%;
        margin: 0;
        padding: 20px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 24px;
        box-shadow: none;
        font-family: system-ui, -apple-system, sans-serif;
        border-radius: 0;
    }

    .card-webview-frame[data-theme-color="white"] {
        background-color: #ffffff;
        color: #1a1a1a;
    }

    .card-webview-frame[data-theme-color="black"] {
        background-color: #161616;
        color: #ffffff;
    }

    .card-webview-frame[data-theme-color="blue"] {
        background: linear-gradient(135deg, #0f2b5c 0%, #1e3c72 100%);
        color: #ffffff;
    }

    .card-webview-frame[data-theme-color="pink"] {
        background: linear-gradient(135deg, #ffdeed 0%, #ffb3d1 100%);
        color: #4a4a4a;
    }

    .card-webview-frame[data-theme-color="gold"] {
        background: linear-gradient(135deg, #4e2f15 0%, #2e1605 100%);
        color: #ffd700;
    }

    .card-webview-body {
        font-size: 15px;
        line-height: 1.7;
    }

    :global(.card-webview-body img) {
        max-width: 100%;
        border-radius: 8px;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.08);
        display: block;
        margin: 16px auto;
    }

    :global(.card-webview-body .video-container) {
        position: relative;
        padding-bottom: 56.25%;
        height: 0;
        overflow: hidden;
        border-radius: 8px;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
        margin: 16px 0;
    }

    :global(.card-webview-body .video-container iframe) {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        border: none;
    }

    /* Embed / Workspace Preview Adjustments */
    .card-reader-container.embed-mode {
        background-color: transparent !important;
        height: auto !important;
        width: auto !important;
        max-width: none !important;
        min-height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible;
        display: block;
    }
    
    .card-webview-frame-wrapper.embed-mode {
        padding: 0;
        overflow: visible;
    }

    .card-action-container.embed-mode {
        top: 20px;
        right: 20px;
    }

    .card-webview-frame.embed-mode {
        box-shadow: none;
        max-width: 100%;
        padding: 20px;
        overflow: visible;
        margin: 0;
        border-radius: 0;
    }
</style>
