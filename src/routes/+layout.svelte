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
		// URLのハッシュからトークンを取得してセッションを同期
		if (typeof window !== 'undefined' && window.location.hash) {
			const hash = window.location.hash.substring(1);
			const params = new URLSearchParams(hash);
			const accessToken = params.get('access_token');
			const refreshToken = params.get('refresh_token');

			if (accessToken && refreshToken) {
				supabase.auth.setSession({
					access_token: accessToken,
					refresh_token: refreshToken
				}).then(({ error }) => {
					if (!error) {
						// 履歴からハッシュを取り除いてURLをクリーンにする
						const newUrl = window.location.pathname + window.location.search;
						window.history.replaceState(null, '', newUrl);
					} else {
						console.error('Failed to set session from hash:', error);
					}
				});
			}
		}

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

