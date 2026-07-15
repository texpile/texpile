<script lang="ts">
	import { onMount } from 'svelte';
	import Footer from '$lib/comp/Footer.svelte';
	import Navbar from '$lib/comp/Navbar.svelte';
	import { initAnalytics } from '$lib/plausible';
	import '../app.css';

	let { children } = $props();

	onMount(initAnalytics);
</script>

<!-- min-h-screen flex column so short pages (404) still pin the footer to the viewport bottom -->
<div class="flex min-h-screen flex-col">
	<Navbar />
	<main class="flex flex-1 flex-col">
		{@render children()}
	</main>
	<Footer />
</div>
