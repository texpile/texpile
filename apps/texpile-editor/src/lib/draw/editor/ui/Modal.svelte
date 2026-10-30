<script lang="ts">
	import { X } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import { takeFocus } from './dialogFocus';

	type Props = { open: boolean; title: string; onclose: () => void; children: Snippet };
	const props: Props = $props();

	function onkeydown(e: KeyboardEvent) {
		if (e.key !== 'Escape') return;
		// used up here: nothing behind the dialog acts on it too
		e.preventDefault();
		props.onclose();
	}
</script>

<svelte:window onkeydown={props.open ? onkeydown : undefined} />

{#if props.open}
	<div
		class="fixed inset-0 z-1300 flex items-center justify-center bg-black/40 p-4"
		role="presentation"
		onmousedown={(e) => e.target === e.currentTarget && props.onclose()}
	>
		<div
			class="card bg-surface-50-950 border-surface-300-700 max-h-full w-full max-w-md overflow-y-auto border p-5 shadow-2xl"
			role="dialog"
			aria-modal="true"
			aria-label={props.title}
			tabindex="-1"
			use:takeFocus
		>
			<div class="mb-3 flex items-center justify-between gap-4">
				<h2 class="text-base font-semibold"><span class="cap-center">{props.title}</span></h2>
				<button class="btn-icon btn-icon-xs hover:preset-tonal" onclick={props.onclose} aria-label="Close">
					<X class="size-4" />
				</button>
			</div>
			{@render props.children()}
		</div>
	</div>
{/if}
