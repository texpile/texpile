<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import { inEditorPane } from '$lib/editor/visual/editorPanePositioning';
	import type { GearPlace } from '$lib/editor/visual/extensions/blockHandle/blockSettings';
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import { Settings, AlertCircle } from '@lucide/svelte';
	import type { Node } from 'prosemirror-model';
	import TableSettingsPanel from './TableSettingsPanel.svelte';
	import type { TableLines } from './rules/tableRules';
	import { isReadOnly } from '$lib/stores/permissionStore';
	import { templateFeaturesStore } from '$lib/stores/editorStore';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		/** typst hides every LaTeX-only control; see tableWrapperView's TableDialect */
		dialect?: 'latex' | 'typst';
		node: Node;
		updateAttrs: (attrs: Partial<typeof node.attrs>) => void;
		checkDuplicate: (label: string) => boolean;
		// per-row latex rules (\hline etc.): one string before each row + one after the last row
		rowRules: string[];
		bottomRule: string;
		setRowRule: (rowIndex: number, rule: string) => void;
		setBottomRule: (rule: string) => void;
		// column spec (e.g. "|l|c|p{3cm}|") + the env (X is offered only for tabularx)
		colspec: string;
		tableEnv: string;
		setColspec: (spec: string) => void;
		setAlign: (align: string | null) => void;
		lines: TableLines | null;
		setLines: (lines: TableLines) => void;
		dropCaption: () => void;
	};

	let {
		dialect = 'latex',
		node,
		updateAttrs,
		checkDuplicate,
		rowRules,
		bottomRule,
		setRowRule,
		setBottomRule,
		colspec,
		tableEnv,
		setColspec,
		setAlign,
		lines,
		setLines,
		dropCaption
	}: Props = $props();

	const tableCaptionEnabled = $derived(templateFeaturesStore.current?.tableCaption ?? true);

	let settingsOpen = $state(false);
	let place = $state.raw<GearPlace | null>(null);
	const positioning = $derived(
		inEditorPane({ placement: 'bottom-end', offset: { mainAxis: 4 }, ...(place ? { getAnchorRect: place } : {}) })
	);

	/** `at`: the block handle's gear, when that is what opened them */
	export function open(at: GearPlace | null = null): void {
		place = at;
		settingsOpen = true;
	}
</script>

<div class="table-chrome">
	{#if !tableCaptionEnabled}
		<div class="table-caption-warning">
			<AlertCircle class="h-4 w-4" />
			<span>{m.tablewrap_caption_unsupported_warning()}</span>
		</div>
	{/if}
	<div class="table-tools">
		<Popover open={settingsOpen} onOpenChange={(e) => (settingsOpen = e.open)} {positioning}>
			<Popover.Trigger class="table-settings-btn">
				<button
					aria-label={m.tablewrap_settings_button()}
					use:tip={m.tablewrap_settings_button()}
					type="button"
					disabled={isReadOnly.current}
				>
					<Settings class="h-4 w-4" />
				</button>
			</Popover.Trigger>

			<Portal>
				<Popover.Positioner class="z-floating-ui">
					<Popover.Content class="card bg-surface-50-950 border-surface-300-700 min-w-[250px] border shadow-lg">
						<TableSettingsPanel
							open={settingsOpen}
							{dialect}
							{node}
							{updateAttrs}
							{checkDuplicate}
							{rowRules}
							{bottomRule}
							{setRowRule}
							{setBottomRule}
							{colspec}
							{tableEnv}
							{setColspec}
							{setAlign}
							{lines}
							{setLines}
							dropCaption={() => {
								settingsOpen = false;
								dropCaption();
							}}
						/>
					</Popover.Content>
				</Popover.Positioner>
			</Portal>
		</Popover>
	</div>
</div>

<style>
	/* directly in an editor with a block handle, the handle's gear opens these */
	:global(.ProseMirror[data-block-handle] > .table-wrapper .table-settings-btn) {
		display: none;
	}

	/* flex: the editor keeps white space, and a space between the parts would stand as a line of its own */
	.table-chrome {
		display: flex;
		flex-direction: column;
	}

	/* over the caption line's right end: the missing-caption mark, and the gear of a table inside another block */
	.table-tools {
		position: absolute;
		top: 0;
		right: 0;
		z-index: 1;
		display: flex;
		align-items: center;
		gap: calc(var(--spacing) * 1);
	}

	.table-caption-warning {
		display: flex;
		align-items: center;
		gap: calc(var(--spacing) * 2);
		padding: calc(var(--spacing) * 2) calc(var(--spacing) * 3);
		margin-bottom: calc(var(--spacing) * 3);
		background: var(--color-warning-100);
		border: var(--default-border-width) solid var(--color-warning-400);
		border-radius: calc(var(--radius-base) * 1.5);
		color: var(--warning-ink);
		font-size: 0.75rem;
		line-height: 1.4;
	}

	.table-caption-warning :global(svg) {
		flex-shrink: 0;
	}

	:global(.table-settings-btn) button {
		padding: calc(var(--spacing) * 1) calc(var(--spacing) * 2);
		border-radius: var(--radius-base);
		cursor: pointer;
		transition: background-color 0.15s;
		border: none;
		background: transparent;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	:global(.table-settings-btn) button:hover {
		background: var(--color-surface-200);
	}

	/* the surfaces above are hardcoded light, flip them under data-mode=dark */
	:global([data-mode='dark'] .table-settings-btn button:hover) {
		background: var(--color-surface-700);
	}
	:global([data-mode='dark']) .table-caption-warning {
		background: var(--color-warning-950);
		border-color: var(--color-warning-700);
		color: var(--warning-ink);
	}
</style>
