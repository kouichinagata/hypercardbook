<script lang="ts">
    import Bookshelf from '$lib/components/Bookshelf.svelte';
    let { data } = $props();
</script>
<svelte:head><meta name="referrer" content="no-referrer" /></svelte:head>
<Bookshelf books={data.books} coverOnly={data.id} />
<style>:global(body) { margin: 0; background: transparent; overflow: hidden; }</style>
