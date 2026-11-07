<script lang="ts">
	import { Search } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages';

	type Props = { value: string; onInput: (value: string) => void; onEnter: () => void; onMove: (step: 1 | -1) => void };
	const props: Props = $props();

	function focusOnMount(node: HTMLInputElement) {
		requestAnimationFrame(() => node.focus());
	}
</script>

<label class="border-surface-200-800 flex items-center gap-2 border-b px-2 py-1.5">
	<Search class="text-muted size-4 shrink-0" />
	<input
		class="w-full bg-transparent text-sm outline-none"
		type="search"
		value={props.value}
		placeholder={m.insert_search_placeholder()}
		aria-label={m.insert_search_placeholder()}
		spellcheck="false"
		use:focusOnMount
		oninput={(e) => props.onInput(e.currentTarget.value)}
		onkeydown={(e) => {
			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				e.preventDefault();
				props.onMove(e.key === 'ArrowDown' ? 1 : -1);
			} else if (e.key === 'Enter') {
				e.preventDefault();
				props.onEnter();
			}
		}}
	/>
</label>
