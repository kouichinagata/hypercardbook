<script lang="ts">
    import Book from '$lib/components/Book.svelte';
    import Card from '$lib/components/Card.svelte';

    let { data } = $props();

    let isCard = $derived(data.markdown.includes('play_mode: card') || !/Page\s+\d+:/i.test(data.markdown));
    let activePluginIds = $derived(data.session?.user?.user_metadata?.active_plugin_ids || ['reading-aloud', 'markdown-to-notion']);
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
    <Book markdown={data.markdown} backUrl={data.backUrl} activePluginIds={activePluginIds} />
{/if}


