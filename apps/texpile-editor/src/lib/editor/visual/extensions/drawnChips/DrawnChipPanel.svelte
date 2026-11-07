<script lang="ts">
	import { chipPanel, closeChipPanel } from './chipPanel.svelte';
	import { followChip } from './chipPanelFollow';
	import ChipSourceField from './ChipSourceField.svelte';
	import ChipPanelFooter from './ChipPanelFooter.svelte';
	import { historyKeyOf, redoVisual, undoVisual } from '$lib/editor/visual/visualUndo';
	import { m } from '$lib/paraglide/messages';

	function onKeydown(event: KeyboardEvent) {
		if (event.defaultPrevented) return;
		const step = historyKeyOf(event);
		if (step) {
			event.preventDefault();
			if (step === 'undo') undoVisual();
			else redoVisual();
			return;
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			closeChipPanel('escape');
		} else if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
			event.preventDefault();
			closeChipPanel('enter');
		}
	}
</script>

{#if chipPanel.request}
	{@const request = chipPanel.request}
	{@const source = chipPanel.source}
	{@const Settings = request.settingsFor(source)}
	{#key request}
		<div
			class="drawn-chip-panel card bg-surface-50-950 border-surface-300-700 fixed top-0 left-0 z-[200] flex max-h-[70vh] w-[336px] flex-col gap-2 overflow-y-auto border shadow-lg {request.footer
				? 'p-2'
				: 'p-3'}"
			role="dialog"
			tabindex="-1"
			aria-label={m.drawn_chip_panel_label()}
			onkeydown={onKeydown}
			{@attach followChip(request.anchor)}
		>
			{#if Settings}
				<Settings
					{source}
					write={(next) => {
						if (next !== null && next !== source) request.writeSetting(next);
					}}
					close={() => closeChipPanel('enter')}
					jump={request.jump}
					jumpToDefinition={request.jumpToDefinition}
					view={request.view}
				/>
			{:else}
				<ChipSourceField
					{source}
					language={request.language}
					inline={request.inline}
					write={request.write}
					undo={request.undo}
					redo={request.redo}
					close={() => closeChipPanel('enter')}
					heading={!request.footer}
					caret={request.caret}
					action={request.action}
				/>
				{#if request.footer}
					<ChipPanelFooter footer={request.footer} close={() => closeChipPanel('enter')} />
				{/if}
			{/if}
		</div>
	{/key}
{/if}
