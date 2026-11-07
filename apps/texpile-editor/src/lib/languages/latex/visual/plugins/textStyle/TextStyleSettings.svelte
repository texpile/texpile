<script lang="ts">
	import { balancedBraces, Panel, type ChipSettingsProps } from '$lib/languages/latex/visual/core';
	import { ordinaryCommand, readTextStyle, writeOrdinary, writeTextStyle, type TextStyleKind } from './textStyleCommand';
	import { m } from '$lib/paraglide/messages';

	const TITLES: Record<TextStyleKind, () => string> = {
		bold: m.drawn_chip_style_bold,
		italic: m.drawn_chip_style_italic,
		emphasis: m.drawn_chip_style_emphasis,
		slanted: m.drawn_chip_style_slanted,
		typewriter: m.drawn_chip_style_typewriter,
		smallCaps: m.drawn_chip_style_small_caps,
		sansSerif: m.drawn_chip_style_sans_serif,
		plain: m.drawn_chip_style_plain,
		size: m.drawn_chip_style_size,
		underline: m.drawn_chip_style_underline,
		together: m.drawn_chip_style_together,
		framed: m.drawn_chip_style_framed,
		superscript: m.drawn_chip_style_superscript,
		subscript: m.drawn_chip_style_subscript
	};

	const props: ChipSettingsProps = $props();

	const style = $derived(readTextStyle(props.source));
	const ordinary = $derived(style ? ordinaryCommand(style) : null);
</script>

{#if style}
	<div class="flex flex-col gap-2">
		<Panel.Header title={TITLES[style.kind]()} command={style.group ? `{\\${style.name} …}` : `\\${style.name}{…}`} />
		<Panel.TextArea
			value={style.words}
			label={TITLES[style.kind]()}
			oninput={(words) => {
				if (balancedBraces(words)) props.write(writeTextStyle(props.source, style, words));
			}}
		/>
		{#if ordinary}
			<Panel.Button
				onclick={() => {
					props.write(writeOrdinary(props.source, style, ordinary));
					props.close();
				}}
			>
				{style.kind === 'bold' ? m.drawn_chip_style_make_bold() : m.drawn_chip_style_make_italic()}
			</Panel.Button>
		{/if}
	</div>
{/if}
