<script lang="ts">
	import type { ChipSettingsProps } from '$lib/editor/visual/extensions/drawnChips/chipPanel.svelte';
	import * as Panel from '$lib/editor/visual/extensions/drawnChips/panel';
	import { m } from '$lib/paraglide/messages';
	import { readEnvironmentHead } from './environmentHeadSource';

	const props: ChipSettingsProps = $props();

	const name = $derived(readEnvironmentHead(props.source)?.name ?? null);
	const options = [
		{ value: 'flushleft', label: m.env_align_left() },
		{ value: 'center', label: m.env_align_center() },
		{ value: 'flushright', label: m.env_align_right() }
	];
</script>

<div class="flex flex-col gap-2">
	<Panel.Header title={m.env_align_title()} command={props.source} />
	<Panel.Segments {options} selected={name} label={m.env_align_title()} onpick={(next) => props.write(`\\begin{${next}}`)} />
</div>
