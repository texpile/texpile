<script lang="ts">
	import { Pencil, Plus } from '@lucide/svelte';
	import Kbd from '$lib/components/Kbd.svelte';
	import { tip, unavailableTip } from '$lib/components/tooltip.svelte';
	import { showContextMenu } from '$lib/menus/contextMenu.svelte';
	import { chordLabel } from '$lib/keybindings/keys/keyLabels';
	import { printWhen } from '$lib/keybindings/when/whenExpression';
	import WhenField from './WhenField.svelte';
	import { keysOfRow, searchMatchesId, type KeybindingRow } from './keybindingRows';
	import { KEYBINDING_GRID, type KeybindingsPanel } from './keybindingsPanel.svelte';
	import { m } from '$lib/paraglide/messages';

	const props: { panel: KeybindingsPanel; row: KeybindingRow; editable: boolean; tabStop: boolean } = $props();
	const panel = $derived(props.panel);
	const row = $derived(props.row);
	const editable = $derived(props.editable);
	const item = $derived(row.item);
	const keys = $derived(keysOfRow(row));
	const when = $derived(item?.when ? printWhen(item.when) : '');
	const why = $derived(editable ? '' : m.unavailable_desktop());
	const editingWhen = $derived(panel.editingWhen === row.key);
	const source = $derived(
		row.builtin
			? m.keybindings_source_builtin()
			: item?.source === 'user'
				? m.keybindings_source_user()
				: item
					? m.keybindings_source_default()
					: ''
	);

	function menu(e: MouseEvent): void {
		e.preventDefault();
		if (!row.builtin) void showContextMenu(panel.menuItems(row, editable), { x: e.clientX, y: e.clientY });
	}

	function open(e: MouseEvent): void {
		if (editable && !row.builtin && !(e.target as HTMLElement).closest('input, button')) panel.define(row);
	}
</script>

<div
	class="group {KEYBINDING_GRID} border-surface-200-800 hover:bg-surface-100-900 focus:bg-surface-200-800 min-h-8 border-b py-1 text-sm outline-none select-none"
	role="row"
	tabindex={props.tabStop ? 0 : -1}
	oncontextmenu={menu}
	ondblclick={open}
	onkeydown={(e) => panel.onRowKeydown(e, row, editable)}
>
	<span role="cell">
		{#if !row.builtin}<span use:unavailableTip={why} data-tip-anchor>
				<button
					type="button"
					class="btn-icon btn-icon-xs hover:preset-tonal opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
					disabled={!editable}
					aria-label={item ? m.keybindings_change() : m.keybindings_add()}
					use:tip={item ? m.keybindings_change() : m.keybindings_add()}
					onclick={() => panel.define(row)}
				>
					{#if item}<Pencil class="size-3.5" />{:else}<Plus class="size-3.5" />{/if}
				</button>
			</span>{/if}
	</span>
	<span role="cell" class="min-w-0 truncate" use:tip={row.command ? `${row.title} (${row.command})` : row.title}>
		{row.title}{#if searchMatchesId(row, panel.query)}<span class="text-faint ml-2 font-mono text-xs">{row.command}</span>{/if}
	</span>
	<span role="cell" class="flex min-w-0 items-center gap-1 overflow-hidden">
		{#each keys ?? [] as chord, i (i)}<Kbd cap raw={chordLabel(chord)} />{/each}
	</span>
	<span role="cell" class={editingWhen ? 'col-span-2 min-w-0' : 'min-w-0'}>
		{#if editingWhen && item}
			<WhenField when={item.when} onSave={(w) => void panel.changeWhen(item, w)} onCancel={() => (panel.editingWhen = null)} />
		{:else}<span class="text-faint block truncate font-mono text-xs" use:tip={when}>{when}</span>{/if}
	</span>
	{#if !editingWhen}<span role="cell" class="text-faint truncate text-xs" use:tip={row.builtin ? m.keybindings_builtin_note() : ''}
			>{source}</span
		>{/if}
</div>
