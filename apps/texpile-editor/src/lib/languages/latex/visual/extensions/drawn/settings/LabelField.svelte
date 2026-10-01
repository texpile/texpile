<script lang="ts">
	import type { EditorView } from 'prosemirror-view';
	import { ArrowRight } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import * as Panel from '$lib/editor/visual/extensions/drawnChips/panel';
	import { projectIntelStore } from '$lib/stores/projectIntel';
	import { knownLabels } from './knownLabels';
	import { m } from '$lib/paraglide/messages';

	type Props = { value: string; view: EditorView; oninput: (value: string) => void; onjump: () => void };

	const props: Props = $props();

	const suggestions = $derived(knownLabels(props.view.state.doc, projectIntelStore.current));
</script>

<Panel.Row label={m.drawn_chip_ref_label()}>
	<div class="flex gap-1.5">
		<Panel.TextField value={props.value} label={m.drawn_chip_ref_label()} mono autofocus {suggestions} oninput={props.oninput} />
		<button
			type="button"
			class="border-surface-300-700 rounded-base hover:preset-tonal text-surface-700-300 flex size-7 shrink-0 items-center justify-center border"
			use:tip={m.drawn_chip_ref_go_to()}
			onclick={props.onjump}
		>
			<ArrowRight class="size-3.5" />
		</button>
	</div>
</Panel.Row>
