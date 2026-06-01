<script lang="ts">
    import Book from '$lib/components/Book.svelte';
    import Card from '$lib/components/Card.svelte';

    let { data } = $props();

    let isCard = $derived(data.markdown.includes('play_mode: card') || !/Page\s+\d+:/i.test(data.markdown));
</script>

{#if isCard}
    <Card 
        markdown={data.markdown} 
        id={data.id} 
        backUrl={data.backUrl} 
        isEmbed={data.isEmbed} 
    />
{:else}
    <Book markdown={data.markdown} backUrl={data.backUrl} />
{/if}


