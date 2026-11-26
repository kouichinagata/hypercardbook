<script lang="ts">
    import { isCardMarkdown } from '$lib/play-mode';
    import { onMount } from 'svelte';
    import Book from '$lib/components/Book.svelte';
    import { effectivePlanFromUser } from '$lib/plan';
    import { DEFAULT_ACTIVE_PLUGIN_IDS } from '$lib/plugins';
    import Card from '$lib/components/Card.svelte';
    import { page } from '$app/state';
    import SignNavigator from '$lib/signature/SignNavigator.svelte';
    import { hasFields } from '$lib/signature/fields';
    import { changeableSignKinds, hasSignMarkers } from '$lib/signature/markers';

    let { data } = $props();

    let isCard = $derived(isCardMarkdown(data.markdown) || (!data.markdown.includes('play_mode: book') && !/Page\s*\d+:/i.test(data.markdown) && !/(?:^|\n)\s*\*\*\*\s*(?:\n|$)/.test(data.markdown)));
    let activePluginIds = $derived(data.session?.user?.user_metadata?.active_plugin_ids || DEFAULT_ACTIVE_PLUGIN_IDS);
    let isProPlan = $derived(['pro', 'enterprise'].includes(effectivePlanFromUser(data.session?.user)));
    
    // Signing and fields work as on the card page: anyone with the link signs your / MarkdownAIverify slots; `my` is the owner's (logged in)
    let markdown = $state(data.markdown);
    $effect(() => { markdown = data.markdown; });
    let version = $state<number | null>(null);
    let isOwner = $state(false);
    const signUrl = `/hypercard/${encodeURIComponent(data.id)}/sign`;

    onMount(async () => {
        if (!hasSignMarkers(markdown) && !changeableSignKinds(markdown).length && !hasFields(markdown)) return;
        try {
            const res = await fetch(signUrl);
            if (!res.ok) return;
            const info = await res.json();
            version = info.version;
            isOwner = info.isOwner;
        } catch {}
    });

    const signer = {
        canSign: (kind: string) => version !== null && (kind !== 'my' || isOwner),
        sign: async (slot: number, kind: string, result: { svg: string }) => {
            const res = await fetch(signUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(data.shareTicket ? { 'x-paperobo-share': data.shareTicket } : {}) },
                body: JSON.stringify({ slot, kind, baseVersion: version, ...result })
            });
            const out = await res.json();
            if (!res.ok) throw new Error(out.error || 'sign failed');
            version = out.version;
            return out.markdown as string;
        },
        canFill: () => true,
        // Changeable fields are saved on the server each time they change (this page has no editor to keep them)
        fillChangeable: (index: number, value: string | boolean) => fillField(index, value),
        fill: (index: number, value: string | boolean) => fillField(index, value)
    };

    async function fillField(index: number, value: string | boolean) {
        const res = await fetch(signUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(data.shareTicket ? { 'x-paperobo-share': data.shareTicket } : {}) },
            body: JSON.stringify({ field: true, index, value })
        });
        const out = await res.json();
        if (!res.ok) throw new Error(out.error || 'save failed');
        version = out.version;
        return out.markdown as string;
    }

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
    });
</script>

{#if isCard}
    <Card 
        markdown={data.markdown} 
        id={data.id} 
        backUrl={data.backUrl} 
        isEmbed={data.isEmbed} 
        activePluginIds={activePluginIds}
    />
{:else}
    <Book {markdown} id={data.id} backUrl={data.isEmbed ? '' : data.backUrl} activePluginIds={activePluginIds} language={currentLanguage} currentUserId={data.currentUserId} bind:currentIndex isProPlan={isProPlan} onMarkdownChange={(next: string) => (markdown = next)} {signer} />
{/if}

{#if !isCard && page.url.searchParams.get('sign') === '1'}
    <SignNavigator />
{/if}
