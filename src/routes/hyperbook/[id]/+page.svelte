<script lang="ts">
    import Book from '$lib/components/Book.svelte';

    let { data } = $props();
</script>

<Book markdown={data.markdown} backUrl="/hyperbookshelf" />
