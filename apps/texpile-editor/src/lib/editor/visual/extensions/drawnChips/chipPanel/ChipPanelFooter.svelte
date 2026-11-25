<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import type { ChipPanelFooter } from './chipPanel.svelte';

	type Props = { footer: ChipPanelFooter; close: () => void };

	const props: Props = $props();

	function act(): void {
		// read before: closing empties the props
		const run = props.footer.run;
		props.close();
		run();
	}
</script>

<div class="flex items-center justify-between gap-3">
	<span class="text-muted min-w-0 truncate font-mono text-xs" use:tip={props.footer.note}>{props.footer.note}</span>
	<button type="button" class="anchor shrink-0 text-xs" onclick={act}>{props.footer.action}</button>
</div>
