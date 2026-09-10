<script lang="ts">
	// the Compile button's chevron menu: actions on the compile's output, then the command itself
	import { BrushCleaning, FolderOpen, RotateCcw, Settings2 } from '@lucide/svelte';
	import { separatorClass } from '$lib/chrome/menubar/menuBarStyles';
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

	// row metrics match the menubar's menus (menuBarStyles.itemClass), icon before the label
	const ROW =
		'hover:preset-tonal flex w-full cursor-pointer items-center gap-2 rounded-base px-2.5 py-1 text-left text-sm whitespace-nowrap disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent';
	function pick(action: () => void) {
		onClose();
		action();
	}
</script>

{#if open}
	<!-- click-away layer -->
	<button class="fixed inset-0 z-1200 cursor-default" onclick={onClose} tabindex="-1" aria-hidden="true"></button>
	<div
		class="card bg-surface-50-950 border-surface-200-800 absolute top-full right-0 z-1300 mt-1 flex min-w-48 flex-col border p-1 shadow-xl"
	>
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
