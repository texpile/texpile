<script lang="ts">
	import { type ChipSettingsProps, Panel, readLorem, writeLorem } from '$lib/languages/typst/visual/core';
	import { m } from '$lib/paraglide/messages';

	const SUGGESTIONS = ['20', '50', '100', '200'];

	const props: ChipSettingsProps = $props();

	const lorem = $derived(readLorem(props.source));
</script>

{#if lorem}
	<div class="flex flex-col gap-2">
		<Panel.Header title={m.drawn_chip_typst_lorem_title()} command="#lorem" />
		<Panel.Row label={m.drawn_chip_typst_lorem_words()}>
			<Panel.TextField
				value={String(lorem.words)}
				label={m.drawn_chip_typst_lorem_words()}
				mono
				autofocus
				suggestions={SUGGESTIONS}
				oninput={(text) => props.write(writeLorem(props.source, text))}
			/>
		</Panel.Row>
	</div>
{/if}
