<script lang="ts">
	import type { ChipSettingsProps } from '../chipPanel/chipPanel.svelte';
	import { readComment, writeComment } from './commentLines';
	import * as Panel from '../panel';
	import { m } from '$lib/paraglide/messages';

	const props: ChipSettingsProps = $props();

	const comment = $derived(readComment(props.source));
</script>

{#if comment}
	<div class="flex flex-col gap-2">
		<Panel.Header title={m.drawn_chip_comment_title()} command={comment.marker} />
		<Panel.TextArea
			value={comment.text}
			label={m.drawn_chip_comment_title()}
			oninput={(text) => props.write(writeComment(props.source, comment, text))}
		/>
		<p class="text-muted text-xs">{m.drawn_chip_comment_hint()}</p>
	</div>
{/if}
