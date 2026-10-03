<script lang="ts">
	import { symbolPicker as picker } from '../symbolPicker.svelte';
	import SymbolGlyph from './SymbolGlyph.svelte';
	import { m } from '$lib/paraglide/messages';

	const symbol = $derived(picker.activeSymbol);
	const lines = $derived(symbol && picker.set ? picker.set.detail(symbol) : null);
</script>

<div class="border-surface-200-800 flex min-h-16 items-center gap-3 border-t px-3 py-2">
	{#if symbol && picker.set && lines}
		<!-- as wide as the glyph needs: a long arrow is wider than it is tall -->
		<div class="flex h-12 min-w-12 shrink-0 items-center justify-center text-4xl">
			<SymbolGlyph glyph={picker.set.glyph(symbol)} size={40} />
		</div>
		<div class="min-w-0 flex-1">
			<div class="truncate font-mono text-sm">{lines.name}</div>
			{#if lines.description}<div class="text-muted truncate text-xs">{lines.description}</div>{/if}
			{#if lines.note}
				<div class="text-muted text-xs">{lines.note.label} <code class="font-mono">{lines.note.code}</code></div>
			{/if}
		</div>
		<div class="text-muted flex shrink-0 items-center gap-1.5 text-xs">
			{m.symbols_inserts()}
			<code class="bg-surface-200-800 rounded-base max-w-48 truncate px-1.5 py-0.5 font-mono text-sm whitespace-pre"
				>{picker.insertionText(symbol)}</code
			>
		</div>
	{/if}
</div>
