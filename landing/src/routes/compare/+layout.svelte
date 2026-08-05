<script lang="ts">
	let { children } = $props();
</script>

<div class="container mx-auto max-w-4xl flex-1 px-4 py-8 sm:px-6 md:py-12 lg:px-8">
	{@render children()}
</div>
