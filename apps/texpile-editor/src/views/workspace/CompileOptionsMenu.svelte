<script lang="ts">
	// the Compile button's chevron menu: actions on the compile's output, then the command itself
	import { BrushCleaning, FolderOpen, RotateCcw, Settings2 } from '@lucide/svelte';
	import { menuItemClass, menuPanelClass, separatorClass } from '$lib/menus/menuStyles';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		open: boolean;
		onClose: () => void;
		onConfigure: () => void;
		/** latexmk -gg and -c (compileResolve); both rows show only when those apply */
		onFromScratch: () => void;
		onCleanAux: () => void;
		latexmkActions: boolean;
		onShowOutput: () => void;
		/** a compiled PDF exists to reveal; the row stays, greyed, so it is discoverable */
		outputAvailable: boolean;
	};
	let { open, onClose, onConfigure, onFromScratch, onCleanAux, latexmkActions, onShowOutput, outputAvailable }: Props = $props();

	const ROW = `${menuItemClass} whitespace-nowrap`;
	function pick(action: () => void) {
		onClose();
		action();
	}
	// the focus stays on the chevron that opened the menu, so the key is heard on the window
	function closeOnEscape(e: KeyboardEvent) {
		if (!open || e.key !== 'Escape') return;
		e.preventDefault();
		onClose();
	}
</script>

<svelte:window onkeydown={closeOnEscape} />

{#if open}
	<!-- click-away layer -->
	<button class="fixed inset-0 z-1200 cursor-default" onclick={onClose} tabindex="-1" aria-hidden="true"></button>
	<div class="{menuPanelClass} absolute top-full right-0 z-1300 mt-1 flex min-w-48 flex-col">
		{#if latexmkActions}
			<button class={ROW} onclick={() => pick(onFromScratch)}>
				<RotateCcw class="size-4 shrink-0" />
				{m.wsview_recompile_from_scratch()}
			</button>
			<button class={ROW} onclick={() => pick(onCleanAux)}>
				<BrushCleaning class="size-4 shrink-0" />
				{m.wsview_clean_aux_files()}
			</button>
		{/if}
		<button class={ROW} onclick={() => pick(onShowOutput)} disabled={!outputAvailable}>
			<FolderOpen class="size-4 shrink-0" />
			{m.wsview_show_output_in_folder()}
		</button>
		<!-- a lone row over a divider reads as a menu missing half; the divider needs a group above it -->
		{#if latexmkActions}
			<div class={separatorClass}></div>
		{/if}
		<button class={ROW} onclick={() => pick(onConfigure)}>
			<Settings2 class="size-4 shrink-0" />
			{m.wsview_configure_compile_command()}
		</button>
	</div>
{/if}
