<script lang="ts">
    import Card from '$lib/components/Card.svelte';
    import { DEFAULT_ACTIVE_PLUGIN_IDS } from '$lib/plugins';

    let { data } = $props();
    let activePluginIds = $derived(data.session?.user?.user_metadata?.active_plugin_ids || DEFAULT_ACTIVE_PLUGIN_IDS);
</script>

<Card 
    markdown={data.markdown} 
    id={data.id} 
    backUrl={data.backUrl} 
    isEmbed={data.isEmbed} 
    showNewTab={!data.isEmbed}
    activePluginIds={activePluginIds}
    currentUserId={data.currentUserId}
/>
