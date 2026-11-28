<script lang="ts">
	import { ArrowLeft, ArrowRight } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { isMac } from '$lib/platform';
</script>

<div class="app-no-drag pointer-events-auto flex items-center gap-0.5 self-center">
	<button class="title-bar-button" use:tip={isMac ? 'Go Back (Ctrl+-)' : 'Go Back (Alt+Left)'} aria-label="Go Back">
		<ArrowLeft class="size-3.5" />
	</button>
	<button class="title-bar-button" use:tip={isMac ? 'Go Forward (Ctrl+Shift+-)' : 'Go Forward (Alt+Right)'} aria-label="Go Forward">
		<ArrowRight class="size-3.5" />
	</button>
</div>
