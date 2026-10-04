<script lang="ts">
	import type { SymbolGlyph } from '../symbolPicker.types';

	let { glyph, size = 24 }: { glyph: SymbolGlyph; /** the height a picture is drawn at, in CSS pixels */ size?: number } = $props();

	// every picture of a set is scaled alike, its box to `size` tall, so a small symbol stays small; never
	// wider than a tile holds, and masked so it takes the text color
	const picture = $derived.by(() => {
		if (glyph.kind !== 'picture') return null;
		const scale = Math.min(size / glyph.boxHeight, (size * 1.6) / glyph.width, 1);
		return {
			width: glyph.width * scale,
			height: glyph.height * scale,
			mask: `url("${glyph.url}") -${glyph.x * scale}px -${glyph.y * scale}px / ${glyph.sheetWidth * scale}px ${glyph.sheetHeight * scale}px no-repeat`
		};
	});
</script>

{#if glyph.kind === 'label'}
	<span class="text-muted border-surface-400-600 rounded-base max-w-full truncate border border-dashed px-0.5 font-mono text-xs">
		{glyph.text}
	</span>
{:else if picture}
	<span
		class="block shrink-0 bg-current"
		style:width="{picture.width}px"
		style:height="{picture.height}px"
		style:mask={picture.mask}
		style:-webkit-mask={picture.mask}
		aria-hidden="true"
	></span>
{:else if glyph.kind === 'text'}
	<span class="glyph">{glyph.text}</span>
{/if}

<style>
	/* the math faces the platforms ship come first, so an arrow or a relation looks the way it will
	   typeset and near-identical ones stay apart; the system's symbol and emoji fonts fill in the rest */
	.glyph {
		font-family:
			'STIX Two Math', 'Cambria Math', 'Latin Modern Math', 'New Computer Modern Math', 'Noto Sans Math', 'Segoe UI Symbol',
			'Apple Symbols', serif;
		line-height: 1;
	}
</style>
