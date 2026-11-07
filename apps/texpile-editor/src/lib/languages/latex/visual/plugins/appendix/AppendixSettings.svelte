<script lang="ts">
	import { Panel, type ChipSettingsProps } from '$lib/languages/latex/visual/core';
	import { m } from '$lib/paraglide/messages';

	const props: ChipSettingsProps = $props();
</script>

<div class="flex flex-col gap-2">
	<Panel.Header title={m.drawn_chip_appendix_title()} command={props.source.trim()} />
	<p class="text-muted text-xs leading-relaxed">{m.drawn_chip_appendix_hint()}</p>
</div>
