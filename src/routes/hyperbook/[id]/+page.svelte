<script lang="ts">
    import { onMount } from 'svelte';
    import Book from '$lib/components/Book.svelte';
    import Card from '$lib/components/Card.svelte';

    let { data } = $props();

    let isCard = $derived(data.markdown.includes('play_mode: card') || (!data.markdown.includes('play_mode: book') && !/Page\s*\d+:/i.test(data.markdown) && !/(?:^|\n)\s*\*\*\*\s*(?:\n|$)/.test(data.markdown)));
    let activePluginIds = $derived(data.session?.user?.user_metadata?.active_plugin_ids || ['hypercard-hook']);
    
    let currentLanguage = $state('ja');

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
    <Book markdown={data.markdown} id={data.id} backUrl={data.isEmbed ? '' : data.backUrl} activePluginIds={activePluginIds} language={currentLanguage} currentUserId={data.currentUserId} />
{/if}


