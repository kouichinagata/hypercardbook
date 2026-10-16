import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	// Dev only: PapeRobo embeds Cards in a sandboxed iframe (opaque origin, sends "Origin: null"), whose module
	// requests Vite's default localhost-only CORS rejects. Production already sends access-control-allow-origin: *.
	server: { cors: { origin: ['null', /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/] } }
});
