<script lang="ts">
	import { Popover, Portal, Switch } from '@skeletonlabs/skeleton-svelte';
	import type { Node } from 'prosemirror-model';
	import { inEditorPane } from '$lib/editor/visual/editorPanePositioning';
	import type { GearPlace } from '$lib/editor/visual/extensions/blockHandle/blockSettings';
	import * as Panel from '$lib/editor/visual/extensions/drawnChips/panel';
	import { m } from '$lib/paraglide/messages';
	import LatexColumnsSetting from '../columns/LatexColumnsSetting.svelte';
	import TypstColumnsSetting from '../columns/TypstColumnsSetting.svelte';
	import TableLinesSetting from '../rules/TableLinesSetting.svelte';
	import type { TableLines } from '../rules/tableRules';
	import type { TableSide } from './bareTableSettingsPlugin.svelte';

	type Props = {
		place: GearPlace;
		dialect: 'latex' | 'typst';
		table: Node | null;
		colspec: string;
		tableEnv: string;
		setColspec: (spec: string) => void;
		setAlign: (align: string | null) => void;
		lines: TableLines | null;
		setLines: (lines: TableLines) => void;
		/** the table stands alone in a block that sets its side */
		held: boolean;
		side: TableSide | null;
		setSide: (side: TableSide) => void;
		makeFloat: () => void;
		onclose: () => void;
	};

	const props: Props = $props();

	const sides = [
		{ value: 'left', label: m.env_align_left() },
		{ value: 'center', label: m.env_align_center() },
		{ value: 'right', label: m.env_align_right() }
	];
</script>

<Popover
	open
	onOpenChange={(e) => {
		if (!e.open) props.onclose();
	}}
	positioning={inEditorPane({ placement: 'bottom-end', offset: { mainAxis: 4 }, getAnchorRect: props.place })}
>
	<Portal>
		<Popover.Positioner class="z-floating-ui">
			<Popover.Content class="bare-table-settings card bg-surface-50-950 border-surface-300-700 min-w-[250px] border p-3 shadow-lg">
				{#if props.held}
					<div class="mb-3 flex flex-col gap-2">
						<Panel.Header title={m.env_align_title()} />
						<Panel.Segments
							options={sides}
							selected={props.side}
							label={m.env_align_title()}
							onpick={(side) => props.setSide(side as TableSide)}
						/>
					</div>
				{/if}
				<TableLinesSetting lines={props.lines} setLines={props.setLines} />
				{#if props.dialect === 'typst'}
					<TypstColumnsSetting
						table={props.table}
						colspec={props.colspec}
						setColspec={props.setColspec}
						inherited={props.side ?? 'left'}
						setAlign={props.setAlign}
					/>
				{:else}
					<LatexColumnsSetting table={props.table} colspec={props.colspec} tableEnv={props.tableEnv} setColspec={props.setColspec} />
				{/if}
				<!-- off is what a table outside a float is; on makes it one, and its own settings take over -->
				<Switch checked={false} onCheckedChange={props.makeFloat} class="flex items-center justify-between gap-3">
					<Switch.Label>{m.tablewrap_caption_and_number()}</Switch.Label>
					<Switch.Control class="preset-filled-surface-200-800 data-[state=checked]:preset-filled-primary-500"
						><Switch.Thumb /></Switch.Control
					>
					<Switch.HiddenInput />
				</Switch>
			</Popover.Content>
		</Popover.Positioner>
	</Portal>
</Popover>
