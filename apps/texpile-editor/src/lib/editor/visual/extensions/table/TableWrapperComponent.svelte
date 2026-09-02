<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import { Settings, AlertCircle } from '@lucide/svelte';
	import type { Node } from 'prosemirror-model';
	import TableSettingsPanel from './TableSettingsPanel.svelte';
	import { isReadOnly } from '$lib/stores/permissionStore';
	import { templateFeaturesStore } from '$lib/stores/editorStore';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		/** typst hides every LaTeX-only control; see tableWrapperView's TableDialect */
		dialect?: 'latex' | 'typst';
		tableNumber: number;
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
	};

	let {
		dialect = 'latex',
		tableNumber,
		node,
		updateAttrs,
		checkDuplicate,
		rowRules,
		bottomRule,
		setRowRule,
		setBottomRule,
		colspec,
		tableEnv,
		setColspec
	}: Props = $props();

	const tableCaptionEnabled = $derived(templateFeaturesStore.current?.tableCaption ?? true);

	let settingsOpen = $state(false);

	// display number is calculated (updates when the table moves); the label is only for \ref
	let tableDisplay = $derived(m.tablewrap_table_display({ number: tableNumber }));

	let hasPlaceholderCaption = $derived.by(() => {
		if (!node.content || node.content.childCount === 0) return false;
		const captionNode = node.content.child(0); // table_caption is first child
		if (!captionNode || captionNode.type.name !== 'table_caption') return false;

		// typst numbers a #figure with or without a caption (the serializer just omits the
		// argument), so an empty caption is legitimate there; LaTeX needs \caption to number
		if (captionNode.content.size === 0) return dialect === 'latex';

		const captionText = captionNode.textContent.trim();
		return (captionText === '' && dialect === 'latex') || captionText === 'Table caption';
	});
</script>

<div class="table-header-container">
	{#if !tableCaptionEnabled}
		<div class="table-caption-warning">
			<AlertCircle class="h-4 w-4" />
			<span>{m.tablewrap_caption_unsupported_warning()}</span>
		</div>
	{/if}
	<div class="table-header">
		<div class="table-number-row">
			<div class="table-number">{tableDisplay}</div>
			{#if hasPlaceholderCaption}
				<button
					type="button"
					class="flex items-center"
					use:tip={dialect === 'typst' ? m.tablewrap_caption_placeholder_tooltip() : m.tablewrap_caption_required_tooltip()}
				>
					<AlertCircle class="text-warning-500 h-4 w-4" />
				</button>
			{/if}
		</div>

		<Popover
			open={settingsOpen}
			onOpenChange={(e) => (settingsOpen = e.open)}
			positioning={{ placement: 'bottom-end', offset: { mainAxis: 4 } }}
		>
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
						/>
					</Popover.Content>
				</Popover.Positioner>
			</Portal>
		</Popover>
	</div>
</div>

<style>
	/* flex container makes whitespace between children irrelevant */
	.table-header-container {
		display: flex;
		flex-direction: column;
	}

	:global(.table-wrapper) {
		margin: 1rem 0;
		border: 1px solid var(--color-surface-300);
		border-radius: 0.5rem;
		padding: 1rem;
		background: var(--color-surface-50);
	}

	/* the tableWrapper boundary breaks drag selection (posAtCoords fails there and the selection
	   collapses), so make it transparent to mouse events. wide tables just overflow, no scrollbar. */
	:global(.ProseMirror .tableWrapper) {
		pointer-events: none;
		overflow: visible !important;
		margin: 0 !important;
		padding: 0 !important;
	}

	:global(.ProseMirror .tableWrapper > *) {
		pointer-events: auto;
	}

	/* over-wide tables scroll inside their own box, the page never gets a horizontal scrollbar */
	:global(.table-wrapper-content) {
		max-width: 100%;
		overflow-x: auto;
	}

	.table-caption-warning {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		margin-bottom: 0.75rem;
		background: var(--color-warning-100);
		border: 1px solid var(--color-warning-400);
		border-radius: 0.375rem;
		color: var(--color-warning-700);
		font-size: 0.75rem;
		line-height: 1.4;
	}

	.table-caption-warning :global(svg) {
		flex-shrink: 0;
	}

	.table-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.75rem;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid var(--color-surface-200);
	}

	.table-number-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.table-number {
		font-size: 0.875rem;
		font-weight: 700;
		color: var(--color-surface-900);
	}

	:global(.table-settings-btn) button {
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
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

	:global(.table-wrapper-content) {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	:global(.table-caption) {
		font-size: 0.875rem;
		font-weight: 600;
		margin-bottom: 0.5rem;
		color: var(--color-surface-900);
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
		cursor: text;
		min-height: 1.5rem;
	}

	:global(.table-notes) {
		font-size: 0.75rem;
		margin-top: 0.5rem;
		color: var(--color-surface-600);
		font-style: italic;
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
		cursor: text;
		min-height: 1.5rem;
	}

	:global(.table-wrapper-content.hide-notes .table-notes) {
		display: none;
	}

	:global(.table-wrapper-content table th) {
		font-weight: 600;
		background: var(--color-surface-100);
	}

	/* the surfaces above are hardcoded light, flip them under data-mode=dark */
	:global([data-mode='dark'] .table-wrapper) {
		background: var(--color-surface-950);
		border-color: var(--color-surface-700);
	}
	:global([data-mode='dark'] .table-caption) {
		color: var(--color-surface-100);
	}
	:global([data-mode='dark'] .table-notes) {
		color: var(--color-surface-400);
	}
	:global([data-mode='dark'] .table-wrapper-content table th) {
		background: var(--color-surface-800);
	}
	:global([data-mode='dark'] .table-settings-btn button:hover) {
		background: var(--color-surface-700);
	}
	:global([data-mode='dark']) .table-header {
		border-bottom-color: var(--color-surface-700);
	}
	:global([data-mode='dark']) .table-number {
		color: var(--color-surface-100);
	}
	:global([data-mode='dark']) .table-caption-warning {
		background: var(--color-warning-950);
		border-color: var(--color-warning-700);
		color: var(--color-warning-200);
	}
</style>
