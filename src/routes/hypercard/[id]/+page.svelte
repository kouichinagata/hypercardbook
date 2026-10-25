<script lang="ts">
    import Card from '$lib/components/Card.svelte';
    import { DEFAULT_ACTIVE_PLUGIN_IDS } from '$lib/plugins';
    import { onMount } from 'svelte';
    import { page } from '$app/state';
    import SignNavigator from '$lib/signature/SignNavigator.svelte';

    let { data } = $props();
    let activePluginIds = $derived(data.session?.user?.user_metadata?.active_plugin_ids || DEFAULT_ACTIVE_PLUGIN_IDS);

    // Signing: anyone with the link signs your / MarkdownAIVerify slots; `my` is the owner's (logged in)
    let markdown = $state(data.markdown);
    $effect(() => { markdown = data.markdown; });
    let version = $state<number | null>(null);
    let isOwner = $state(false);
    let certificate = $state(false);
    const signUrl = `/hypercard/${encodeURIComponent(data.id)}/sign`;

    onMount(async () => {
        if (!/\{\{\s*(my|your\s*)?MarkdownAIVerify\s*\}\}/.test(markdown)) return;
        try {
            const res = await fetch(signUrl);
            if (!res.ok) return;
            const info = await res.json();
            version = info.version;
            isOwner = info.isOwner;
            certificate = info.certificate === true;
        } catch {}
    });

    const signer = {
        canSign: (kind: string) => !certificate && version !== null && (kind !== 'my' || isOwner),
        sign: async (slot: number, kind: string, result: { svg: string }) => {
            const res = await fetch(signUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slot, kind, baseVersion: version, ...result })
            });
            const out = await res.json();
            if (!res.ok) throw new Error(out.error || 'sign failed');
            version = out.version;
            return out.markdown as string;
        }
    };
</script>

<svelte:head>
    <!-- Loaded before the Card body so the MiniApp's own scripts can call paperobo.ask() -->
    {#if data.isMiniApp}<script src="/js/paperobo-ask.v1.js"></script>{/if}
</svelte:head>

{#if certificate}<p class="certificate-note">Sign or stamp this certificate in the chat where you received it.</p>{/if}

<Card 
    {markdown}
    id={data.id} 
    backUrl={data.backUrl} 
    isEmbed={data.isEmbed} 
    showNewTab={!data.isEmbed}
    activePluginIds={activePluginIds}
    currentUserId={data.currentUserId}
    onMarkdownChange={(next: string) => (markdown = next)}
    {signer}
/>

{#if page.url.searchParams.get('sign') === '1'}
    <SignNavigator />
{/if}
