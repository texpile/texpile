<script lang="ts">
	import { Braces, RotateCcw } from '@lucide/svelte';
	import { tip, unavailableTip } from '$lib/components/tooltip.svelte';
	import { runCommand } from '$lib/keybindings/commands/commandRegistry';
	import { userKeybindingsAvailable } from '$lib/keybindings/user/userKeybindingsFile';
	import { KEYBINDING_GRID, KeybindingsPanel } from './keybindingsPanel.svelte';
	import KeybindingSearchField from './KeybindingSearchField.svelte';
	import KeybindingRowView from './KeybindingRowView.svelte';
	import KeybindingsFileNotice from './KeybindingsFileNotice.svelte';
	import DefineKeybindingDialog from './DefineKeybindingDialog.svelte';
	import { m } from '$lib/paraglide/messages';

	const panel = new KeybindingsPanel();
	const editable = userKeybindingsAvailable();
</script>

<div class="space-y-3 py-4">
	<div class="flex">
		<KeybindingSearchField {panel}>
			{#snippet actions()}
				<span class="flex" use:unavailableTip={editable ? '' : m.unavailable_desktop()} data-tip-anchor>
					<button
						type="button"
						class="btn-icon btn-icon-sm hover:preset-tonal shrink-0"
						disabled={!editable}
						aria-label={m.keybindings_cmd_open_json()}
						use:tip={m.keybindings_cmd_open_json()}
						onclick={() => runCommand('keybindings.openJson')}><Braces class="size-4" /></button
					>
				</span>
				<span
					class="flex"
					use:unavailableTip={editable ? (panel.changed ? '' : m.keybindings_reset_all_none()) : m.unavailable_desktop()}
					data-tip-anchor
				>
					<button
						type="button"
						class="btn-icon btn-icon-sm hover:preset-tonal shrink-0"
						disabled={!editable || !panel.changed}
						aria-label={m.keybindings_reset_all()}
						use:tip={m.keybindings_reset_all()}
						onclick={() => void panel.resetAll()}><RotateCcw class="size-4" /></button
					>
				</span>
			{/snippet}
		</KeybindingSearchField>
	</div>
	<KeybindingsFileNotice />
	<div role="table" aria-label={m.menubar_keyboard_shortcuts()}>
		<div role="rowgroup" class="bg-surface-50-950 sticky top-0 z-10">
			<div role="row" class="{KEYBINDING_GRID} border-surface-300-700 text-muted border-b py-1.5 text-xs font-semibold">
				<span role="columnheader">{m.keybindings_column_command()}</span>
				<span role="columnheader">{m.keybindings_column_key()}</span>
				<span role="columnheader">{m.keybindings_column_when()}</span>
				<span role="columnheader">{m.keybindings_column_source()}</span>
			</div>
		</div>
		<div role="rowgroup">
			{#each panel.shown as row, i (row.key)}
				<KeybindingRowView {panel} {row} {editable} tabStop={i === 0} />
			{:else}
				<p class="text-muted py-4 text-sm">{m.keybindings_no_match()}</p>
			{/each}
		</div>
	</div>
</div>
{#if panel.defining}<DefineKeybindingDialog {panel} />{/if}
