<script lang="ts">
	import * as Panel from '$lib/editor/visual/extensions/drawnChips/panel';
	import { m } from '$lib/paraglide/messages';
	import type { TableLines } from './tableRules';

	type Props = {
		/** null: the table's lines are a pattern of its own, and no choice is lit */
		lines: TableLines | null;
		setLines: (lines: TableLines) => void;
	};

	const props: Props = $props();

	const options = [
		{ value: 'formal', label: m.tablewrap_lines_formal(), hint: m.tablewrap_lines_formal_hint() },
		{ value: 'all', label: m.tablewrap_lines_all() },
		{ value: 'none', label: m.tablewrap_lines_none() }
	];
</script>

<div class="mb-3">
	<div class="text-muted mb-1.5 text-xs font-semibold">{m.tablewrap_lines()}</div>
	<Panel.Segments {options} selected={props.lines} label={m.tablewrap_lines()} onpick={(value) => props.setLines(value as TableLines)} />
</div>
