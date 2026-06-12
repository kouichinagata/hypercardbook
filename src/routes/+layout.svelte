<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { createBrowserClient } from '@supabase/ssr';
	import { env } from '$env/dynamic/public';
	import '../app.css';

	let { data, children } = $props();

	// Initialize Supabase browser client
	const supabase = createBrowserClient(
		env.PUBLIC_SUPABASE_URL || '',
		env.PUBLIC_SUPABASE_ANON_KEY || ''
	);

	onMount(() => {
		const { data: { subscription } } = supabase.auth.onAuthStateChange((event, _session) => {
			if (_session?.expires_at !== data.session?.expires_at) {
				invalidate('supabase:auth');
			}
		});

		return () => subscription.unsubscribe();
	});
</script>

<svelte:head>
	<link rel="icon" href="/favicon.png" />
	<title>HyperCardBook</title>
</svelte:head>

{@render children()}

