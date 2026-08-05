<script lang="ts">
    import { onMount } from 'svelte';
    import Book from '$lib/components/Book.svelte';
    import { effectivePlanFromUser } from '$lib/plan';
    import Card from '$lib/components/Card.svelte';

    let { data } = $props();

    let liveMarkdown = $state(data.markdown || '');
    let liveBookId = $state(data.id);
    let liveOwnerUserId = $state(data.currentUserId);
    let liveLoading = $state(Boolean(data.isAiLiveBook));
    let liveError = $state('');
    let isCard = $derived(liveMarkdown.includes('play_mode: card') || (!liveMarkdown.includes('play_mode: book') && !/Page\s*\d+:/i.test(liveMarkdown) && !/(?:^|\n)\s*\*\*\*\s*(?:\n|$)/.test(liveMarkdown)));
    let activePluginIds = $derived(data.session?.user?.user_metadata?.active_plugin_ids || ['hypercard-hook']);
    let isProPlan = $derived(['pro', 'enterprise'].includes(effectivePlanFromUser(data.session?.user)));
    
    let currentLanguage = $state('ja');
    let currentIndex = $state(data.initialPageIndex ?? -1);

    onMount(() => {
        const savedLang = localStorage.getItem('reader-lang');
        if (savedLang) {
            currentLanguage = savedLang;
        } else if (data.session?.user?.user_metadata?.language) {
            currentLanguage = data.session.user.user_metadata.language;
        } else {
            const browserLang = navigator.language || 'en';
            currentLanguage = browserLang.startsWith('ja') ? 'ja' :
                              browserLang.startsWith('fr') ? 'fr' :
                              browserLang.startsWith('es') ? 'es' :
                              browserLang.startsWith('zh') ? 'zh' : 'en';
        }

        if (data.isAiLiveBook) {
            void regenerateAiLiveBook();
        }
    });

    async function regenerateAiLiveBook(attempt = 0): Promise<void> {
        try {
            const userGeminiApiKey = localStorage.getItem('user_gemini_api_key') || '';
            const response = await fetch('/api/ai-live-book/open', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(userGeminiApiKey ? { 'x-user-gemini-api-key': userGeminiApiKey } : {})
                },
                body: JSON.stringify({
                    sourceBookId: data.sourceBookId,
                    openToken: data.liveOpenToken
                })
            });
            const result = await response.json();
            if (response.status === 409 && result.retryable && attempt < 30) {
                window.setTimeout(() => { void regenerateAiLiveBook(attempt + 1); }, 2000);
                return;
            }
            if (!response.ok) throw new Error(result.error || 'AI Live Book generation failed.');
            liveMarkdown = result.markdown;
            liveBookId = result.bookId;
            liveOwnerUserId = result.ownerUserId;
            liveLoading = false;
        } catch (error: any) {
            liveError = error?.message || 'AI Live Book generation failed.';
            liveLoading = false;
        }
    }
</script>

{#if liveLoading}
    <div class="live-book-status" role="status">
        <div class="live-book-spinner"></div>
        <strong>Creating your AI Live Book…</strong>
        <span>The story and its prompt are changing for this reading.</span>
    </div>
{:else if liveError}
    <div class="live-book-status live-book-error" role="alert">
        <strong>AI Live Book could not be generated.</strong>
        <span>{liveError}</span>
    </div>
{:else if isCard}
    <Card 
        markdown={liveMarkdown}
        id={liveBookId}
        backUrl={data.backUrl} 
        isEmbed={data.isEmbed} 
        activePluginIds={activePluginIds}
    />
{:else}
    {#key liveBookId}
        <Book markdown={liveMarkdown} id={liveBookId} backUrl={data.isEmbed ? '' : data.backUrl} activePluginIds={activePluginIds} language={currentLanguage} currentUserId={liveOwnerUserId} bind:currentIndex isProPlan={isProPlan} />
    {/key}
{/if}

<style>
    .live-book-status {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 24px;
        color: #f5ebe0;
        background: #0b0c10;
        text-align: center;
    }
    .live-book-status span { opacity: 0.7; }
    .live-book-spinner {
        width: 34px;
        height: 34px;
        border: 3px solid rgba(255, 255, 255, 0.2);
        border-top-color: #f5ebe0;
        border-radius: 50%;
        animation: live-spin 0.8s linear infinite;
    }
    .live-book-error strong { color: #fca5a5; }
    @keyframes live-spin { to { transform: rotate(360deg); } }
</style>
