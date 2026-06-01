<script lang="ts">
    import Card from '$lib/components/Card.svelte';

    let { data } = $props();
</script>

<Card 
    markdown={data.markdown} 
    id={data.id} 
    backUrl={data.backUrl} 
    isEmbed={data.isEmbed} 
    showNewTab={!data.isEmbed}
/>
