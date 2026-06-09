<script lang="ts">
    import Card from '$lib/components/Card.svelte';

    let { data } = $props();
    let activePluginIds = $derived(data.session?.user?.user_metadata?.active_plugin_ids || ['reading-aloud', 'markdown-to-notion']);
</script>

<Card 
    markdown={data.markdown} 
    id={data.id} 
    backUrl={data.backUrl} 
    isEmbed={data.isEmbed} 
    showNewTab={!data.isEmbed}
    activePluginIds={activePluginIds}
/>
