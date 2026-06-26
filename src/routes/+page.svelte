<script lang="ts">
    import { onMount, tick } from 'svelte';
    import { goto, invalidateAll } from '$app/navigation';
    import { createBrowserClient } from '@supabase/ssr';
    import { env } from '$env/dynamic/public';
    import Bookshelf from '$lib/components/Bookshelf.svelte';
    import Book from '$lib/components/Book.svelte';
    import Card from '$lib/components/Card.svelte';
    import { LANGUAGES } from '$lib/languages';

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
    let formEl = $state<HTMLFormElement | null>(null);

    // Attached files state
    interface AttachedFile {
        id: string;
        type: 'image' | 'text';
        name: string;
        url?: string;
        content?: string;
        status: 'uploading' | 'loading' | 'success' | 'error';
        error?: string;
    }
    let attachedFiles = $state<AttachedFile[]>([]);
    let fileInputEl = $state<HTMLInputElement | null>(null);

    async function processAndUploadImage(file: File): Promise<string> {
        const compressedBlob = await compressImage(file);
        const sessionUser = data.session?.user;
        const userId = sessionUser?.id || 'guest';
        
        const cleanName = file.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const fileName = `${crypto.randomUUID()}_${cleanName}.webp`;
        const filePath = `${userId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('HyperCardBookBucket')
            .upload(filePath, compressedBlob, {
                contentType: 'image/webp',
                cacheControl: '3600'
            });

        if (uploadError) {
            throw uploadError;
        }

        const { data: publicUrlData } = supabase.storage
            .from('HyperCardBookBucket')
            .getPublicUrl(filePath);

        return publicUrlData.publicUrl;
    }

    async function handleAttachedFilesChange(e: Event) {
        const input = e.target as HTMLInputElement;
        if (!input.files || input.files.length === 0) return;
        
        const files = Array.from(input.files);
        
        for (const file of files) {
            const id = crypto.randomUUID();
            const isImage = file.type.startsWith('image/');
            const type = isImage ? 'image' : 'text';
            
            const newAttached: AttachedFile = {
                id,
                type,
                name: file.name,
                status: isImage ? 'uploading' : 'loading'
            };
            attachedFiles = [...attachedFiles, newAttached];
            
            if (isImage) {
                try {
                    const url = await processAndUploadImage(file);
                    attachedFiles = attachedFiles.map(f => 
                        f.id === id ? { ...f, status: 'success', url } : f
                    );
                } catch (err: any) {
                    console.error('Attached image upload failed:', err);
                    attachedFiles = attachedFiles.map(f => 
                        f.id === id ? { ...f, status: 'error', error: err.message || 'Upload failed' } : f
                    );
                }
            } else {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const content = event.target?.result as string;
                    attachedFiles = attachedFiles.map(f => 
                        f.id === id ? { ...f, status: 'success', content } : f
                    );
                };
                reader.onerror = (err) => {
                    console.error('File read error:', err);
                    attachedFiles = attachedFiles.map(f => 
                        f.id === id ? { ...f, status: 'error', error: 'Failed to read file' } : f
                    );
                };
                reader.readAsText(file);
            }
        }
        
        input.value = '';
    }

    async function removeAttachedFile(id: string) {
        const fileToRemove = attachedFiles.find(f => f.id === id);
        if (!fileToRemove) return;
        
        attachedFiles = attachedFiles.filter(f => f.id !== id);
        
        if (fileToRemove.type === 'image' && fileToRemove.status === 'success' && fileToRemove.url) {
            try {
                const urlParts = fileToRemove.url.split('/HyperCardBookBucket/');
                if (urlParts.length > 1) {
                    const filePath = decodeURIComponent(urlParts[1]);
                    await supabase.storage
                        .from('HyperCardBookBucket')
                        .remove([filePath]);
                }
            } catch (err) {
                console.error('Failed to delete file from storage on removal:', err);
            }
        }
    }

    // Bookshelf theme state
    let uiTheme = $state('dark');

    // Onboarding & Localization states
    let showOnboardingModal = $state(false);
    let onboardingNickname = $state('');
    let onboardingLanguage = $state('en');
    
    let currentLanguage = $state('en');
    let showLangDropdown = $state(false);
    let showFullLangModal = $state(false);
    let langSearchQuery = $state('');
    let translatedCovers = $state<Record<string, { title: string; author: string }>>({});

    // Quick access to top languages
    const QUICK_LANGUAGES = LANGUAGES.filter(l => ['en', 'ja', 'zh-CN', 'es', 'fr'].includes(l.code));

    let filteredLanguages = $derived(
        LANGUAGES.filter(lang => 
            lang.label.toLowerCase().includes(langSearchQuery.toLowerCase()) || 
            lang.code.toLowerCase().includes(langSearchQuery.toLowerCase())
        )
    );

    const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    onMount(() => {
        const savedTheme = localStorage.getItem('shelf-theme');
        if (savedTheme) {
            uiTheme = savedTheme;
        }

        // Determine default language
        const savedLang = localStorage.getItem('reader-lang');
        if (savedLang) {
            currentLanguage = savedLang;
        } else if (data.session?.user?.user_metadata?.language) {
            currentLanguage = data.session.user.user_metadata.language;
        } else {
            const browserLang = (navigator.language || 'en').toLowerCase();
            const matched = LANGUAGES.find(l => browserLang.startsWith(l.code.toLowerCase()) || l.code.toLowerCase().startsWith(browserLang));
            currentLanguage = matched ? matched.code : 'en';
        }

        // Check onboarding trigger (new logins with empty profile data)
        if (data.session?.user) {
            const metadata = data.session.user.user_metadata || {};
            if (!metadata.nickname || !metadata.language) {
                onboardingNickname = metadata.nickname || data.session.user.email?.split('@')[0] || '';
                onboardingLanguage = currentLanguage;
                showOnboardingModal = true;
            }
        }

        // Auto translate bookshelf covers on mount
        translateBookshelfCovers();

        // Tab focus detection to automatically refresh the bookshelf
        const handleWindowFocus = () => {
            invalidateAll();
        };
        window.addEventListener('focus', handleWindowFocus);

        // URLの launch_robo パラメータをチェックし、存在すれば自動起動
        const urlParams = new URLSearchParams(window.location.search);
        const launchRoboId = urlParams.get('launch_robo');
        if (launchRoboId) {
            let roboBook = data.books.find((b: any) => b.id === launchRoboId || b.slug === launchRoboId);
            if (!roboBook && data.publicBooks) {
                roboBook = data.publicBooks.find((b: any) => b.id === launchRoboId || b.slug === launchRoboId);
            }
            if (roboBook) {
                openHyperRoboView(roboBook);
            }
        }

        // Subscribe to realtime changes on the books table to auto-refresh bookshelf
        const channel = supabase
            .channel('bookshelf-realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'books' },
                () => {
                    invalidateAll();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
            window.removeEventListener('focus', handleWindowFocus);
        };
    });

    async function saveOnboarding() {
        if (!onboardingNickname.trim()) {
            alert('Please enter a pen name.');
            return;
        }
        try {
            const { error } = await supabase.auth.updateUser({
                data: {
                    nickname: onboardingNickname.trim(),
                    language: onboardingLanguage
                }
            });
            if (error) throw error;
            showOnboardingModal = false;
            currentLanguage = onboardingLanguage;
            localStorage.setItem('reader-lang', onboardingLanguage);
            await translateBookshelfCovers();
            await invalidateAll();
        } catch (err: any) {
            console.error('Failed to save onboarding settings:', err);
            alert(`Failed to save settings: ${err.message || err}`);
        }
    }

    async function selectLanguage(lang: string) {
        currentLanguage = lang;
        localStorage.setItem('reader-lang', lang);
        showLangDropdown = false;
        if (data.session?.user) {
            await supabase.auth.updateUser({
                data: { language: lang }
            });
        }
        await translateBookshelfCovers();
    }

    async function translateBookshelfCovers() {
        if (!data.books || data.books.length === 0) return;
        
        const targetLang = currentLanguage;
        
        for (const book of data.books) {
            if (targetLang === 'ja') {
                if (translatedCovers[book.id]) {
                    delete translatedCovers[book.id];
                }
                continue;
            }
            
            const isUserBook = isUuid(book.id);
            
            if (isUserBook) {
                try {
                    const { data: cached, error } = await supabase
                        .from('book_translations')
                        .select('title, author')
                        .eq('book_id', book.id)
                        .eq('language', targetLang)
                        .maybeSingle();
                        
                    if (cached) {
                        translatedCovers[book.id] = {
                            title: cached.title,
                            author: cached.author
                        };
                        continue;
                    }
                } catch (err) {
                    console.error('Failed to fetch cover cache from DB:', err);
                }
            } else {
                const cacheKey = `sample-cover-${book.id}-${targetLang}`;
                const cached = localStorage.getItem(cacheKey);
                if (cached) {
                    translatedCovers[book.id] = JSON.parse(cached);
                    continue;
                }
            }
            
            try {
                const res = await fetch('/api/translate-metadata', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: book.title,
                        author: book.author || '',
                        targetLanguage: targetLang
                    })
                });
                if (res.ok) {
                    const translated = await res.json();
                    translatedCovers[book.id] = {
                        title: translated.title,
                        author: translated.author
                    };
                    
                    if (!isUserBook) {
                        const cacheKey = `sample-cover-${book.id}-${targetLang}`;
                        localStorage.setItem(cacheKey, JSON.stringify(translatedCovers[book.id]));
                    }
                }
            } catch (err) {
                console.error('Failed to translate cover metadata:', err);
            }
        }
    }

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

        const hasPending = attachedFiles.some(f => f.status === 'uploading' || f.status === 'loading');
        if (hasPending) {
            alert('Please wait for files to finish.');
            return;
        }

        const successFiles = attachedFiles.filter(f => f.status === 'success');
        const images = successFiles.filter(f => f.type === 'image');
        const texts = successFiles.filter(f => f.type === 'text');

        let finalPrompt = prompt.trim();
        if (successFiles.length > 0) {
            finalPrompt += '\n\n<!-- ATTACHMENTS_START -->';
            if (images.length > 0) {
                finalPrompt += '\n### 添付画像\n' + images.map(img => `![${img.name}](${img.url})`).join('\n');
            }
            if (texts.length > 0) {
                finalPrompt += '\n### 添付テキスト\n' + texts.map(txt => `📄 ${txt.name}\n\`\`\`content\n${txt.content}\n\`\`\``).join('\n\n');
            }
            finalPrompt += '\n<!-- ATTACHMENTS_END -->';
        }

        isSubmitting = true;
        try {
            sessionStorage.setItem('workspace_init_prompt', finalPrompt);
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
        if (book.isStack) {
            openStackEditMode(book);
        } else if (book.playMode === 'hyperrobo') {
            openHyperRoboEditMode(book);
        } else {
            window.open(`/workspace?id=${book.id}`, '_blank');
        }
    }

    // Stack states
    let activeStack = $state<any | null>(null);
    let isStackSelectionMode = $state(false);
    let showStackModal = $state(false);
    let stackTitle = $state('HyperStack001');
    let stackDescription = $state('');
    let selectedStackBooks = $state<any[]>([]); // Array of { id, title, isCard }
    let editingStackId = $state(''); // Empty if creating a new stack

    let isHyperRoboSelectionMode = $state(false);
    let selectedHyperRoboBooks = $state<any[]>([]); // Array of { id, title, playMode }
    let selectedHyperRoboBookIds = $derived(selectedHyperRoboBooks.map(b => b.id));
    let hyperRoboTitle = $state('HyperRobo001');
    let hyperRoboDescription = $state('');
    let hideHyperbook = $state(false);
    let showHyperRoboModal = $state(false);
    let editingHyperRoboId = $state('');
    let isHyperRoboPublic = $state(false);
    let hyperRoboPublishedAt = $state<string | null>(null);
    let isSavingHyperRobo = $state(false);

    let showHyperRoboPublishModal = $state(false);
    let showHyperRoboUnpublishModal = $state(false);
    let hyperRoboConfirmLegal = $state(false);

    function getNextHyperRoboDefaultTitle() {
        let maxNum = 0;
        if (data.books) {
            data.books.forEach((b: any) => {
                if (b.playMode === 'hyperrobo' && b.title) {
                    const match = b.title.match(/^HyperRobo(\d+)$/);
                    if (match) {
                        const num = parseInt(match[1], 10);
                        if (num > maxNum) {
                            maxNum = num;
                        }
                    }
                }
            });
        }
        const nextNum = maxNum + 1;
        const padded = String(nextNum).padStart(3, '0');
        return `HyperRobo${padded}`;
    }

    function getNextStackDefaultTitle() {
        let maxNum = 0;
        if (data.books) {
            data.books.forEach((b: any) => {
                if (b.isStack && b.title) {
                    const match = b.title.match(/^HyperStack(\d+)$/);
                    if (match) {
                        const num = parseInt(match[1], 10);
                        if (num > maxNum) {
                            maxNum = num;
                        }
                    }
                }
            });
        }
        const nextNum = maxNum + 1;
        const padded = String(nextNum).padStart(3, '0');
        return `HyperStack${padded}`;
    }

    let showStackPublishModal = $state(false);
    let stackConfirmLegal = $state(false);
    let isStackPublic = $state(false);
    let stackPublishedAt = $state<string | null>(null);

    let showPublicSection = $state(false);
    let publicBooksList = $state<any[]>([]);
    let hasMorePublic = $state(false);
    let isLoadingMorePublic = $state(false);

    let myBooksList = $derived(data.books.filter((b: any) => !b.isSample));
    let sampleBooksList = $derived(data.books.filter((b: any) => b.isSample));

    function localizeBook(b: any) {
        if (!b) return b;
        const trans = translatedCovers[b.id];
        return {
            ...b,
            title: trans?.title || b.title,
            author: trans?.author || b.author
        };
    }

    let myBooksListLocalized = $derived(myBooksList.map(localizeBook));
    let sampleBooksListLocalized = $derived(sampleBooksList.map(localizeBook));
    let publicBooksListLocalized = $derived(publicBooksList.map(localizeBook));

    $effect(() => {
        if (data.publicBooks) {
            publicBooksList = [...data.publicBooks];
        }
        if (data.hasMorePublic !== undefined) {
            hasMorePublic = data.hasMorePublic;
        }
    });

    async function handleLoadPublicBooks() {
        showPublicSection = true;
    }

    async function loadMorePublicBooks() {
        if (isLoadingMorePublic) return;
        isLoadingMorePublic = true;
        try {
            const offset = publicBooksList.length;
            const res = await fetch(`/api/public-books?offset=${offset}&limit=50`);
            if (res.ok) {
                const result = await res.json();
                publicBooksList = [...publicBooksList, ...result.books];
                hasMorePublic = result.hasMore;
            } else {
                console.error('Failed to load public books:', await res.text());
            }
        } catch (err) {
            console.error('Error fetching public books:', err);
        } finally {
            isLoadingMorePublic = false;
        }
    }

    // Stack helper functions
    function toggleStackSelectionMode() {
        isStackSelectionMode = !isStackSelectionMode;
        if (isStackSelectionMode) {
            selectedStackBooks = [];
            stackTitle = getNextStackDefaultTitle();
            stackDescription = '';
            editingStackId = '';
            isStackPublic = false;
            stackPublishedAt = null;
            showStackModal = true;
        } else {
            showStackModal = false;
        }
    }

    function cancelStackSelection() {
        isStackSelectionMode = false;
        showStackModal = false;
        selectedStackBooks = [];
        editingStackId = '';
        stackDescription = '';
        isStackPublic = false;
        stackPublishedAt = null;
    }

    function toggleHyperRoboSelectionMode() {
        isHyperRoboSelectionMode = !isHyperRoboSelectionMode;
        if (isHyperRoboSelectionMode) {
            selectedHyperRoboBooks = [];
            hyperRoboTitle = getNextHyperRoboDefaultTitle();
            hyperRoboDescription = '';
            hideHyperbook = false;
            editingHyperRoboId = '';
            isHyperRoboPublic = false;
            hyperRoboPublishedAt = null;
            showHyperRoboModal = true;
        } else {
            showHyperRoboModal = false;
        }
    }

    function cancelHyperRoboSelection() {
        isHyperRoboSelectionMode = false;
        showHyperRoboModal = false;
        selectedHyperRoboBooks = [];
        editingHyperRoboId = '';
        hyperRoboDescription = '';
        hideHyperbook = false;
        isHyperRoboPublic = false;
        hyperRoboPublishedAt = null;
        isSavingHyperRobo = false;
    }

    function handleToggleHyperRoboSelection(book: any) {
        const isPape = book.playMode === 'paperobo';
        const exists = selectedHyperRoboBooks.find(b => b.id === book.id);

        if (exists) {
            selectedHyperRoboBooks = selectedHyperRoboBooks.filter(b => b.id !== book.id);
        } else {
            if (isPape) {
                selectedHyperRoboBooks = [
                    ...selectedHyperRoboBooks.filter(b => b.playMode !== 'paperobo'),
                    { id: book.id, title: book.title, playMode: book.playMode, coverImage: book.coverImage }
                ];
            } else {
                selectedHyperRoboBooks = [
                    ...selectedHyperRoboBooks.filter(b => b.playMode === 'paperobo'),
                    { id: book.id, title: book.title, playMode: book.playMode, coverImage: book.coverImage }
                ];
            }
        }
    }

    async function saveHyperRobo() {
        if (isSavingHyperRobo) return;

        if (selectedHyperRoboBooks.length !== 2) {
            alert('Please select one PapeRobo character and one HyperBook/Card.');
            return;
        }

        const papeBook = selectedHyperRoboBooks.find(b => b.playMode === 'paperobo');
        const hyperBook = selectedHyperRoboBooks.find(b => b.playMode !== 'paperobo');

        if (!papeBook || !hyperBook) {
            alert('Selection must include one PapeRobo character and one HyperBook/Card.');
            return;
        }

        isSavingHyperRobo = true;
        const titleText = hyperRoboTitle.trim() || getNextHyperRoboDefaultTitle();
        const hyperRoboId = editingHyperRoboId || `hyperrobo-${Date.now()}`;
        const coverImageUrl = papeBook.coverImage || '';

        const markdown = `---
title: ${titleText}
author: HyperRobo
theme_color: black
play_mode: hyperrobo
id: ${hyperRoboId}
cover_image: ${coverImageUrl}
is_public: ${isHyperRoboPublic}
${hyperRoboPublishedAt ? `published_at: ${hyperRoboPublishedAt}` : ''}
paperobo_slug: ${papeBook.id}
hyperbook_id: ${hyperBook.id}
description: "${(hyperRoboDescription || '').replace(/\n/g, ' ').replace(/"/g, '\\"')}"
hide_hyperbook: ${hideHyperbook}
---

# ${titleText}
PapeRobo: ${papeBook.title}
HyperBook: ${hyperBook.title}
`;

        try {
            const response = await fetch('/api/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    markdown, 
                    id: editingHyperRoboId ? hyperRoboId : undefined,
                    is_public: isHyperRoboPublic,
                    published_at: hyperRoboPublishedAt
                })
            });

            if (response.ok) {
                isHyperRoboSelectionMode = false;
                showHyperRoboModal = false;
                selectedHyperRoboBooks = [];
                editingHyperRoboId = '';
                isHyperRoboPublic = false;
                hyperRoboPublishedAt = null;
                hyperRoboDescription = '';
                hideHyperbook = false;
                await invalidateAll();
            } else {
                const errData = await response.json();
                alert(`Failed to save HyperRobo: ${errData.error}`);
            }
        } catch (err) {
            console.error('Save HyperRobo error:', err);
            alert('An error occurred during save.');
        } finally {
            isSavingHyperRobo = false;
        }
    }

    function openHyperRoboEditMode(book: any) {
        editingHyperRoboId = book.id;
        hyperRoboTitle = book.title;
        isHyperRoboPublic = book.is_public || false;
        hyperRoboPublishedAt = book.published_at || null;
        hyperRoboDescription = book.description || '';
        hideHyperbook = book.hideHyperbook || false;

        const paperoboSlug = book.paperoboSlug || '';
        const hyperbookId = book.hyperbookId || '';

        let papeBook = data.books.find((b: any) => b.id === paperoboSlug || b.slug === paperoboSlug);
        if (!papeBook && data.publicBooks) {
            papeBook = data.publicBooks.find((b: any) => b.id === paperoboSlug || b.slug === paperoboSlug);
        }
        let hyperBook = data.books.find((b: any) => b.id === hyperbookId || b.slug === hyperbookId);
        if (!hyperBook && data.publicBooks) {
            hyperBook = data.publicBooks.find((b: any) => b.id === hyperbookId || b.slug === hyperbookId);
        }

        selectedHyperRoboBooks = [];
        if (papeBook) {
            selectedHyperRoboBooks.push({ id: papeBook.id, title: papeBook.title, playMode: papeBook.playMode, coverImage: papeBook.coverImage });
        }
        if (hyperBook) {
            selectedHyperRoboBooks.push({ id: hyperBook.id, title: hyperBook.title, playMode: hyperBook.playMode, coverImage: hyperBook.coverImage });
        }

        isHyperRoboSelectionMode = true;
        showHyperRoboModal = true;
    }

    function handleHyperRoboPublishBtnClick() {
        if (isHyperRoboPublic) {
            showHyperRoboUnpublishModal = true;
        } else {
            hyperRoboConfirmLegal = false;
            showHyperRoboPublishModal = true;
        }
    }

    function executeHyperRoboPublish() {
        if (!hyperRoboConfirmLegal) return;
        isHyperRoboPublic = true;
        if (!hyperRoboPublishedAt) {
            hyperRoboPublishedAt = new Date().toISOString();
        }
        showHyperRoboPublishModal = false;
    }

    function executeHyperRoboUnpublish() {
        isHyperRoboPublic = false;
        showHyperRoboUnpublishModal = false;
    }

    async function publishActiveHyperRobo() {
        if (!activeHyperRobo) return;
        
        let newMarkdown = activeHyperRobo.markdownContent || '';
        if (newMarkdown.includes('is_public: false')) {
            newMarkdown = newMarkdown.replace('is_public: false', 'is_public: true');
        } else if (!newMarkdown.includes('is_public:')) {
            newMarkdown = newMarkdown.replace('---\n', '---\nis_public: true\n');
        }

        try {
            const response = await fetch('/api/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    markdown: newMarkdown, 
                    id: activeHyperRobo.id,
                    is_public: true,
                    published_at: new Date().toISOString()
                })
            });

            if (response.ok) {
                activeHyperRobo.isPublic = true;
                activeHyperRobo.markdownContent = newMarkdown;
                activeHyperRobo = { ...activeHyperRobo };
                await invalidateAll();
                alert('HyperRobo has been published successfully.');
            } else {
                const errData = await response.json();
                alert(`Failed to publish: ${errData.error}`);
            }
        } catch (err) {
            console.error('Publish HyperRobo error:', err);
            alert('An error occurred during publishing.');
        }
    }

    function handleToggleSelectionWrapper(book: any) {
        if (isHyperRoboSelectionMode) {
            handleToggleHyperRoboSelection(book);
        } else {
            handleToggleSelection(book);
        }
    }

    function handleToggleSelection(book: any) {
        const index = selectedStackBooks.findIndex(b => b.id === book.id);
        if (index > -1) {
            selectedStackBooks = selectedStackBooks.filter(b => b.id !== book.id);
        } else {
            selectedStackBooks = [...selectedStackBooks, { id: book.id, title: book.title, isCard: book.isCard, isStack: book.isStack, playMode: book.playMode }];
        }
    }

    function moveStackItem(index: number, direction: number) {
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= selectedStackBooks.length) return;
        
        const updated = [...selectedStackBooks];
        const [moved] = updated.splice(index, 1);
        updated.splice(targetIndex, 0, moved);
        selectedStackBooks = updated;
    }

    function removeStackItem(index: number) {
        selectedStackBooks = selectedStackBooks.filter((_, i) => i !== index);
    }

    // Parse stack markdown links
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

    async function saveStack() {
        if (selectedStackBooks.length === 0) return;
        
        const titleText = stackTitle.trim() || getNextStackDefaultTitle();
        const stackId = editingStackId || `stack-${Date.now()}`;
        
        const markdown = `---
title: ${titleText}
author: Stack
theme_color: white
play_mode: stack
id: ${stackId}
is_public: ${isStackPublic}
${stackPublishedAt ? `published_at: ${stackPublishedAt}` : ''}
description: "${(stackDescription || '').replace(/\n/g, ' ').replace(/"/g, '\\"')}"
---

${selectedStackBooks.map(b => `- [${b.title}](${b.isStack || b.playMode === 'stack' ? 'stack' : (b.isCard ? 'card' : 'book')}:${b.id})`).join('\n')}
`;

        try {
            const response = await fetch('/api/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    markdown, 
                    id: editingStackId ? stackId : undefined,
                    is_public: isStackPublic,
                    published_at: stackPublishedAt
                })
            });

            if (response.ok) {
                isStackSelectionMode = false;
                showStackModal = false;
                selectedStackBooks = [];
                editingStackId = '';
                stackDescription = '';
                await invalidateAll();
            } else {
                const errData = await response.json();
                alert(`Failed to save stack: ${errData.error}`);
            }
        } catch (err) {
            console.error('Save stack error:', err);
            alert('An error occurred during save.');
        }
    }

    async function handleDuplicateStack(book: any) {
        try {
            const originalMarkdown = book.markdownContent || '';
            let newTitle = `${book.title} (Copy)`;
            let newMarkdown = originalMarkdown;
            newMarkdown = newMarkdown.replace(/^title:\s*(.*)$/m, `title: ${newTitle}`);
            newMarkdown = newMarkdown.replace(/^id:\s*(.*)$/m, `id: stack-${Date.now()}`);

            const response = await fetch('/api/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ markdown: newMarkdown })
            });

            if (response.ok) {
                await invalidateAll();
            } else {
                const errData = await response.json();
                alert(`Failed to duplicate stack: ${errData.error}`);
            }
        } catch (err) {
            console.error('Duplicate stack error:', err);
            alert('An error occurred during duplication.');
        }
    }

    function openStackEditMode(book: any) {
        editingStackId = book.id;
        stackTitle = book.title;
        isStackPublic = book.is_public || false;
        stackPublishedAt = book.published_at || null;
        stackDescription = book.description || '';
        
        const subItems = parseStackMarkdown(book.markdownContent || '');
        selectedStackBooks = subItems.map(item => ({
            id: item.id,
            title: item.title,
            isCard: item.type === 'card',
            isStack: item.type === 'stack',
            playMode: item.type
        }));
        
        isStackSelectionMode = true;
        showStackModal = true;
    }

    let showStackUnpublishModal = $state(false);

    function handleStackPublishBtnClick() {
        if (isStackPublic) {
            showStackUnpublishModal = true;
        } else {
            stackConfirmLegal = false;
            showStackPublishModal = true;
        }
    }

    function executeStackPublish() {
        if (!stackConfirmLegal) return;
        isStackPublic = true;
        if (!stackPublishedAt) {
            stackPublishedAt = new Date().toISOString();
        }
        showStackPublishModal = false;
    }

    function executeStackUnpublish() {
        isStackPublic = false;
        showStackUnpublishModal = false;
    }

    function handleStackClick(book: any) {
        const subItems = parseStackMarkdown(book.markdownContent || '');
        const itemIds = subItems.map(item => item.id);
        window.open(`/hyperbookshelf?books=${itemIds.join(',')}&title=${encodeURIComponent(book.title)}`, '_blank');
    }

    // Derived books to display on the shelf
    let displayedBooks = $derived.by(() => {
        if (!activeStack) {
            return data.books;
        }

        const subItemRefs = parseStackMarkdown(activeStack.markdownContent || '');
        const matchedBooks: any[] = [];
        subItemRefs.forEach(ref => {
            const found = data.books.find((b: any) => b.id === ref.id || b.slug === ref.id);
            if (found) {
                matchedBooks.push(found);
            }
        });
        return matchedBooks;
    });

    let displayedBooksLocalized = $derived(displayedBooks.map(localizeBook));

    let selectedStackBookIds = $derived(selectedStackBooks.map(b => b.id));

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

    // Settings modal states
    let showSettingsModal = $state(false);
    let settingsActiveTab = $state('profile'); // 'profile', 'hypercardbook', 'plugin'
    
    // User profile states
    let profileNickname = $state('');
    let profileAvatarUrl = $state('');
    let profileAuthorBio = $state('');
    let profileLanguage = $state('en');
    
    // Config files states
    let profileHypercardbookMd = $state('');

    // Plugins management states
    interface Plugin {
        id: string;
        name: string;
        description: string;
        kinds: string;
        owner: string;
        skill: string;
    }

    const SYSTEM_PLUGINS: Plugin[] = [
        {
            id: 'reading-aloud',
            name: 'Reading aloud',
            kinds: 'HyperPlugin',
            owner: 'HyperCardBook',
            description: 'Enable native vocal read-aloud option for pages using browser SpeechSynthesis.',
            skill: 'When generating or modifying books/cards, ensure that any written content is suitable for text-to-speech reading. Also, enable the vocal read-aloud option for pages.'
        },
        {
            id: 'bookmark-postit',
            name: 'Bookmark (Post-it style)',
            kinds: 'Skill',
            owner: 'HyperCardBook',
            description: 'Add a sticky bookmark to save and restore your reading position.',
            skill: 'Generate bookmark_html (sticky design) and on_open_stack / on_close_card hooks in YAML frontmatter to auto-save and restore the reading position.'
        },
        {
            id: 'ai-summarizer-hook',
            name: 'AI Summarizer Hook',
            kinds: 'HyperHook',
            owner: 'HyperCardBook',
            description: 'Show an AI summary in chat when a page is opened (on_open_card).',
            skill: 'Generate on_open_card: "[AI] Summarize this page in 3 lines" hook in YAML frontmatter.'
        },
        {
            id: 'gdrive-mcp',
            name: 'Google Drive MCP',
            kinds: 'MCP',
            owner: 'HyperCardBook',
            description: 'Connect to Google Drive MCP server using JSON-RPC 2.0 to search and read files.',
            skill: 'Use gdrive_search_files and gdrive_read_file tools to fetch content from Google Drive.'
        }
    ];

    let userPlugins = $state<Plugin[]>([]);
    let activePluginIds = $state<string[]>(['bookmark-postit', 'ai-summarizer-hook']);
    let selectedPluginId = $state<string>('');
    let selectedPluginName = $state<string>('');
    let selectedPluginDescription = $state<string>('');
    let selectedPluginSkill = $state<string>('');
    let pluginSubView = $state<'list' | 'add'>('list');
    let selectedAddPluginId = $state<string>('');

    let allPlugins = $derived.by(() => {
        const activeSystem = SYSTEM_PLUGINS.filter(sp => activePluginIds.includes(sp.id));
        return [...userPlugins, ...activeSystem];
    });

    let selectedPlugin = $derived(allPlugins.find(p => p.id === selectedPluginId));

    function selectPlugin(p: Plugin) {
        selectedPluginId = p.id;
        selectedPluginName = p.name;
        selectedPluginDescription = p.description || '';
        selectedPluginSkill = p.skill || '';
        aiInstructionInput = '';
    }

    function updateSelectedSkillFields(name: string, description: string, skillText: string) {
        if (!selectedPluginId) return;

        // If editing a system plugin, clone it to custom user plugin
        const current = allPlugins.find(p => p.id === selectedPluginId);
        if (current && current.owner === 'HyperCardBook') {
            const newId = `my-plugin-${current.id}-${Date.now()}`;
            const cloned: Plugin = {
                id: newId,
                name: name,
                description: description,
                kinds: current.kinds,
                owner: 'My plugin',
                skill: skillText
            };
            userPlugins.push(cloned);
            
            // Deactivate system plugin, activate custom plugin
            activePluginIds = activePluginIds.filter(id => id !== current.id);
            if (!activePluginIds.includes(newId)) {
                activePluginIds.push(newId);
            }
            
            selectedPluginId = newId;
            selectedPluginName = name;
            selectedPluginDescription = description;
            selectedPluginSkill = skillText;
            return;
        }

        // Otherwise, update existing user plugin in place
        const idx = userPlugins.findIndex(up => up.id === selectedPluginId);
        if (idx !== -1) {
            userPlugins[idx].name = name;
            userPlugins[idx].description = description;
            userPlugins[idx].skill = skillText;
            
            selectedPluginName = name;
            selectedPluginDescription = description;
            selectedPluginSkill = skillText;
        }
    }

    function handleNameInput() {
        updateSelectedSkillFields(selectedPluginName, selectedPluginDescription, selectedPluginSkill);
    }

    function handleDescriptionInput() {
        updateSelectedSkillFields(selectedPluginName, selectedPluginDescription, selectedPluginSkill);
    }

    function handleSkillInput() {
        updateSelectedSkillFields(selectedPluginName, selectedPluginDescription, selectedPluginSkill);
    }

    function openAddPluginView() {
        pluginSubView = 'add';
        selectedAddPluginId = '';
    }

    function installSelectedSystemPlugin() {
        if (!selectedAddPluginId) return;
        if (!activePluginIds.includes(selectedAddPluginId)) {
            activePluginIds.push(selectedAddPluginId);
        }
        pluginSubView = 'list';
        selectedPluginId = selectedAddPluginId;
        const found = SYSTEM_PLUGINS.find(p => p.id === selectedAddPluginId);
        if (found) {
            selectPlugin(found);
        }
    }

    async function deleteSelectedPlugin() {
        if (!selectedPluginId) return;
        const skillToDelete = userPlugins.find(up => up.id === selectedPluginId);
        activePluginIds = activePluginIds.filter(id => id !== selectedPluginId);
        userPlugins = userPlugins.filter(up => up.id !== selectedPluginId);
        const deletedId = selectedPluginId;
        selectedPluginId = '';
        selectedPluginName = '';
        selectedPluginDescription = '';
        selectedPluginSkill = '';

        if (skillToDelete && deletedId.startsWith('my-plugin-')) {
            try {
                await fetch('/api/skills', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ skillName: skillToDelete.name })
                });
            } catch (err) {
                console.error('Failed to call delete skill API:', err);
            }
        }

        try {
            const { error: updateError } = await supabase.auth.updateUser({
                data: {
                    user_plugins: $state.snapshot(userPlugins),
                    active_plugin_ids: $state.snapshot(activePluginIds)
                }
            });
            if (updateError) throw updateError;
            await invalidateAll();
        } catch (err) {
            console.error('Failed to sync updated plugins list to Supabase:', err);
        }
    }



    // AI Refiner State & Actions
    let aiInstructionInput = $state('');
    let isGeneratingSkill = $state(false);

    async function runAIGenerator() {
        if (!aiInstructionInput.trim()) {
            alert('Please enter instructions for the AI.');
            return;
        }
        isGeneratingSkill = true;
        try {
            const res = await fetch('/api/generate-skill', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: selectedPluginName,
                    description: selectedPluginDescription,
                    skill: selectedPluginSkill,
                    instruction: aiInstructionInput
                })
            });
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'Failed to generate skill.');
            }
            const data = await res.json();
            updateSelectedSkillFields(data.name || '', data.description || '', data.skill || '');
            aiInstructionInput = '';
        } catch (err: any) {
            console.error(err);
            alert(err.message || 'AI generation failed.');
        } finally {
            isGeneratingSkill = false;
        }
    }
    
    // Upload state in profile
    let isUploadingAvatar = $state(false);
    let avatarFileInputEl = $state<HTMLInputElement | null>(null);

    // Account deletion workflow states
    let deleteStep = $state('none'); // 'none', 'warn', 'credentials', 'loading'
    let deleteConfirmEmail = $state('');
    let deleteConfirmPassword = $state('');
    let deleteErrorMsg = $state('');

    // Password change states
    let showPasswordModal = $state(false);
    let passwordChangeStep = $state('none'); // 'none', 'edit', 'loading'
    let newPassword = $state('');
    let confirmNewPassword = $state('');
    let passwordChangeError = $state('');
    let passwordChangeSuccess = $state('');

    // Default configuration constants
    const DEFAULT_HYPERCARDBOOK_MD = `# HyperCardBook設定
## 全般
- language: ja (日本語)
- default_theme: dark`;

    async function openSettingsModal() {
        if (!data.session?.user) return;
        const metadata = data.session.user.user_metadata || {};
        
        profileNickname = metadata.nickname || '';
        profileAvatarUrl = metadata.avatar_url || '';
        profileAuthorBio = metadata.author_bio || '';
        profileLanguage = metadata.language || currentLanguage || 'en';
        
        profileHypercardbookMd = metadata.hypercardbook_md || DEFAULT_HYPERCARDBOOK_MD;
        
        activePluginIds = metadata.active_plugin_ids || ['bookmark-postit', 'ai-summarizer-hook'];
        selectedPluginId = '';
        selectedPluginName = '';
        selectedPluginDescription = '';
        selectedPluginSkill = '';
        pluginSubView = 'list';
        
        settingsActiveTab = 'profile';
        deleteStep = 'none';
        deleteConfirmEmail = '';
        deleteConfirmPassword = '';
        deleteErrorMsg = '';
        cancelPasswordChange();

        // Load physical custom skills from server storage
        try {
            const res = await fetch('/api/skills');
            if (res.ok) {
                const listData = await res.json();
                userPlugins = listData.skills || [];
            } else {
                userPlugins = metadata.user_plugins || [];
            }
        } catch (err) {
            console.error('Failed to load user skills from server:', err);
            userPlugins = metadata.user_plugins || [];
        }
        
        showSettingsModal = true;
    }

    function cancelPasswordChange() {
        showPasswordModal = false;
        passwordChangeStep = 'none';
        newPassword = '';
        confirmNewPassword = '';
        passwordChangeError = '';
        passwordChangeSuccess = '';
    }

    async function executePasswordChange() {
        if (!newPassword || !confirmNewPassword) return;
        if (newPassword !== confirmNewPassword) {
            passwordChangeError = 'Passwords do not match.';
            return;
        }
        if (newPassword.length < 6) {
            passwordChangeError = 'Password must be at least 6 characters.';
            return;
        }

        passwordChangeStep = 'loading';
        passwordChangeError = '';
        passwordChangeSuccess = '';

        try {
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) throw error;
            passwordChangeSuccess = 'Password updated.';
            newPassword = '';
            confirmNewPassword = '';
            setTimeout(() => {
                cancelPasswordChange();
            }, 2000);
        } catch (err: any) {
            console.error('Password change failed:', err);
            passwordChangeError = err.message || 'Failed to change password.';
            passwordChangeStep = 'edit';
        }
    }

    let isSavingSettings = $state(false);
    async function saveSettings() {
        if (isSavingSettings) return;
        isSavingSettings = true;
        
        try {
            // Update all custom skills' physical files on server
            for (const up of userPlugins) {
                if (up.owner === 'My plugin' || up.id.startsWith('my-plugin-')) {
                    const safeSkillName = up.id.replace('my-plugin-', '').replace(/[^a-zA-Z0-9_\-]/g, '');
                    if (safeSkillName) {
                        const skillMd = `---\nname: ${up.name}\ndescription: ${up.description}\n---\n${up.skill}`;
                        await fetch('/api/skills', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                skillName: safeSkillName,
                                skillMd: skillMd
                            })
                        });
                    }
                }
            }

            const { error: updateError } = await supabase.auth.updateUser({
                data: {
                    nickname: profileNickname,
                    avatar_url: profileAvatarUrl,
                    author_bio: profileAuthorBio,
                    language: profileLanguage,
                    hypercardbook_md: profileHypercardbookMd,
                    user_plugins: $state.snapshot(userPlugins),
                    active_plugin_ids: $state.snapshot(activePluginIds)
                }
            });
            
            if (updateError) throw updateError;
            
            currentLanguage = profileLanguage;
            localStorage.setItem('reader-lang', profileLanguage);
            await translateBookshelfCovers();
            
            showSettingsModal = false;
            await invalidateAll();
            alert('Settings saved.');
        } catch (err: any) {
            console.error('Failed to save settings:', err);
            alert(`Failed to save settings: ${err.message || err}`);
        } finally {
            isSavingSettings = false;
        }
    }

    async function handleAvatarUpload(e: Event) {
        const input = e.target as HTMLInputElement;
        if (!input.files || input.files.length === 0) return;
        const file = input.files[0];
        isUploadingAvatar = true;
        
        try {
            const compressedBlob = await compressImage(file);
            const fileExt = 'webp';
            const fileName = `avatar_${data.currentUserId || 'guest'}_${Date.now()}.${fileExt}`;
            const filePath = `${data.currentUserId || 'guest'}/${fileName}`;
            
            const { error: uploadError } = await supabase.storage
                .from('HyperCardBookBucket')
                .upload(filePath, compressedBlob, {
                    contentType: 'image/webp',
                    upsert: true
                });
                
            if (uploadError) throw uploadError;
            
            const { data: urlData } = supabase.storage
                .from('HyperCardBookBucket')
                .getPublicUrl(filePath);
                
            profileAvatarUrl = urlData.publicUrl;
        } catch (err: any) {
            console.error('Avatar upload failed:', err);
            alert(`Failed to upload avatar: ${err.message || err}`);
        } finally {
            isUploadingAvatar = false;
            input.value = '';
        }
    }

    function startAccountDelete() {
        deleteStep = 'warn';
    }
    
    function acceptDeleteWarning() {
        deleteStep = 'credentials';
    }
    
    async function executeAccountDelete() {
        if (!deleteConfirmEmail.trim() || !deleteConfirmPassword.trim()) return;
        
        if (!confirm('Are you sure you want to permanently delete your account? This action is not reversible.')) {
            return;
        }
        
        deleteStep = 'loading';
        deleteErrorMsg = '';
        
        try {
            const response = await fetch('/api/user/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: deleteConfirmEmail,
                    password: deleteConfirmPassword
                })
            });
            
            const resData = await response.json();
            
            if (response.ok) {
                alert('Account deleted. Thank you.');
                showSettingsModal = false;
                window.location.href = '/';
            } else {
                throw new Error(resData.error || 'Failed to delete account.');
            }
        } catch (err: any) {
            console.error('Delete account failed:', err);
            deleteErrorMsg = err.message || 'An error occurred during account deletion.';
            deleteStep = 'credentials';
        }
    }

    function compressImage(file: File): Promise<Blob> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = URL.createObjectURL(file);
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Canvas context not available'));
                    return;
                }
                const maxDim = 1200;
                let width = img.width;
                let height = img.height;
                if (width > maxDim || height > maxDim) {
                    if (width > height) {
                        height = Math.round((height * maxDim) / width);
                        width = maxDim;
                    } else {
                        width = Math.round((width * maxDim) / height);
                        height = maxDim;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Canvas toBlob failed'));
                    }
                }, 'image/webp', 0.82);
            };
            img.onerror = () => reject(new Error('Failed to load image for compression'));
        });
    }

    let isFreeCallOpen = $state(false);
    let isPromptCallOpen = $state(false);

    async function getFreeCallUrl() {
        let base = 'https://paperobo.hypercardbook.org'; // Production URL
        if (typeof window !== 'undefined') {
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                base = 'http://localhost:5180'; // Local development URL
            }
        }
        let url = `${base}/?public=hVSMUWrz69&iframe=1`;
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            url += `#access_token=${encodeURIComponent(session.access_token)}&refresh_token=${encodeURIComponent(session.refresh_token)}`;
        }
        return url;
    }

    let isSplitViewOpen = $state(false);
    let activeHyperRobo = $state<any>(null);

    let activeHyperBook = $derived.by(() => {
        if (!activeHyperRobo) return null;
        const hyperbookId = activeHyperRobo.hyperbookId || '';
        let book = data.books.find((b: any) => b.id === hyperbookId || b.slug === hyperbookId);
        if (!book && data.publicBooks) {
            book = data.publicBooks.find((b: any) => b.id === hyperbookId || b.slug === hyperbookId);
        }
        return book;
    });

    function toggleSplitView() {
        isSplitViewOpen = !isSplitViewOpen;
        if (!isSplitViewOpen) {
            activeHyperRobo = null;
        }
    }

    function openHyperRoboView(book: any) {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('launch_robo') === book.id) {
            // すでに別タブのパラメータ経由で開いている場合は、自画面で通常起動
            activeHyperRobo = book;
            isSplitViewOpen = true;
        } else {
            // 通常の本棚からクリックされた場合は、別タブでパラメータ付きURLを開く
            const baseUrl = window.location.origin;
            window.open(`${baseUrl}/?launch_robo=${book.id}`, '_blank');
        }
    }

    async function getLeftPaneUrl() {
        if (activeHyperRobo) {
            const paperoboSlug = activeHyperRobo.paperoboSlug || '';
            let paperoboBook = data.books.find((b: any) => b.slug === paperoboSlug || b.id === paperoboSlug);
            if (!paperoboBook && data.publicBooks) {
                paperoboBook = data.publicBooks.find((b: any) => b.slug === paperoboSlug || b.id === paperoboSlug);
            }
            let launchUrl = paperoboBook ? paperoboBook.launchUrl : '';
            if (!launchUrl) {
                return await getFreeCallUrl();
            }
            if (launchUrl.includes('?')) {
                launchUrl += '&iframe=1';
            } else {
                launchUrl += '?iframe=1';
            }
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                launchUrl += `#access_token=${encodeURIComponent(session.access_token)}&refresh_token=${encodeURIComponent(session.refresh_token)}`;
            }
            return launchUrl;
        }
        return await getFreeCallUrl();
    }

    async function getRightPaneUrl() {
        const { data: { session } } = await supabase.auth.getSession();
        let path = '/hypercard/hypercard-history-perfect?embed=true';

        if (activeHyperRobo) {
            const hyperbookId = activeHyperRobo.hyperbookId || '';
            const targetBook = data.books.find((b: any) => b.id === hyperbookId || b.slug === hyperbookId);
            const isCard = targetBook ? targetBook.isCard : false;
            path = isCard ? `/hypercard/${hyperbookId}?embed=true` : `/hyperbook/${hyperbookId}?embed=true`;
        }

        if (session) {
            return `${path}#access_token=${encodeURIComponent(session.access_token)}&refresh_token=${encodeURIComponent(session.refresh_token)}`;
        }
        return path;
    }
</script>

<div class="landing-container" data-theme={uiTheme}>
    <!-- Brand Logo and slogan at top left -->
    <div class="header-logo-container">
        <img src="/markdownai_logo.png" alt="MarkdownAI Logo" class="header-logo-img" />
        <div class="header-logo-text-group">
            <span class="header-company-name">MarkdownAI</span>
            <span class="header-sub-slogan">Markdown is all you need!</span>
        </div>
    </div>

    <!-- Theme switch and login/logout buttons at top right -->
    <div class="theme-switch-container">
        {#if data.session?.user}
            <div 
                class="user-profile clickable-profile" 
                onclick={openSettingsModal}
                onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { openSettingsModal(); } }}
                role="button"
                tabindex="0"
                title="環境設定を開く"
            >
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
        
        <!-- Language selector flag dropdown -->
        <div class="lang-selector-container">
            <button class="theme-switch lang-btn" onclick={() => showLangDropdown = !showLangDropdown} title="Select Language">
                {LANGUAGES.find(l => l.code === currentLanguage)?.flag || '🇺🇸'}
            </button>
            {#if showLangDropdown}
                <div class="lang-dropdown">
                    {#each QUICK_LANGUAGES as lang}
                        <button class="lang-option" class:active={currentLanguage === lang.code} onclick={() => selectLanguage(lang.code)}>
                            <span class="flag-icon">{lang.flag}</span>
                            <span class="lang-label">{lang.label}</span>
                        </button>
                    {/each}
                    <div style="border-top: 1px solid rgba(255, 255, 255, 0.1); margin: 4px 0;"></div>
                    <button class="lang-option" onclick={() => { showFullLangModal = true; showLangDropdown = false; langSearchQuery = ''; }}>
                        <span class="flag-icon">🌐</span>
                        <span class="lang-label">More...</span>
                    </button>
                </div>
            {/if}
        </div>
    </div>

    <!-- Prompt input box repositioned slightly higher -->
    <div class="landing-panel">
        <h1 class="title">
            <img src="/favicon.png" alt="HyperCardBook Logo" class="title-logo" />
            HyperCardBook
        </h1>
        <p class="subtitle">Write once. Publish AI interactive books in 80 languages.</p>

        <form bind:this={formEl} onsubmit={handleSubmit} class="prompt-form">
            <div class="prompt-textarea-wrapper">
                <textarea
                    bind:this={textareaEl}
                    bind:value={prompt}
                    placeholder="Please enter the prompt to create the book."
                    required
                    rows="4"
                    disabled={!data.currentUserId || isSubmitting}
                    onkeydown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            if (prompt.trim() || attachedFiles.length > 0) {
                                formEl?.requestSubmit();
                            }
                        }
                    }}
                ></textarea>
                
                <!-- Hidden file input for attachments -->
                <input
                    type="file"
                    accept="image/*,text/plain,text/markdown,.md,.txt"
                    multiple
                    bind:this={fileInputEl}
                    onchange={handleAttachedFilesChange}
                    class="hidden-file-input"
                />

                <!-- Attached files preview container inside the wrapper -->
                {#if attachedFiles.length > 0}
                    <div class="attached-files-preview-bar">
                        {#each attachedFiles as file}
                            <div class="attached-file-badge" class:error={file.status === 'error'}>
                                {#if file.status === 'uploading' || file.status === 'loading'}
                                    <div class="badge-spinner"></div>
                                {:else if file.type === 'image' && file.url}
                                    <img src={file.url} alt={file.name} class="badge-thumb" />
                                {:else}
                                    <span class="badge-icon">📄</span>
                                {/if}
                                <span class="badge-name" title={file.name}>{file.name}</span>
                                <button
                                    type="button"
                                    class="badge-remove-btn"
                                    onclick={() => removeAttachedFile(file.id)}
                                    title="Remove attachment"
                                >
                                    ✕
                                </button>
                            </div>
                        {/each}
                    </div>
                {/if}

                <div class="prompt-bottom-row">
                    <div class="prompt-bottom-left">
                        <button
                            type="button"
                            class="attach-trigger-btn"
                            onclick={() => fileInputEl?.click()}
                            disabled={!data.currentUserId || isSubmitting}
                            title="Attach files (Image/Text)"
                        >
                            ➕
                        </button>
                        <div class="toggle-and-split-wrapper">
                            <div class="mode-toggle-container">
                                <label class="mode-toggle-label">
                                    <input type="radio" name="mode" value="card" bind:group={selectedMode} disabled={!data.currentUserId || isSubmitting} />
                                    <span>Card</span>
                                </label>
                                <label class="mode-toggle-label">
                                    <input type="radio" name="mode" value="book" bind:group={selectedMode} disabled={!data.currentUserId || isSubmitting} />
                                    <span>Book</span>
                                </label>
                            </div>
                            <!-- 📱 ボタンを追加 -->
                            <button
                                type="button"
                                class="split-view-trigger-btn"
                                onclick={() => isPromptCallOpen = true}
                                title="Open Split View with PapeRobo"
                            >
                                📱
                            </button>
                        </div>
                    </div>

                    <button type="submit" class="submit-btn" disabled={!data.currentUserId || isSubmitting || (!prompt.trim() && attachedFiles.length === 0)}>
                        {#if isSubmitting}
                            <div class="spinner"></div>
                        {:else}
                            Run ⌘↩︎
                        {/if}
                    </button>
                </div>
            </div>
        </form>
    </div>



    <!-- 3D wooden bookshelf displayed directly on the landing page -->
    <div class="bookshelf-section">
        {#if activeStack}
            {#if !displayedBooks || displayedBooks.length === 0}
                <div class="empty-shelf">
                    <p>There are no books or cards in this stack.</p>
                </div>
            {:else}
                <Bookshelf
                    books={displayedBooksLocalized}
                    currentUserId={data.currentUserId}
                    showActions={true}
                    bind:selectedBookId={selectedBookId}
                    onPromptSelect={handlePromptSelect}
                    onEditBook={handleEditBook}
                    onDeleteBook={handleDeleteBook}
                    onDownloadBook={handleDownloadBook}
                    fromPage="home"
                    showStackBtn={true}
                    showPapeRoboBtn={true}
                    showHyperRoboBtn={true}
                    isStackSelection={isStackSelectionMode}
                    selectedStackBookIds={selectedStackBookIds}
                    isHyperRoboSelection={isHyperRoboSelectionMode}
                    selectedHyperRoboBookIds={selectedHyperRoboBookIds}
                    onToggleSelection={handleToggleSelectionWrapper}
                    onStackClick={handleStackClick}
                    onDuplicateStack={handleDuplicateStack}
                    onToggleStackSelectionMode={toggleStackSelectionMode}
                    onToggleHyperRoboSelectionMode={toggleHyperRoboSelectionMode}
                    onHyperRoboClick={openHyperRoboView}
                />
            {/if}
        {:else}
            <!-- Render My Books if user has any books -->
            {#if myBooksList && myBooksList.length > 0}
                <Bookshelf
                    books={myBooksListLocalized}
                    currentUserId={data.currentUserId}
                    showActions={true}
                    bind:selectedBookId={selectedBookId}
                    onPromptSelect={handlePromptSelect}
                    onEditBook={handleEditBook}
                    onDeleteBook={handleDeleteBook}
                    onDownloadBook={handleDownloadBook}
                    fromPage="home"
                    showStackBtn={true}
                    showPapeRoboBtn={true}
                    showHyperRoboBtn={true}
                    isStackSelection={isStackSelectionMode}
                    selectedStackBookIds={selectedStackBookIds}
                    isHyperRoboSelection={isHyperRoboSelectionMode}
                    selectedHyperRoboBookIds={selectedHyperRoboBookIds}
                    onToggleSelection={handleToggleSelectionWrapper}
                    onStackClick={handleStackClick}
                    onDuplicateStack={handleDuplicateStack}
                    onToggleStackSelectionMode={toggleStackSelectionMode}
                    onToggleHyperRoboSelectionMode={toggleHyperRoboSelectionMode}
                    onHyperRoboClick={openHyperRoboView}
                />
            {/if}

            <!-- Always render Sample Books (preceded by Sample Books golden plate) -->
            {#if sampleBooksList && sampleBooksList.length > 0}
                <div class="public-books-separator">
                    <div class="golden-plate no-pointer">Sample Books</div>
                </div>
                <Bookshelf
                    books={sampleBooksListLocalized}
                    currentUserId={data.currentUserId}
                    showActions={true}
                    bind:selectedBookId={selectedBookId}
                    onPromptSelect={handlePromptSelect}
                    onEditBook={handleEditBook}
                    onDeleteBook={handleDeleteBook}
                    onDownloadBook={handleDownloadBook}
                    fromPage="home"
                    showStackBtn={myBooksList.length === 0}
                    isStackSelection={isStackSelectionMode}
                    selectedStackBookIds={selectedStackBookIds}
                    isHyperRoboSelection={isHyperRoboSelectionMode}
                    selectedHyperRoboBookIds={selectedHyperRoboBookIds}
                    onToggleSelection={handleToggleSelectionWrapper}
                    onStackClick={handleStackClick}
                    onDuplicateStack={handleDuplicateStack}
                    onToggleStackSelectionMode={toggleStackSelectionMode}
                    onToggleHyperRoboSelectionMode={toggleHyperRoboSelectionMode}
                    onHyperRoboClick={openHyperRoboView}
                    showMoreBtn={data.publicBooks && data.publicBooks.length > 0 && !showPublicSection}
                    onMoreClick={handleLoadPublicBooks}
                />
            {/if}

            <!-- Render Public Books if showPublicSection is true -->
            {#if showPublicSection && publicBooksList && publicBooksList.length > 0}
                <div class="public-books-separator">
                    <div 
                        class="golden-plate clickable-plate" 
                        onclick={() => showPublicSection = false}
                        onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (showPublicSection = false)}
                        role="button"
                        tabindex="0"
                        title="Hide Public Books"
                    >
                        Public Books
                    </div>
                </div>
                <Bookshelf
                    books={publicBooksListLocalized}
                    currentUserId={data.currentUserId}
                    showActions={true}
                    isPublicShelf={true}
                    bind:selectedBookId={selectedBookId}
                    onPromptSelect={handlePromptSelect}
                    onEditBook={handleEditBook}
                    onDeleteBook={handleDeleteBook}
                    onDownloadBook={handleDownloadBook}
                    fromPage="home"
                    showStackBtn={false}
                    isStackSelection={isStackSelectionMode}
                    selectedStackBookIds={selectedStackBookIds}
                    isHyperRoboSelection={isHyperRoboSelectionMode}
                    selectedHyperRoboBookIds={selectedHyperRoboBookIds}
                    onToggleSelection={handleToggleSelectionWrapper}
                    onStackClick={handleStackClick}
                    onDuplicateStack={handleDuplicateStack}
                    onToggleStackSelectionMode={toggleStackSelectionMode}
                    onToggleHyperRoboSelectionMode={toggleHyperRoboSelectionMode}
                    onHyperRoboClick={openHyperRoboView}
                    showMoreBtn={hasMorePublic}
                    onMoreClick={loadMorePublicBooks}
                />
            {/if}
        {/if}
    </div>

    <!-- Stack Editor Popup Panel -->
    {#if showStackModal}
        <div class="stack-popup-panel">
            <div class="stack-popup-header">
                <h3>HyperStack</h3>
                <div class="stack-header-actions" style="display: flex; gap: 8px; align-items: center;">
                    <button 
                        class="stack-publish-btn" 
                        class:is-public={isStackPublic}
                        onclick={handleStackPublishBtnClick} 
                        title={isStackPublic ? 'Unpublish' : 'Publish'}
                        style="background: none; border: none; color: #a0aec0; font-size: 1.1rem; cursor: pointer; padding: 4px;"
                    >
                        {isStackPublic ? '👤' : '👥'}
                    </button>
                    <button class="close-popup-btn" onclick={cancelStackSelection}>✕</button>
                </div>
            </div>
            <div class="stack-popup-body">
                <p class="select-hint">Select HyperBook or HyperCard.</p>
                
                <div class="form-group-stack">
                    <label for="stack-title">Stack Name</label>
                    <input 
                        id="stack-title"
                        type="text" 
                        bind:value={stackTitle} 
                        placeholder="HyperStack001" 
                        class="stack-title-input-field"
                    />
                </div>

                <div class="form-group-stack">
                    <label for="stack-description">Description</label>
                    <textarea 
                        id="stack-description"
                        bind:value={stackDescription} 
                        placeholder="Enter stack description..." 
                        class="stack-title-input-field"
                        rows="2"
                        style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.2); color: #fff; font-family: inherit; resize: vertical; box-sizing: border-box;"
                    ></textarea>
                </div>

                <div class="stack-listbox-container">
                    <label class="listbox-label">HyperCard or HyperBook</label>
                    <div class="stack-listbox">
                        {#if selectedStackBooks.length === 0}
                            <div class="empty-listbox">No items selected</div>
                        {:else}
                            <div class="listbox-items">
                                {#each selectedStackBooks as item, idx}
                                    <div class="listbox-item">
                                        <span class="item-title" title={item.title}>{item.title}</span>
                                        <span class="item-badge">{item.isCard ? 'Card' : 'Book'}</span>
                                        <div class="item-controls">
                                            <button 
                                                type="button"
                                                class="control-arrow-btn"
                                                onclick={() => moveStackItem(idx, -1)}
                                                disabled={idx === 0}
                                                title="上に移動"
                                            >
                                                ▲
                                            </button>
                                            <button 
                                                type="button"
                                                class="control-arrow-btn"
                                                onclick={() => moveStackItem(idx, 1)}
                                                disabled={idx === selectedStackBooks.length - 1}
                                                title="下に移動"
                                            >
                                                ▼
                                            </button>
                                            <button 
                                                type="button"
                                                class="control-remove-btn"
                                                onclick={() => removeStackItem(idx)}
                                                title="削除"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
            <div class="stack-popup-footer">
                <button class="btn-popup btn-popup-secondary" onclick={cancelStackSelection}>Cancel</button>
                <button class="btn-popup btn-popup-primary" onclick={saveStack} disabled={selectedStackBooks.length === 0}>
                    Save
                </button>
            </div>
        </div>
    {/if}

    <!-- HyperRobo Save Popup Panel -->
    {#if showHyperRoboModal}
        <div class="stack-popup-panel">
            <div class="stack-popup-header">
                <h3>🤖 HyperRobo</h3>
                <div class="stack-header-actions" style="display: flex; gap: 8px; align-items: center;">
                    <button 
                        class="stack-publish-btn" 
                        class:is-public={isHyperRoboPublic}
                        onclick={handleHyperRoboPublishBtnClick} 
                        title={isHyperRoboPublic ? 'Unpublish' : 'Publish'}
                        style="background: none; border: none; color: #a0aec0; font-size: 1.1rem; cursor: pointer; padding: 4px;"
                    >
                        {isHyperRoboPublic ? '👤' : '👥'}
                    </button>
                    <button class="close-popup-btn" onclick={cancelHyperRoboSelection} disabled={isSavingHyperRobo}>✕</button>
                </div>
            </div>
            <div class="stack-popup-body">
                <p class="select-hint">Select one PapeRobo character and one HyperBook/Card from the shelf.</p>
                
                <div class="form-group-stack">
                    <label for="hyperrobo-title">HyperRobo Name</label>
                    <input 
                        id="hyperrobo-title"
                        type="text" 
                        bind:value={hyperRoboTitle} 
                        placeholder="HyperRobo001" 
                        class="stack-title-input-field"
                        disabled={isSavingHyperRobo}
                    />
                </div>

                <div class="form-group-stack">
                    <label for="hyperrobo-description">Description</label>
                    <textarea 
                        id="hyperrobo-description"
                        bind:value={hyperRoboDescription} 
                        placeholder="Enter description..." 
                        class="stack-title-input-field"
                        disabled={isSavingHyperRobo}
                        rows="2"
                        style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.2); color: #fff; font-family: inherit; resize: vertical; box-sizing: border-box;"
                    ></textarea>
                </div>

                <div class="form-group-stack" style="display: flex; align-items: center; gap: 8px; margin: 10px 0;">
                    <input 
                        id="hyperrobo-hide-book"
                        type="checkbox" 
                        bind:checked={hideHyperbook} 
                        disabled={isSavingHyperRobo}
                        style="width: auto; cursor: pointer; margin: 0;"
                    />
                    <label for="hyperrobo-hide-book" style="margin: 0; cursor: pointer; user-select: none; color: #a0aec0; font-size: 0.85rem;">Hide HyperBook or Card</label>
                </div>

                <div class="stack-listbox-container">
                    <label class="listbox-label">Selected Items</label>
                    <div class="stack-listbox">
                        {#if selectedHyperRoboBooks.length === 0}
                            <div class="empty-listbox">No items selected</div>
                        {:else}
                            <div class="listbox-items">
                                {#each selectedHyperRoboBooks as item}
                                    <div class="listbox-item">
                                        <span class="item-title" title={item.title}>{item.title}</span>
                                        <span class="item-badge">{item.playMode === 'paperobo' ? 'PapeRobo' : 'Book'}</span>
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
            <div class="stack-popup-footer">
                <button class="btn-popup btn-popup-secondary" onclick={cancelHyperRoboSelection} disabled={isSavingHyperRobo}>Cancel</button>
                <button class="btn-popup btn-popup-primary" onclick={saveHyperRobo} disabled={selectedHyperRoboBooks.length !== 2 || isSavingHyperRobo}>
                    {isSavingHyperRobo ? 'Saving...' : 'Save'}
                </button>
            </div>
        </div>
    {/if}

    <!-- Stack Publish confirmation modal -->
    {#if showStackPublishModal}
        <div class="modal-overlay" onclick={() => showStackPublishModal = false} role="presentation">
            <div class="publish-modal-card" onclick={(e) => e.stopPropagation()} role="presentation">
                <div class="publish-modal-body">
                    <p>Published content is visible to everyone.</p>
                    <p>It may be searchable on Google.</p>
                    <p>Other users can reuse and build upon your work.</p>
                    
                    <label class="publish-confirm-label">
                        <input type="checkbox" bind:checked={stackConfirmLegal} />
                        <span>I confirm that my data is legal and follows the rules.</span>
                    </label>
                </div>
                <div class="publish-modal-footer">
                    <button class="btn-cancel" onclick={() => showStackPublishModal = false}>Cancel</button>
                    <button class="btn-publish" onclick={executeStackPublish} disabled={!stackConfirmLegal}>
                        Publish
                    </button>
                </div>
            </div>
        </div>
    {/if}

    <!-- Stack Unpublish confirmation modal -->
    {#if showStackUnpublishModal}
        <div class="modal-overlay" onclick={() => showStackUnpublishModal = false} role="presentation">
            <div class="publish-modal-card" onclick={(e) => e.stopPropagation()} role="presentation">
                <div class="publish-modal-body">
                    <p>Make this private?</p>
                </div>
                <div class="publish-modal-footer">
                    <button class="btn-cancel" onclick={() => showStackUnpublishModal = false}>Cancel</button>
                    <button class="btn-publish" onclick={executeStackUnpublish}>
                        Make Private
                    </button>
                </div>
            </div>
        </div>
    {/if}

    <!-- HyperRobo Publish confirmation modal -->
    {#if showHyperRoboPublishModal}
        <div class="modal-overlay" onclick={() => showHyperRoboPublishModal = false} role="presentation">
            <div class="publish-modal-card" onclick={(e) => e.stopPropagation()} role="presentation">
                <div class="publish-modal-body">
                    <p>Published content is visible to everyone.</p>
                    <p>It may be searchable on Google.</p>
                    <p>Other users can reuse and build upon your work.</p>
                    
                    <label class="publish-confirm-label">
                        <input type="checkbox" bind:checked={hyperRoboConfirmLegal} />
                        <span>I confirm that my data is legal and follows the rules.</span>
                    </label>
                </div>
                <div class="publish-modal-footer">
                    <button class="btn-cancel" onclick={() => showHyperRoboPublishModal = false}>Cancel</button>
                    <button class="btn-publish" onclick={executeHyperRoboPublish} disabled={!hyperRoboConfirmLegal}>
                        Publish
                    </button>
                </div>
            </div>
        </div>
    {/if}

    <!-- HyperRobo Unpublish confirmation modal -->
    {#if showHyperRoboUnpublishModal}
        <div class="modal-overlay" onclick={() => showHyperRoboUnpublishModal = false} role="presentation">
            <div class="publish-modal-card" onclick={(e) => e.stopPropagation()} role="presentation">
                <div class="publish-modal-body">
                    <p>Make this private?</p>
                </div>
                <div class="publish-modal-footer">
                    <button class="btn-cancel" onclick={() => showHyperRoboUnpublishModal = false}>Cancel</button>
                    <button class="btn-publish" onclick={executeHyperRoboUnpublish}>
                        Make Private
                    </button>
                </div>
            </div>
        </div>
    {/if}

    {#if showOnboardingModal}
        <div class="modal-overlay">
            <div class="settings-modal-card onboarding-card" onclick={(e) => e.stopPropagation()} role="presentation">
                <div class="modal-header">
                    <h2>Welcome to HyperCardBook</h2>
                </div>
                <div class="modal-body">
                    <p class="onboarding-desc" style="color: #cbd5e1; margin-bottom: 20px; font-size: 14px;">Please set up your pen name and default reading language to get started.</p>
                    <div class="form-group">
                        <label for="onboarding-nickname" style="display: block; margin-bottom: 8px; font-size: 13px; color: #9ca3af;">Pen Name (Nickname)</label>
                        <input id="onboarding-nickname" type="text" bind:value={onboardingNickname} placeholder="e.g., Quark" style="width: 100%; padding: 10px; background: rgba(0, 0, 0, 0.2); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; color: #fff; font-size: 14px; outline: none; box-sizing: border-box;" />
                    </div>
                    <div class="form-group" style="margin-top: 16px;">
                        <label for="onboarding-language" style="display: block; margin-bottom: 8px; font-size: 13px; color: #9ca3af;">Default Reading Language</label>
                        <select id="onboarding-language" bind:value={onboardingLanguage} style="width: 100%; padding: 10px; background: #1f2937; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; color: #fff; font-size: 14px; outline: none; box-sizing: border-box;">
                            {#each LANGUAGES as lang}
                                <option value={lang.code}>{lang.flag} {lang.label}</option>
                            {/each}
                        </select>
                    </div>
                </div>
                <div class="modal-footer" style="margin-top: 24px; display: flex; justify-content: flex-end;">
                    <button class="save-btn" onclick={saveOnboarding} style="background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); border: none; color: #fff; padding: 10px 20px; border-radius: 6px; font-weight: 600; cursor: pointer; transition: filter 0.2s;">Get Started</button>
                </div>
            </div>
        </div>
    {/if}

    {#if showFullLangModal}
        <div class="modal-overlay" onclick={() => showFullLangModal = false} onkeydown={(e) => e.key === 'Escape' && (showFullLangModal = false)} role="presentation">
            <div class="settings-modal-card lang-search-modal" onclick={(e) => e.stopPropagation()} role="presentation" style="max-width: 450px; height: 500px; display: flex; flex-direction: column;">
                <div class="modal-header">
                    <h2>Select Language</h2>
                    <button class="close-btn" onclick={() => showFullLangModal = false}>✕</button>
                </div>
                <div class="modal-body" style="flex: 1; display: flex; flex-direction: column; overflow: hidden; padding-top: 10px;">
                    <div class="form-group" style="margin-bottom: 16px;">
                        <input 
                            type="text" 
                            bind:value={langSearchQuery} 
                            placeholder="Search languages..." 
                            style="width: 100%; padding: 10px 12px; background: rgba(0, 0, 0, 0.2); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; color: #fff; font-size: 14px; outline: none; box-sizing: border-box;"
                        />
                    </div>
                    <div class="lang-scroll-list" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; padding-right: 4px;">
                        {#each filteredLanguages as lang}
                            <button 
                                class="lang-option" 
                                class:active={currentLanguage === lang.code} 
                                onclick={() => { selectLanguage(lang.code); showFullLangModal = false; }}
                                style="display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 14px; background: transparent; border: none; border-radius: 6px; color: #fff; cursor: pointer; text-align: left; font-size: 14px; transition: background 0.2s;"
                            >
                                <span style="font-size: 18px;">{lang.flag}</span>
                                <span>{lang.label}</span>
                                {#if currentLanguage === lang.code}
                                    <span style="margin-left: auto; color: #a78bfa;">✓</span>
                                {/if}
                            </button>
                        {/each}
                        {#if filteredLanguages.length === 0}
                            <p style="color: #9ca3af; text-align: center; font-size: 14px; margin-top: 20px;">No languages found.</p>
                        {/if}
                    </div>
                </div>
            </div>
        </div>
    {/if}

    {#if showSettingsModal}
        <div class="modal-overlay" onclick={() => showSettingsModal = false} onkeydown={(e) => e.key === 'Escape' && (showSettingsModal = false)} role="presentation">
            <div class="settings-modal-card" onclick={(e) => e.stopPropagation()} role="presentation">
                <div class="modal-header">
                    <h2>Settings</h2>
                    <button class="close-btn" onclick={() => showSettingsModal = false}>✕</button>
                </div>
                
                <div class="modal-tabs">
                    <button 
                        class="tab-link" 
                        class:active={settingsActiveTab === 'profile'} 
                        onclick={() => settingsActiveTab = 'profile'}
                    >
                        Profile
                    </button>
                    <button 
                        class="tab-link" 
                        class:active={settingsActiveTab === 'hypercardbook'} 
                        onclick={() => settingsActiveTab = 'hypercardbook'}
                    >
                        hypercardbook.md
                    </button>
                    <button 
                        class="tab-link" 
                        class:active={settingsActiveTab === 'plugin'} 
                        onclick={() => settingsActiveTab = 'plugin'}
                    >
                        Plugin
                    </button>
                </div>
                
                <div class="modal-body">
                    {#if settingsActiveTab === 'profile'}
                        <div class="tab-pane">
                            <div class="form-group">
                                <label for="setting-avatar">Avatar</label>
                                <div class="avatar-edit-container">
                                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                                    <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
                                    <img 
                                        src={profileAvatarUrl || '/default-avatar.png'} 
                                        alt="Preview" 
                                        class="avatar-preview clickable-avatar" 
                                        onclick={() => avatarFileInputEl?.click()}
                                        role="button"
                                        tabindex="0"
                                    />
                                    <input 
                                        type="file" 
                                        accept="image/*" 
                                        bind:this={avatarFileInputEl} 
                                        onchange={handleAvatarUpload} 
                                        class="hidden-file-input" 
                                    />
                                    {#if isUploadingAvatar}
                                        <span class="uploading-status">Uploading...</span>
                                    {/if}
                                </div>
                            </div>
                            
                            <div class="form-group">
                                <label for="setting-nickname">Pen Name</label>
                                <input type="text" id="setting-nickname" bind:value={profileNickname} placeholder="" />
                            </div>
                            
                            <div class="form-group">
                                <label for="setting-language">Default Reading Language</label>
                                <select id="setting-language" bind:value={profileLanguage}>
                                    {#each LANGUAGES as lang}
                                        <option value={lang.code}>{lang.flag} {lang.label}</option>
                                    {/each}
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label for="setting-bio">Biography</label>
                                <textarea id="setting-bio" bind:value={profileAuthorBio} rows="4" placeholder=""></textarea>
                            </div>
                            
                            <div class="password-change-zone">
                                <h3>Change Password</h3>
                                <button type="button" class="theme-switch" onclick={() => showPasswordModal = true}>
                                    Change...
                                </button>
                            </div>
                            
                            <div class="danger-zone">
                                <h3>Delete Account</h3>
                                {#if deleteStep === 'none'}
                                    <button type="button" class="danger-btn" onclick={startAccountDelete}>
                                        Delete...
                                    </button>
                                {:else if deleteStep === 'warn'}
                                    <div class="delete-warning-box">
                                        <p class="warning-text">⚠️ Warning: This action is permanent and cannot be undone. All your books and profile data will be deleted forever.</p>
                                        <button type="button" class="warn-ok-btn" onclick={acceptDeleteWarning}>
                                            OK
                                        </button>
                                    </div>
                                {:else if deleteStep === 'credentials' || deleteStep === 'loading'}
                                    <div class="delete-credentials-box">
                                        <p>Enter email and password to confirm.</p>
                                        {#if deleteErrorMsg}
                                            <p class="error-msg">{deleteErrorMsg}</p>
                                        {/if}
                                        <div class="form-group">
                                            <input 
                                                type="email" 
                                                bind:value={deleteConfirmEmail} 
                                                placeholder="Email" 
                                                disabled={deleteStep === 'loading'} 
                                            />
                                        </div>
                                        <div class="form-group">
                                            <input 
                                                type="password" 
                                                bind:value={deleteConfirmPassword} 
                                                placeholder="Password" 
                                                disabled={deleteStep === 'loading'} 
                                            />
                                        </div>
                                        <div class="delete-actions">
                                            <button 
                                                type="button" 
                                                class="delete-cancel-btn" 
                                                onclick={() => deleteStep = 'none'}
                                                disabled={deleteStep === 'loading'}
                                            >
                                                Cancel
                                            </button>
                                            <button 
                                                type="button" 
                                                class="delete-execute-btn" 
                                                onclick={executeAccountDelete}
                                                disabled={!deleteConfirmEmail.trim() || !deleteConfirmPassword.trim() || deleteStep === 'loading'}
                                            >
                                                {deleteStep === 'loading' ? 'Deleting...' : 'Delete Account'}
                                            </button>
                                        </div>
                                    </div>
                                {/if}
                            </div>
                        </div>
                    {:else if settingsActiveTab === 'hypercardbook'}
                        <div class="tab-pane">
                            <div class="editor-header">
                                <p>System Prompt</p>
                                <button type="button" class="reset-default-btn" onclick={() => profileHypercardbookMd = DEFAULT_HYPERCARDBOOK_MD}>Reset</button>
                            </div>
                            <textarea class="md-editor-textarea" bind:value={profileHypercardbookMd} rows="15"></textarea>
                        </div>
                    {:else if settingsActiveTab === 'plugin'}
                        <div class="tab-pane plugin-tab-layout">
                            {#if pluginSubView === 'list'}
                                <div class="plugin-main-section">
                                    <div class="plugin-list-wrapper">
                                        <table class="plugin-table">
                                            <thead>
                                                <tr>
                                                    <th>Plugin</th>
                                                    <th>Kinds</th>
                                                    <th>Owner</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {#each allPlugins as p}
                                                    <tr 
                                                        class="plugin-row" 
                                                        class:selected={selectedPluginId === p.id}
                                                        onclick={() => selectPlugin(p)}
                                                    >
                                                        <td>
                                                            {activePluginIds.includes(p.id) ? '＊' : ''}{p.name}
                                                        </td>
                                                        <td>{p.kinds}</td>
                                                        <td>{p.owner}</td>
                                                    </tr>
                                                {/each}
                                            </tbody>
                                        </table>
                                    </div>
                                    
                                    <div class="plugin-actions-row">
                                        <button type="button" class="plugin-action-btn" onclick={openAddPluginView}>Add</button>
                                        <button type="button" class="plugin-action-btn" onclick={deleteSelectedPlugin} disabled={!selectedPluginId}>Delete</button>
                                    </div>
                                </div>

                                {#if selectedPlugin}
                                    <div class="plugin-prompt-section" style="border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 12px; display: flex; flex-direction: column; gap: 12px;">
                                        <div style="display: flex; justify-content: space-between; align-items: center;">
                                            <h4 style="margin: 0; font-size: 13px; font-weight: 600;">
                                                Edit Skill Details
                                            </h4>
                                        </div>

                                        <div class="form-group" style="display: flex; flex-direction: column; gap: 4px; width: 100%;">
                                            <label style="font-size: 12px; font-weight: 600; opacity: 0.8;">Skill Name</label>
                                            <input 
                                                type="text" 
                                                class="plugin-name-input" 
                                                bind:value={selectedPluginName} 
                                                oninput={handleNameInput} 
                                                placeholder="e.g. ですます切り替え"
                                                style="width: 100%; box-sizing: border-box;"
                                                disabled={selectedPlugin && selectedPlugin.owner !== 'My plugin'}
                                            />
                                        </div>

                                        <div class="form-group" style="display: flex; flex-direction: column; gap: 4px; width: 100%;">
                                            <label style="font-size: 12px; font-weight: 600; opacity: 0.8;">Description</label>
                                            <input 
                                                type="text" 
                                                class="plugin-name-input" 
                                                bind:value={selectedPluginDescription} 
                                                oninput={handleDescriptionInput} 
                                                placeholder="e.g. 文章の敬体を変換する"
                                                style="width: 100%; box-sizing: border-box;"
                                                disabled={selectedPlugin && selectedPlugin.owner !== 'My plugin'}
                                            />
                                        </div>

                                        <div class="form-group" style="display: flex; flex-direction: column; gap: 4px; width: 100%;">
                                            <label style="font-size: 12px; font-weight: 600; opacity: 0.8;">Skill Text (Skill文)</label>
                                            <textarea 
                                                class="md-editor-textarea" 
                                                bind:value={selectedPluginSkill} 
                                                oninput={handleSkillInput}
                                                rows="6"
                                                placeholder="Enter skill instructions/directives..."
                                                style="width: 100%; box-sizing: border-box; resize: vertical;"
                                                disabled={selectedPlugin && selectedPlugin.owner !== 'My plugin'}
                                            ></textarea>
                                        </div>

                                        {#if selectedPlugin && selectedPlugin.owner === 'My plugin'}
                                            <div class="ai-assistant-pane" style="background: rgba(139, 92, 246, 0.1); border: 1px solid rgba(139, 92, 246, 0.2); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px;">
                                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                                    <span style="font-size: 12px; font-weight: 600; color: #c084fc;">AI Skill Generator / Refiner</span>
                                                </div>
                                                <div style="display: flex; gap: 8px; width: 100%;">
                                                    <input 
                                                        type="text" 
                                                        class="plugin-name-input" 
                                                        bind:value={aiInstructionInput} 
                                                        placeholder="e.g., Translate to English, or make it more polite..."
                                                        style="flex: 1; min-width: 0;"
                                                        onkeydown={(e) => e.key === 'Enter' && runAIGenerator()}
                                                        disabled={isGeneratingSkill}
                                                    />
                                                    <button 
                                                        type="button" 
                                                        class="plugin-action-btn" 
                                                        onclick={runAIGenerator}
                                                        disabled={isGeneratingSkill || !aiInstructionInput.trim()}
                                                        style="background: #8b5cf6; border-color: #8b5cf6; color: #ffffff;"
                                                    >
                                                        {isGeneratingSkill ? 'Running...' : 'Run'}
                                                    </button>
                                                </div>
                                            </div>
                                        {/if}
                                    </div>
                                {/if}
                            {:else if pluginSubView === 'add'}
                                <div class="plugin-add-section">
                                    <h3>Add System Plugins</h3>
                                    <div class="plugin-list-wrapper">
                                        <table class="plugin-table">
                                            <thead>
                                                <tr>
                                                    <th>Plugin</th>
                                                    <th>Kinds</th>
                                                    <th>Owner</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {#each SYSTEM_PLUGINS as p}
                                                    <tr 
                                                        class="plugin-row" 
                                                        class:selected={selectedAddPluginId === p.id}
                                                        onclick={() => selectedAddPluginId = p.id}
                                                    >
                                                        <td>
                                                            {activePluginIds.includes(p.id) ? '＊' : ''}{p.name}
                                                        </td>
                                                        <td>{p.kinds}</td>
                                                        <td>{p.owner}</td>
                                                    </tr>
                                                {/each}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div class="plugin-add-actions">
                                        <button type="button" class="plugin-action-btn" onclick={() => pluginSubView = 'list'}>Cancel</button>
                                        <button 
                                            type="button" 
                                            class="plugin-action-btn" 
                                            onclick={installSelectedSystemPlugin} 
                                            disabled={!selectedAddPluginId || activePluginIds.includes(selectedAddPluginId)}
                                        >
                                            Add
                                        </button>
                                    </div>
                                </div>
                            {/if}
                        </div>
                    {/if}
                </div>
                
                <div class="modal-footer">
                    <button type="button" class="cancel-btn" onclick={() => showSettingsModal = false}>Cancel</button>
                    <button type="button" class="save-btn" onclick={saveSettings} disabled={isSavingSettings}>
                        {isSavingSettings ? 'Saving...' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    {/if}

    {#if showPasswordModal}
        <div class="modal-overlay" onclick={cancelPasswordChange} onkeydown={(e) => e.key === 'Escape' && cancelPasswordChange()} role="presentation">
            <div class="settings-modal-card" style="max-width: 400px;" onclick={(e) => e.stopPropagation()} role="presentation">
                <div class="modal-header">
                    <h2>パスワード変更 (Change Password)</h2>
                    <button class="close-btn" onclick={cancelPasswordChange}>✕</button>
                </div>
                
                <div class="modal-body" style="padding-top: 20px;">
                    <div class="password-change-form">
                        <div style="margin-bottom: 12px; font-size: 13px; border-bottom: 1px solid var(--card-border); padding-bottom: 10px;">
                            <span style="opacity: 0.7; color: var(--text-color);">ユーザーID (Email): </span>
                            <strong style="color: var(--text-color); font-family: monospace; font-size: 13px;">{data.session?.user?.email || ''}</strong>
                        </div>
                        <p style="font-size: 13px; opacity: 0.8; margin: 0 0 12px 0;">新しいパスワードを入力してください。</p>
                        {#if passwordChangeError}
                            <p class="error-msg">{passwordChangeError}</p>
                        {/if}
                        {#if passwordChangeSuccess}
                            <p class="success-msg">{passwordChangeSuccess}</p>
                        {/if}
                        <div class="form-group-compact">
                            <input 
                                type="password" 
                                bind:value={newPassword} 
                                placeholder="新しいパスワード" 
                                disabled={passwordChangeStep === 'loading'}
                            />
                        </div>
                        <div class="form-group-compact" style="margin-top: 12px;">
                            <input 
                                type="password" 
                                bind:value={confirmNewPassword} 
                                placeholder="新しいパスワード（確認用）" 
                                disabled={passwordChangeStep === 'loading'}
                            />
                        </div>
                    </div>
                </div>
                
                <div class="modal-footer" style="margin-top: 20px;">
                    <button type="button" class="cancel-btn" onclick={cancelPasswordChange} disabled={passwordChangeStep === 'loading'}>キャンセル</button>
                    <button 
                        type="button" 
                        class="save-btn" 
                        onclick={executePasswordChange} 
                        disabled={passwordChangeStep === 'loading' || !newPassword || !confirmNewPassword}
                    >
                        {passwordChangeStep === 'loading' ? '更新中...' : 'パスワードを更新'}
                    </button>
                </div>
            </div>
        </div>
    {/if}

    <footer class="app-footer">
        <div class="footer-content">
            <span><a href="/published/d9841327-418b-41fd-8657-59c3b7f7fb19/hypercardbook.html" target="_blank" rel="noopener noreferrer" class="footer-link">Open-source project</a> by Koichi Nagata(Quark).</span>
            <span class="footer-separator">&bull;</span>
            <span>MIT License</span>
            <span class="footer-separator">&bull;</span>
            <a href="https://github.com/kouichinagata/hypercardbook" target="_blank" rel="noopener noreferrer" class="footer-link">
                <svg class="github-icon" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                </svg>
                GitHub Repository
            </a>
            <span class="footer-separator">&bull;</span>
            <button type="button" class="footer-link footer-button" onclick={() => isFreeCallOpen = true}>
                📞Free call
            </button>
        </div>
    </footer>

    {#if isFreeCallOpen}
        <div class="free-call-overlay" onclick={() => isFreeCallOpen = false} onkeydown={(e) => { if (e.key === 'Escape') isFreeCallOpen = false }}>
            <div class="free-call-dialog" onclick={(e) => e.stopPropagation()}>
                <button type="button" class="free-call-close-btn" onclick={() => isFreeCallOpen = false}>✕</button>
                <div class="free-call-iframe-container">
                    {#await getFreeCallUrl() then src}
                        <iframe 
                            {src} 
                            title="Free Call" 
                            class="free-call-iframe"
                            allow="microphone; camera; autoplay"
                        ></iframe>
                    {/await}
                </div>
            </div>
        </div>
    {/if}

    {#if isPromptCallOpen}
        <div 
            style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; z-index: 2000;" 
            onclick={() => isPromptCallOpen = false}
        >
            <div class="free-call-dialog" onclick={(e) => e.stopPropagation()}>
                <button type="button" class="free-call-close-btn" onclick={() => isPromptCallOpen = false}>✕</button>
                <div class="free-call-iframe-container">
                    {#await getFreeCallUrl() then src}
                        <iframe 
                            {src} 
                            title="Free Call" 
                            class="free-call-iframe"
                            allow="microphone; camera; autoplay"
                        ></iframe>
                    {/await}
                </div>
            </div>
        </div>
    {/if}

    <!-- 左右分割ビュー（実験用） -->
    {#if isSplitViewOpen}
        <div class="split-view-container">
            {#if !activeHyperRobo?.hideHyperbook}
                <div class="split-view-header">
                    <!-- 左側ヘッダー -->
                    <div class="header-left-pane">
                        <button type="button" class="back-home-btn" onclick={toggleSplitView}>
                            back
                        </button>
                    </div>
                    <!-- 右側ヘッダー -->
                    <div class="header-right-pane">
                    </div>
                </div>
            {/if}
            <div class="split-view-panes" style={activeHyperRobo?.hideHyperbook ? "height: 100% !important;" : ""}>
                <!-- 左側：PapeRobo (モバイルアスペクト比で中央寄せ、非表示時は390pxで上寄せ中央) -->
                <div class="split-pane left-pane" class:full-width={activeHyperRobo?.hideHyperbook}>
                    {#await getLeftPaneUrl() then src}
                        <iframe 
                            {src} 
                            title="PapeRobo" 
                            class="split-iframe"
                            allow="microphone; camera; autoplay"
                            allowtransparency="true"
                            style="background: transparent; color-scheme: normal;"
                        ></iframe>
                    {/await}
                </div>
                <!-- 右側：HyperCardBook -->
                <div class="split-pane right-pane" style={activeHyperRobo?.hideHyperbook ? "display: none !important;" : ""}>
                    {#if activeHyperBook}
                        {#if activeHyperBook.isCard}
                            <div class="right-pane-card-wrapper">
                                <Card 
                                    markdown={activeHyperBook.markdownContent} 
                                    id={activeHyperBook.id} 
                                    backUrl="" 
                                    isEmbed={true} 
                                    showNewTab={false}
                                    activePluginIds={activePluginIds}
                                />
                            </div>
                        {:else}
                            <Book 
                                markdown={activeHyperBook.markdownContent} 
                                id={activeHyperBook.id} 
                                backUrl="" 
                                activePluginIds={[]} 
                                language="ja"
                                currentUserId={data.currentUserId}
                            />
                        {/if}
                    {/if}
                </div>
            </div>
        </div>
    {/if}
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
        padding: 0 12px 0 4px;
        height: 34px;
        box-sizing: border-box;
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
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
    }

    .title-logo {
        width: 36px;
        height: 36px;
        object-fit: cover;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
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

    .hidden-file-input {
        display: none !important;
    }

    textarea {
        width: 100%;
        background: transparent;
        border: none;
        color: #ffffff;
        font-size: 14px;
        line-height: 1.5;
        resize: none;
        outline: none;
        box-sizing: border-box;
        padding: 0;
    }

    .landing-container[data-theme="light"] textarea {
        background: transparent;
        border: none;
        color: #3d2516;
    }

    textarea:focus {
        outline: none;
    }

    .prompt-textarea-wrapper {
        width: 100%;
        display: flex;
        flex-direction: column;
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 12px;
        padding: 14px;
        gap: 12px;
        box-sizing: border-box;
    }

    .landing-container[data-theme="light"] .prompt-textarea-wrapper {
        background: rgba(255, 255, 255, 0.9);
        border: 1px solid rgba(0, 0, 0, 0.15);
    }

    .prompt-bottom-left {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .mode-toggle-container {
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
        height: 36px;
        padding: 0 16px;
        background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
        border: none;
        border-radius: 8px;
        color: #ffffff;
        font-family: 'Outfit', sans-serif;
        font-size: 13px;
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

    .clickable-profile {
        cursor: pointer;
        transition: transform 0.2s, background-color 0.2s;
    }
    .clickable-profile:hover {
        background-color: var(--card-border);
        transform: scale(1.02);
    }
    
    /* --- Modal CSS --- */
    .modal-overlay {
        position: fixed;
        top: 0; left: 0;
        width: 100vw; height: 100vh;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        backdrop-filter: blur(4px);
        box-sizing: border-box;
    }
    
    .settings-modal-card {
        background: #12131c;
        border: 1px solid rgba(255, 255, 255, 0.1);
        width: 90%;
        max-width: 600px;
        height: 520px;
        border-radius: 16px;
        display: flex;
        flex-direction: column;
        max-height: 85vh;
        box-shadow: 0 20px 50px rgba(0,0,0,0.5);
        color: #f5ebe0;
        font-family: system-ui, sans-serif;
        overflow: hidden;
        box-sizing: border-box;
    }
    .landing-container[data-theme="light"] .settings-modal-card {
        background: #ebdcd0;
        border-color: rgba(61, 37, 22, 0.15);
        color: #3d2516;
        box-shadow: 0 10px 30px rgba(61, 37, 22, 0.15);
    }
    
    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 24px;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        box-sizing: border-box;
    }
    .landing-container[data-theme="light"] .modal-header {
        border-bottom-color: rgba(61, 37, 22, 0.1);
    }
    .modal-header h2 {
        margin: 0;
        font-size: 18px;
        font-weight: 700;
        font-family: 'Outfit', sans-serif;
    }
    .close-btn {
        background: none;
        border: none;
        color: inherit;
        font-size: 18px;
        cursor: pointer;
        opacity: 0.7;
    }
    .close-btn:hover {
        opacity: 1;
    }
    
    .modal-tabs {
        display: flex;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        background: rgba(0,0,0,0.15);
        box-sizing: border-box;
    }
    .landing-container[data-theme="light"] .modal-tabs {
        border-bottom-color: rgba(61, 37, 22, 0.1);
        background: rgba(61, 37, 22, 0.03);
    }
    .tab-link {
        flex: 1;
        background: none;
        border: none;
        border-bottom: 2px solid transparent;
        color: inherit;
        padding: 12px 8px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        opacity: 0.6;
        transition: 0.2s;
        text-align: center;
    }
    .tab-link:hover {
        opacity: 0.9;
    }
    .tab-link.active {
        opacity: 1;
        color: #8b5cf6;
        border-bottom-color: #8b5cf6;
    }
    
    .modal-body {
        padding: 24px;
        overflow-y: auto;
        flex: 1;
        box-sizing: border-box;
    }
    
    .tab-pane {
        display: flex;
        flex-direction: column;
        gap: 16px;
        box-sizing: border-box;
    }
    
    .form-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
        box-sizing: border-box;
        text-align: left;
    }
    .form-group label {
        font-size: 12px;
        font-weight: 600;
        opacity: 0.8;
    }
    .form-group input[type="text"],
    .form-group input[type="email"],
    .form-group input[type="password"],
    .form-group select,
    .form-group textarea {
        background: rgba(0,0,0,0.2);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 8px;
        padding: 10px 12px;
        color: inherit;
        font-size: 14px;
        outline: none;
        transition: border-color 0.2s;
        box-sizing: border-box;
        width: 100%;
    }
    .form-group select option {
        background: #1f2937;
        color: #fff;
    }
    .landing-container[data-theme="light"] .form-group input[type="text"],
    .landing-container[data-theme="light"] .form-group input[type="email"],
    .landing-container[data-theme="light"] .form-group input[type="password"],
    .landing-container[data-theme="light"] .form-group select,
    .landing-container[data-theme="light"] .form-group textarea {
        background: rgba(255,255,255,0.5);
        border-color: rgba(61, 37, 22, 0.15);
    }
    .landing-container[data-theme="light"] .form-group select option {
        background: #fff;
        color: #000;
    }
    .form-group input:focus, .form-group select:focus, .form-group textarea:focus {
        border-color: #8b5cf6;
    }
    
    .avatar-edit-container {
        display: flex;
        align-items: center;
        gap: 16px;
        box-sizing: border-box;
    }
    .avatar-preview {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        object-fit: cover;
        border: 2px solid rgba(255,255,255,0.1);
    }
    .clickable-avatar {
        cursor: pointer;
        transition: opacity 0.2s, transform 0.2s;
    }
    .clickable-avatar:hover {
        opacity: 0.8;
        transform: scale(1.05);
    }
    .clickable-avatar:active {
        transform: scale(0.95);
    }
    .uploading-status {
        font-size: 12px;
        opacity: 0.7;
    }
    .avatar-upload-btn {
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.15);
        color: inherit;
        border-radius: 6px;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: 0.2s;
    }
    .avatar-upload-btn:hover {
        background: rgba(255,255,255,0.1);
    }
    
    .editor-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 12px;
        opacity: 0.8;
        box-sizing: border-box;
    }
    .reset-default-btn {
        background: none;
        border: none;
        color: #8b5cf6;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
    }
    .reset-default-btn:hover {
        text-decoration: underline;
    }
    .md-editor-textarea {
        font-family: monospace;
        font-size: 13px;
        line-height: 1.5;
        resize: vertical;
    }
    
    .danger-zone {
        border-top: 1px solid rgba(255,255,255,0.08);
        margin-top: 12px;
        padding-top: 16px;
        box-sizing: border-box;
        text-align: left;
    }
    .landing-container[data-theme="light"] .danger-zone {
        border-top-color: rgba(61, 37, 22, 0.1);
    }
    .danger-zone h3 {
        color: #ef4444;
        font-size: 14px;
        margin: 0 0 10px 0;
        font-weight: 700;
    }
    .danger-btn {
        background: rgba(239, 68, 68, 0.15);
        border: 1px solid rgba(239, 68, 68, 0.4);
        color: #fca5a5;
        border-radius: 8px;
        padding: 8px 16px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    }
    .danger-btn:hover {
        background: #ef4444;
        color: #ffffff;
    }
    .landing-container[data-theme="light"] .danger-btn {
        color: #b91c1c;
        border-color: rgba(239, 68, 68, 0.3);
    }
    .landing-container[data-theme="light"] .danger-btn:hover {
        background: #ef4444;
        color: #ffffff;
    }
    
    .delete-warning-box {
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.2);
        padding: 12px 16px;
        border-radius: 8px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        box-sizing: border-box;
    }
    .warning-text {
        color: #fca5a5;
        font-size: 13px;
        line-height: 1.4;
        margin: 0;
    }
    .landing-container[data-theme="light"] .warning-text {
        color: #b91c1c;
    }
    .warn-ok-btn {
        align-self: flex-end;
        background: #ef4444;
        border: none;
        color: white;
        border-radius: 6px;
        padding: 6px 16px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
    }
    
    .delete-credentials-box {
        background: rgba(0,0,0,0.15);
        border: 1px solid rgba(255,255,255,0.05);
        padding: 16px;
        border-radius: 8px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        box-sizing: border-box;
    }
    .landing-container[data-theme="light"] .delete-credentials-box {
        background: rgba(255,255,255,0.4);
        border-color: rgba(61, 37, 22, 0.1);
    }
    .delete-credentials-box p {
        margin: 0;
        font-size: 13px;
        opacity: 0.9;
    }
    .delete-credentials-box .error-msg {
        color: #fca5a5;
        font-weight: 600;
    }
    .landing-container[data-theme="light"] .delete-credentials-box .error-msg {
        color: #b91c1c;
    }
    .delete-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 4px;
        box-sizing: border-box;
    }
    .delete-cancel-btn {
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.15);
        color: inherit;
        border-radius: 6px;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
    }
    .delete-execute-btn {
        background: #ef4444;
        border: none;
        color: white;
        border-radius: 6px;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
    }
    .delete-execute-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
    
    .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        padding: 16px 24px;
        border-top: 1px solid rgba(255,255,255,0.08);
        background: rgba(0,0,0,0.1);
        box-sizing: border-box;
    }
    .landing-container[data-theme="light"] .modal-footer {
        border-top-color: rgba(61, 37, 22, 0.1);
        background: rgba(61, 37, 22, 0.02);
    }
    .modal-footer .cancel-btn {
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.15);
        color: inherit;
        border-radius: 20px;
        padding: 8px 20px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
    }
    .modal-footer .save-btn {
        background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
        border: none;
        color: white;
        border-radius: 20px;
        padding: 8px 20px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
    }
    .modal-footer .save-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        box-shadow: none;
    }

    .prompt-bottom-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
        margin-top: 8px;
        box-sizing: border-box;
    }

    .attach-trigger-btn {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: #ffffff;
        border-radius: 8px;
        width: 36px;
        height: 36px;
        font-size: 16px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    }

    .attach-trigger-btn:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.12);
        border-color: rgba(255, 255, 255, 0.25);
        transform: scale(1.05);
    }

    .attach-trigger-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    /* Attached files preview bar */
    .attached-files-preview-bar {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
        margin-bottom: 12px;
        max-height: 120px;
        overflow-y: auto;
        width: 100%;
        box-sizing: border-box;
    }

    .attached-file-badge {
        display: flex;
        align-items: center;
        gap: 6px;
        background: rgba(139, 92, 246, 0.15);
        border: 1px solid rgba(139, 92, 246, 0.35);
        padding: 4px 8px;
        border-radius: 6px;
        font-size: 12px;
        color: #cbd5e1;
        max-width: 180px;
        box-sizing: border-box;
    }

    .landing-container[data-theme="light"] .attached-file-badge {
        background: rgba(139, 92, 246, 0.08);
        border-color: rgba(139, 92, 246, 0.25);
        color: #3d2516;
    }

    .attached-file-badge.error {
        background: rgba(239, 68, 68, 0.1);
        border-color: rgba(239, 68, 68, 0.3);
        color: #fca5a5;
    }

    .badge-thumb {
        width: 20px;
        height: 20px;
        object-fit: cover;
        border-radius: 3px;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .badge-icon {
        font-size: 14px;
    }

    .badge-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
    }

    .badge-remove-btn {
        background: none;
        border: none;
        color: #9ca3af;
        cursor: pointer;
        padding: 0 2px;
        font-size: 11px;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.2s;
    }

    .badge-remove-btn:hover {
        color: #ef4444;
    }

    .badge-spinner {
        width: 12px;
        height: 12px;
        border: 2px solid rgba(139, 92, 246, 0.1);
        border-top-color: #8b5cf6;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    /* Password change zone styles */
    .password-change-zone {
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        margin-top: 24px;
        padding-top: 16px;
        box-sizing: border-box;
        text-align: left;
    }
    .landing-container[data-theme="light"] .password-change-zone {
        border-top-color: rgba(61, 37, 22, 0.1);
    }
    .password-change-zone h3 {
        color: var(--text-color);
        font-size: 14px;
        margin: 0 0 10px 0;
        font-weight: 700;
        opacity: 0.9;
    }
    .password-change-form {
        display: flex;
        flex-direction: column;
        gap: 12px;
        max-width: 320px;
    }
    .form-group-compact input {
        width: 100%;
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        padding: 10px 12px;
        color: #ffffff;
        font-size: 13px;
        box-sizing: border-box;
        outline: none;
    }
    .landing-container[data-theme="light"] .form-group-compact input {
        background: #ffffff;
        border-color: rgba(0, 0, 0, 0.15);
        color: #3d2516;
    }
    .form-group-compact input:focus {
        border-color: #8b5cf6;
    }
    .password-actions {
        display: flex;
        gap: 8px;
    }
    .save-btn-compact {
        background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
        color: #ffffff;
        border: none;
        border-radius: 8px;
        padding: 6px 14px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    }
    .save-btn-compact:hover:not(:disabled) {
        filter: brightness(1.1);
    }
    .save-btn-compact:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    .error-msg {
        color: #fca5a5;
        font-size: 12px;
        margin: 0;
        text-align: left;
    }
    .landing-container[data-theme="light"] .error-msg {
        color: #ef4444;
    }
    .success-msg {
        color: #a7f3d0;
        font-size: 12px;
        margin: 0;
        text-align: left;
    }
    .landing-container[data-theme="light"] .success-msg {
        color: #059669;
    }
    /* --- Stack View Header --- */
    .stack-view-header {
        width: 90%;
        max-width: 960px;
        margin: 20px auto 0;
        display: flex;
        align-items: center;
        gap: 16px;
        box-sizing: border-box;
    }
    .back-to-home-btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: #ffffff;
        padding: 8px 16px;
        border-radius: 20px;
        font-size: 0.85rem;
        cursor: pointer;
        transition: all 0.2s;
        font-weight: 500;
    }
    .back-to-home-btn:hover {
        background: rgba(255, 255, 255, 0.18);
        transform: translateX(-2px);
    }
    .stack-view-title {
        margin: 0;
        font-size: 1.5rem;
        font-weight: 700;
        color: #ffffff;
        font-family: 'Outfit', sans-serif;
    }
    .landing-container[data-theme="light"] .back-to-home-btn {
        background: rgba(61, 37, 22, 0.06);
        border-color: rgba(61, 37, 22, 0.15);
        color: #3d2516;
    }
    .landing-container[data-theme="light"] .back-to-home-btn:hover {
        background: rgba(61, 37, 22, 0.12);
    }
    .landing-container[data-theme="light"] .stack-view-title {
        color: #3d2516;
    }

    /* --- Stack Editor Popup Panel --- */
    .stack-popup-panel {
        position: fixed;
        right: 24px;
        top: 100px;
        width: 340px;
        background: rgba(26, 18, 11, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 16px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        z-index: 200;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        backdrop-filter: blur(10px);
        font-family: system-ui, -apple-system, sans-serif;
    }
    .landing-container[data-theme="light"] .stack-popup-panel {
        background: rgba(255, 255, 255, 0.95);
        border-color: rgba(61, 37, 22, 0.15);
        box-shadow: 0 10px 30px rgba(61, 37, 22, 0.15);
    }

    .stack-popup-header {
        padding: 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .landing-container[data-theme="light"] .stack-popup-header {
        border-bottom-color: rgba(61, 37, 22, 0.08);
    }
    .stack-popup-header h3 {
        margin: 0;
        font-size: 1rem;
        font-weight: 700;
        color: #ffffff;
    }
    .landing-container[data-theme="light"] .stack-popup-header h3 {
        color: #3d2516;
    }
    .close-popup-btn {
        background: none;
        border: none;
        color: #a0aec0;
        font-size: 1.1rem;
        cursor: pointer;
        transition: color 0.2s;
    }
    .close-popup-btn:hover {
        color: #ffffff;
    }
    .landing-container[data-theme="light"] .close-popup-btn:hover {
        color: #3d2516;
    }

    .stack-popup-body {
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        max-height: 400px;
        overflow-y: auto;
    }
    .select-hint {
        margin: 0;
        font-size: 0.8rem;
        color: #a78bfa;
        font-weight: 600;
        background: rgba(167, 139, 250, 0.1);
        padding: 8px 12px;
        border-radius: 8px;
        border-left: 3px solid #8b5cf6;
    }
    .form-group-stack {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .form-group-stack label {
        font-size: 0.75rem;
        font-weight: bold;
        color: #a0aec0;
    }
    .landing-container[data-theme="light"] .form-group-stack label {
        color: #718096;
    }
    .stack-title-input-field {
        background: rgba(0, 0, 0, 0.2);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        padding: 8px 12px;
        color: #ffffff;
        font-size: 0.85rem;
        outline: none;
    }
    .landing-container[data-theme="light"] .stack-title-input-field {
        background: #f7fafc;
        border-color: rgba(61, 37, 22, 0.15);
        color: #3d2516;
    }
    .stack-title-input-field:focus {
        border-color: #8b5cf6;
    }

    .stack-listbox-container {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .listbox-label {
        font-size: 0.75rem;
        font-weight: bold;
        color: #a0aec0;
    }
    .landing-container[data-theme="light"] .listbox-label {
        color: #718096;
    }
    .stack-listbox {
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(0, 0, 0, 0.15);
        border-radius: 8px;
        min-height: 120px;
        max-height: 220px;
        overflow-y: auto;
        padding: 8px;
        box-sizing: border-box;
    }
    .landing-container[data-theme="light"] .stack-listbox {
        border-color: rgba(61, 37, 22, 0.08);
        background: #f7fafc;
    }
    .empty-listbox {
        color: #718096;
        font-size: 0.75rem;
        text-align: center;
        padding: 40px 10px;
    }
    .listbox-items {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .listbox-item {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 6px;
        padding: 6px 10px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        box-sizing: border-box;
    }
    .landing-container[data-theme="light"] .listbox-item {
        background: #ffffff;
        border-color: rgba(61, 37, 22, 0.08);
    }
    .item-title {
        font-size: 0.8rem;
        color: #ffffff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex-grow: 1;
        text-align: left;
    }
    .landing-container[data-theme="light"] .item-title {
        color: #3d2516;
    }
    .item-badge {
        font-size: 0.6rem;
        background: rgba(255, 255, 255, 0.1);
        color: #a0aec0;
        padding: 2px 6px;
        border-radius: 4px;
        flex-shrink: 0;
    }
    .landing-container[data-theme="light"] .item-badge {
        background: rgba(61, 37, 22, 0.06);
        color: #718096;
    }
    .item-controls {
        display: flex;
        gap: 2px;
        align-items: center;
        flex-shrink: 0;
    }
    .control-arrow-btn, .control-remove-btn {
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #cbd5e0;
        width: 20px;
        height: 20px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 0.65rem;
        padding: 0;
    }
    .landing-container[data-theme="light"] .control-arrow-btn, 
    .landing-container[data-theme="light"] .control-remove-btn {
        background: #f7fafc;
        border-color: rgba(61, 37, 22, 0.1);
        color: #4a5568;
    }
    .control-arrow-btn:hover:not(:disabled), .control-remove-btn:hover {
        background: rgba(255, 255, 255, 0.15);
        color: #ffffff;
    }
    .landing-container[data-theme="light"] .control-arrow-btn:hover:not(:disabled), 
    .landing-container[data-theme="light"] .control-remove-btn:hover {
        background: rgba(61, 37, 22, 0.08);
        color: #000000;
    }
    .control-arrow-btn:disabled {
        opacity: 0.3;
        cursor: not-allowed;
    }

    .stack-popup-footer {
        padding: 16px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        display: flex;
        justify-content: flex-end;
        gap: 8px;
    }
    .landing-container[data-theme="light"] .stack-popup-footer {
        border-top-color: rgba(61, 37, 22, 0.08);
    }
    .btn-popup {
        border-radius: 8px;
        padding: 8px 16px;
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
        border: none;
        transition: all 0.2s;
    }
    .btn-popup-secondary {
        background: rgba(255, 255, 255, 0.08);
        color: #cbd5e0;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .landing-container[data-theme="light"] .btn-popup-secondary {
        background: #e2e8f0;
        color: #4a5568;
        border-color: rgba(61, 37, 22, 0.1);
    }
    .btn-popup-secondary:hover {
        background: rgba(255, 255, 255, 0.15);
    }
    .landing-container[data-theme="light"] .btn-popup-secondary:hover {
        background: #cbd5e0;
    }
    .btn-popup-primary {
        background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
        color: #ffffff;
    }
    .btn-popup-primary:hover:not(:disabled) {
        filter: brightness(1.1);
        transform: translateY(-1px);
    }
    .btn-popup-primary:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    @media (max-width: 768px) {
        .stack-popup-panel {
            right: 12px;
            top: auto;
            bottom: 20px;
            width: calc(100% - 24px);
            max-width: 360px;
        }
    }

    /* Publish Modal Styles */
    .publish-modal-card {
        background: #12131c;
        border: 1px solid rgba(255, 255, 255, 0.1);
        width: 90%;
        max-width: 480px;
        border-radius: 12px;
        display: flex;
        flex-direction: column;
        box-shadow: 0 20px 50px rgba(0,0,0,0.5);
        color: #cbd5e1;
        overflow: hidden;
        box-sizing: border-box;
        text-align: left;
        padding: 24px;
        gap: 16px;
        font-family: system-ui, -apple-system, sans-serif;
    }
    
    .landing-container[data-theme="light"] .publish-modal-card {
        background: #f4eae1;
        border-color: rgba(61, 37, 22, 0.15);
        color: #3d2516;
        box-shadow: 0 10px 30px rgba(61, 37, 22, 0.15);
    }
    
    .publish-modal-body {
        font-size: 14px;
        line-height: 1.6;
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .publish-modal-body p {
        margin: 0;
    }
    
    .publish-confirm-label {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        margin-top: 14px;
        cursor: pointer;
        user-select: none;
    }

    .publish-confirm-label input {
        margin-top: 3px;
        cursor: pointer;
    }

    .publish-confirm-label span {
        font-size: 13px;
        font-weight: 500;
        opacity: 0.9;
    }
    
    .publish-modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        margin-top: 8px;
    }
    
    .publish-modal-footer button {
        padding: 8px 20px;
        border-radius: 20px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        border: none;
    }
    
    .publish-modal-footer .btn-cancel {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: inherit;
    }
    
    .publish-modal-footer .btn-cancel:hover {
        background: rgba(255, 255, 255, 0.12);
    }
    
    .landing-container[data-theme="light"] .publish-modal-footer .btn-cancel {
        background: rgba(0, 0, 0, 0.03);
        border-color: rgba(0, 0, 0, 0.1);
    }
    
    .publish-modal-footer .btn-publish {
        background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
        color: #ffffff;
        box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
    }
    
    .publish-modal-footer .btn-publish:hover:not(:disabled) {
        filter: brightness(1.1);
    }
    
    .publish-modal-footer .btn-publish:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        box-shadow: none;
    }

    .stack-publish-btn.is-public {
        color: #8b5cf6 !important;
    }

    /* Public Books separator and golden plate styles */
    .public-books-separator {
        width: 100%;
        display: flex;
        justify-content: center;
        margin-top: 50px;
        margin-bottom: 20px;
        box-sizing: border-box;
    }

    .golden-plate {
        background: linear-gradient(135deg, #bf953f 0%, #fcf6ba 25%, #b38728 50%, #fbf5b7 75%, #aa771c 100%);
        border: 2px solid #5d4010;
        border-radius: 4px;
        color: #3d2508;
        font-family: "Georgia", serif;
        font-size: 16px;
        font-weight: bold;
        letter-spacing: 2px;
        text-transform: uppercase;
        padding: 8px 32px;
        box-shadow: 
            inset 0 1px 0 rgba(255,255,255,0.4),
            inset 0 -1px 0 rgba(0,0,0,0.4),
            0 4px 8px rgba(0,0,0,0.3);
        text-shadow: 1px 1px 0px rgba(255,255,255,0.5);
        position: relative;
        text-align: center;
        user-select: none;
    }

    .golden-plate::before {
        content: '';
        position: absolute;
        top: 2px;
        left: 2px;
        right: 2px;
        bottom: 2px;
        border: 1px solid rgba(93, 64, 16, 0.4);
        pointer-events: none;
    }

    .golden-plate.clickable-plate {
        cursor: pointer;
        transition: all 0.3s ease;
    }

    .golden-plate.clickable-plate:hover {
        filter: brightness(1.15);
        transform: translateY(-2px);
        box-shadow: 
            inset 0 1px 0 rgba(255,255,255,0.4),
            inset 0 -1px 0 rgba(0,0,0,0.4),
            0 6px 14px rgba(0,0,0,0.4);
    }

    .golden-plate.clickable-plate:active {
        transform: translateY(0);
        box-shadow: 
            inset 0 1px 0 rgba(255,255,255,0.4),
            inset 0 -1px 0 rgba(0,0,0,0.4),
            0 2px 4px rgba(0,0,0,0.3);
    }

    .golden-plate.no-pointer {
        cursor: default;
    }

    /* Plugin/Skills tab stylings */
    .plugin-tab-layout {
        display: flex;
        flex-direction: column;
        gap: 16px;
        box-sizing: border-box;
    }
    .plugin-main-section {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }
    .plugin-list-wrapper {
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.2);
        max-height: 180px;
        overflow-y: auto;
    }
    .landing-container[data-theme="light"] .plugin-list-wrapper {
        border-color: rgba(61, 37, 22, 0.15);
        background: rgba(255, 255, 255, 0.4);
    }
    .plugin-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
        text-align: left;
    }
    .plugin-table th, .plugin-table td {
        padding: 8px 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    .landing-container[data-theme="light"] .plugin-table th, 
    .landing-container[data-theme="light"] .plugin-table td {
        border-bottom-color: rgba(61, 37, 22, 0.08);
    }
    .plugin-table th {
        font-weight: 600;
        opacity: 0.8;
        background: rgba(0, 0, 0, 0.15);
        position: sticky;
        top: 0;
        z-index: 1;
    }
    .landing-container[data-theme="light"] .plugin-table th {
        background: rgba(61, 37, 22, 0.05);
    }
    .plugin-row {
        cursor: pointer;
        transition: background 0.2s;
    }
    .plugin-row:hover {
        background: rgba(255, 255, 255, 0.05);
    }
    .landing-container[data-theme="light"] .plugin-row:hover {
        background: rgba(61, 37, 22, 0.05);
    }
    .plugin-row.selected {
        background: rgba(139, 92, 246, 0.2) !important;
        color: #c084fc;
    }
    .landing-container[data-theme="light"] .plugin-row.selected {
        background: rgba(139, 92, 246, 0.15) !important;
        color: #8b5cf6;
    }
    .plugin-actions-row {
        display: flex;
        gap: 8px;
    }
    .plugin-action-btn {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: inherit;
        border-radius: 6px;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: 0.2s;
    }
    .plugin-action-btn:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.1);
    }
    .plugin-action-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    .landing-container[data-theme="light"] .plugin-action-btn {
        background: rgba(61, 37, 22, 0.05);
        border-color: rgba(61, 37, 22, 0.15);
    }
    .landing-container[data-theme="light"] .plugin-action-btn:hover:not(:disabled) {
        background: rgba(61, 37, 22, 0.1);
    }
    .plugin-prompt-section {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .plugin-name-input {
        background: rgba(0, 0, 0, 0.2);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: inherit;
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 13px;
        font-weight: 600;
        width: 200px;
    }
    .landing-container[data-theme="light"] .plugin-name-input {
        background: rgba(255, 255, 255, 0.5);
        border-color: rgba(61, 37, 22, 0.15);
    }
    .plugin-add-section {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 12px;
        border: 1px dashed rgba(255, 255, 255, 0.15);
        border-radius: 8px;
    }
    .landing-container[data-theme="light"] .plugin-add-section {
        border-color: rgba(61, 37, 22, 0.2);
    }
    .plugin-add-section h3 {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
    }
    .plugin-add-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
    }

    /* Language Selector Flag Dropdown */
    .lang-selector-container {
        position: relative;
        display: inline-block;
    }
    .lang-btn {
        font-size: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 10px;
    }
    .lang-dropdown {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(12px);
        border-radius: 8px;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
        padding: 6px;
        z-index: 1001;
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 120px;
    }
    .landing-container[data-theme="light"] .lang-dropdown {
        background: rgba(255, 255, 255, 0.95);
        border-color: rgba(0, 0, 0, 0.1);
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
    }
    .lang-option {
        display: flex;
        align-items: center;
        gap: 10px;
        background: transparent;
        border: none;
        color: #f1f5f9;
        padding: 8px 12px;
        border-radius: 6px;
        font-family: inherit;
        font-size: 13px;
        cursor: pointer;
        text-align: left;
        width: 100%;
        transition: background 0.15s;
    }
    .landing-container[data-theme="light"] .lang-option {
        color: #1e293b;
    }
    .lang-option:hover {
        background: rgba(255, 255, 255, 0.08);
    }
    .landing-container[data-theme="light"] .lang-option:hover {
        background: rgba(0, 0, 0, 0.05);
    }
    .lang-option.active {
        background: rgba(139, 92, 246, 0.15);
        color: #a78bfa;
        font-weight: 600;
    }
    .landing-container[data-theme="light"] .lang-option.active {
        background: rgba(139, 92, 246, 0.1);
        color: #7c3aed;
    }
    .flag-icon {
        font-size: 16px;
    }

    /* Header Logo Styles */
    .header-logo-container {
        position: absolute;
        top: 20px;
        left: 20px;
        display: flex;
        align-items: center;
        gap: 10px;
        z-index: 1000;
    }
    .header-logo-img {
        height: 32px;
        width: 32px;
        border-radius: 50%;
        object-fit: cover;
    }
    .header-logo-text-group {
        display: flex;
        flex-direction: column;
        justify-content: center;
    }
    .header-company-name {
        font-family: 'Outfit', sans-serif;
        font-size: 16px;
        font-weight: 700;
        color: var(--text-color);
        line-height: 1.1;
    }
    .header-sub-slogan {
        font-family: inherit;
        font-size: 10px;
        color: var(--text-color);
        opacity: 0.6;
        font-weight: 400;
    }

    /* App Footer Styles */
    .app-footer {
        width: 100%;
        padding: 12px 0;
        margin-top: 20px;
        border-top: 1px solid var(--card-border);
        background: rgba(15, 23, 42, 0.15);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10;
    }
    .landing-container[data-theme="light"] .app-footer {
        background: rgba(0, 0, 0, 0.02);
    }
    .footer-content {
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        align-items: center;
        justify-content: center;
        gap: 8px;
        color: var(--text-color);
        font-size: 12px;
        font-style: italic;
        opacity: 0.75;
        text-align: center;
    }
    .footer-separator {
        opacity: 0.5;
    }
    .footer-link {
        color: #8b5cf6;
        text-decoration: none;
        font-weight: 600;
        display: inline-flex;
        align-items: center;
        transition: color 0.2s;
    }
    .github-icon {
        width: 14px;
        height: 14px;
        margin-right: 4px;
        vertical-align: middle;
    }
    .landing-container[data-theme="light"] .footer-link {
        color: #7c3aed;
    }
    .footer-link:hover {
        text-decoration: underline;
    }
    .footer-button {
        background: transparent;
        border: none;
        padding: 0;
        cursor: pointer;
        font-family: inherit;
        font-size: inherit;
    }
    .free-call-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.75);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2000;
        backdrop-filter: blur(4px);
    }
    .free-call-dialog {
        position: relative;
        background: #0f1517;
        width: 100%;
        max-width: 400px;
        height: 100%;
        max-height: 850px;
        border-radius: 24px;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.15);
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
        display: flex;
        flex-direction: column;
        animation: dialShow 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    @keyframes dialShow {
        from {
            transform: scale(0.9) translateY(20px);
            opacity: 0;
        }
        to {
            transform: scale(1) translateY(0);
            opacity: 1;
        }
    }
    @media (max-width: 480px), (max-height: 850px) {
        .free-call-dialog {
            width: 100vw;
            height: 100vh;
            max-width: 100%;
            max-height: 100%;
            border-radius: 0;
            border: none;
        }
    }
    .free-call-close-btn {
        position: absolute;
        top: 16px;
        right: 16px;
        background: rgba(0, 0, 0, 0.5);
        border: none;
        color: #fff;
        font-size: 18px;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2010;
        transition: background-color 0.2s;
    }
    .free-call-close-btn:hover {
        background: rgba(255, 255, 255, 0.2);
    }
    .free-call-iframe-container {
        flex: 1;
        width: 100%;
        height: 100%;
    }
    .free-call-iframe {
        width: 100%;
        height: 100%;
        border: none;
        background: #0f1517;
    }

    /* 左右分割ビュー（実験用）のスタイル */
    .split-view-container {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: #0b0c10;
        display: flex;
        flex-direction: column;
        z-index: 3000;
    }
    .split-view-header {
        height: 48px;
        display: flex;
        width: 100%;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        background-color: #12131c;
        box-sizing: border-box;
    }
    :global([data-theme="light"]) .split-view-header {
        background-color: #ebdcd0;
        border-bottom: 1px solid rgba(61, 37, 22, 0.1);
    }
    .header-left-pane {
        width: 390px;
        flex: 0 0 390px;
        border-right: 1px solid rgba(255, 255, 255, 0.08);
        display: flex;
        align-items: center;
        padding: 0 16px;
        box-sizing: border-box;
    }
    :global([data-theme="light"]) .header-left-pane {
        border-right: 1px solid rgba(61, 37, 22, 0.1);
    }
    .header-right-pane {
        flex: 1;
        box-sizing: border-box;
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
    :global([data-theme="light"]) .back-home-btn {
        background: rgba(61, 37, 22, 0.05);
        border: 1px solid rgba(61, 37, 22, 0.1);
        color: #3d2516;
    }
    :global([data-theme="light"]) .back-home-btn:hover {
        background: rgba(61, 37, 22, 0.12);
    }
    .split-view-panes {
        flex: 1;
        display: flex;
        width: 100%;
        height: calc(100% - 48px);
    }
    .split-pane {
        flex: 1;
        height: 100%;
        position: relative;
    }
    .left-pane {
        flex: 0 0 390px;
        width: 390px;
        border-right: 1px solid rgba(255, 255, 255, 0.08);
        background-color: #4a4e4c; /* ダークモード時も枠線が見えやすいグレーに統一 */
        padding: 20px;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    :global([data-theme="light"]) .left-pane {
        background-color: #ebdcd0;
        border-right: 1px solid rgba(61, 37, 22, 0.1);
    }
    .left-pane .split-iframe {
        width: 100%;
        height: 100%;
        border: none;
        background: transparent; /* 透過させて親のグレーを見せる */
    }
    .right-pane {
        background-color: #12131c;
    }
    :global([data-theme="light"]) .right-pane {
        background-color: #ebdcd0;
    }
    .right-pane .split-iframe {
        width: 100%;
        height: 100%;
        border: none;
    }
    .toggle-and-split-wrapper {
        display: inline-flex;
        align-items: center;
        gap: 0;
        z-index: 10;
    }
    .split-view-trigger-btn {
        background: transparent;
        border: none;
        font-size: 18px;
        cursor: pointer;
        padding: 4px 8px;
        margin-left: 0;
        transition: transform 0.2s ease-in-out;
        display: inline-flex;
        align-items: center;
        justify-content: center;
    }
    .split-view-trigger-btn:hover {
        transform: scale(1.2);
    }

    /* 逆版の本の非表示起動レイアウトスタイル */
    .left-pane.full-width {
        width: 100% !important;
        flex: 1 !important;
        border-right: none !important;
        padding: 0 !important;
        display: flex;
        justify-content: center; /* 画面横は中央寄せ */
        align-items: flex-start; /* 縦は上寄せ */
        background-color: #4a4e4c !important; /* PapeRobo本来の背景グレーに統一 */
    }
    .left-pane.full-width .split-iframe {
        width: 390px !important; /* 横幅はスマホサイズに制限 */
        max-width: 100%;
        height: 100%;
        border: none;
        background: transparent !important; /* iframe自体も完全に透過 */
    }
    .header-right-pane {
        flex: 1;
        box-sizing: border-box;
        display: flex;
        justify-content: flex-end;
        align-items: center;
        padding: 0 16px;
    }
    .publish-btn {
        background: #0070f3;
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #ffffff;
        padding: 4px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        font-weight: bold;
        transition: all 0.2s;
        font-family: system-ui, sans-serif;
    }
    .publish-btn:hover {
        background: #0060d3;
        transform: scale(1.02);
    }
    :global([data-theme="light"]) .publish-btn {
        background: #0070f3;
        border: 1px solid rgba(61, 37, 22, 0.1);
        color: #ffffff;
    }
    .right-pane-card-wrapper {
        width: 100%;
        height: 100%;
        overflow-y: auto;
        box-sizing: border-box;
    }
</style>
