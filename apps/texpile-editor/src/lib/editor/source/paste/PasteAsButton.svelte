<script lang="ts">
	import { ChevronDown, ClipboardPaste } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { m } from '$lib/paraglide/messages';

	type Props = { onOpen: (at: { x: number; y: number }) => void };
	const props: Props = $props();

	function open(e: MouseEvent): void {
		// mousedown, not click: the editor keeps its focus and the caret stays inside the paste
		e.preventDefault();
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		props.onOpen({ x: rect.left, y: rect.bottom + 2 });
	}
</script>

<button
	type="button"
	class="flex items-center rounded-base p-0.5 text-surface-700-300 hover:preset-tonal"
	aria-label={m.paste_as_command()}
	aria-haspopup="menu"
	use:tip={m.paste_as_command()}
	onmousedown={open}
>
	<ClipboardPaste class="h-3.5 w-3.5" />
	<ChevronDown class="h-3 w-3" />
</button>
