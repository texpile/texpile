<!-- Texpile's key cap, in the UI font: a mono face draws ⌘ ⌥ ⇧ squeezed or not at all -->
<script lang="ts">
	type Props = { keys: string };
	const props: Props = $props();
	// one glyph sits in a square cap, a word gets room either side
	const pad = $derived([...props.keys].length === 1 ? 'px-1' : 'px-1.5');
</script>

<kbd
	class="text-surface-700-300 border-surface-300-700 bg-surface-100-900 rounded-base inline-flex h-5 min-w-5 items-center justify-center border font-sans text-xs leading-none whitespace-nowrap shadow-[0_1px_0_var(--color-surface-300-700)] {pad}"
	>{props.keys}</kbd
>
