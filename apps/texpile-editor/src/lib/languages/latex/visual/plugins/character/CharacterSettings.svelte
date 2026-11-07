<script lang="ts">
	import { Panel, type ChipSettingsProps } from '$lib/languages/latex/visual/core';
	import { readCharacter } from './characterCommand';
	import { m } from '$lib/paraglide/messages';

	const props: ChipSettingsProps = $props();

	const character = $derived(readCharacter(props.source));
	const title = $derived(
		character?.accent
			? m.drawn_chip_character_accent()
			: character && /TeX/.test(character.name)
				? m.drawn_chip_character_logo()
				: m.drawn_chip_character_symbol()
	);
</script>

{#if character}
	<div class="flex flex-col gap-2">
		<Panel.Header {title} command={props.source.trim()} />
		<span class="text-2xl leading-none">{character.printed}</span>
		{#if character.direct}
			{@const direct = character.direct}
			<Panel.Button
				onclick={() => {
					props.write(direct);
					props.close();
				}}
			>
				{m.drawn_chip_character_write({ character: direct })}
			</Panel.Button>
			<p class="text-muted text-xs">{m.drawn_chip_character_write_hint()}</p>
		{/if}
	</div>
{/if}
