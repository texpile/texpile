<script lang="ts">
	// Prerenders to build/404.html, which Cloudflare Pages serves (with a 404 status) for
	// unknown paths. Without it Pages falls back to SPA mode: index.html with a 200.
	import NotFound from '$lib/comp/NotFound.svelte';
</script>

<NotFound />
