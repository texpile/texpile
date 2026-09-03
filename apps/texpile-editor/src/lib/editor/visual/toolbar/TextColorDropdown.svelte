<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import { Baseline, AlertTriangle } from '@lucide/svelte';
	import { editorViewStore, templateFeaturesStore } from '$lib/stores/editorStore';
	import { schema as texSchema } from '$lib/languages/latex/schema/latexPMSchema';
	import type { Schema } from 'prosemirror-model';
	import { m } from '$lib/paraglide/messages';

	// markSchema must be the schema of the mounted editor - marks from a foreign Schema object
	// must never enter a document (the typst toolbar passes typSchema)
	let { activeTextColor = null, markSchema = texSchema }: { activeTextColor?: string | null; markSchema?: Schema } = $props();

	let open = $state(false);

	const textColorDisabled = $derived(templateFeaturesStore.current?.textColor === false);

	const textColors = [
		{ name: m.tbar_color_default(), value: 'default' },
		{ name: m.tbar_color_black(), value: 'black' },
		{ name: m.tbar_color_red(), value: 'red' },
		{ name: m.tbar_color_blue(), value: 'blue' },
		{ name: m.tbar_color_green(), value: 'green' },
		{ name: m.tbar_color_yellow(), value: 'yellow' },
		{ name: m.tbar_color_cyan(), value: 'cyan' },
		{ name: m.tbar_color_magenta(), value: 'magenta' },
		{ name: m.tbar_color_white(), value: 'white' }
	] as const;

	function setTextColor(color: string) {
		const view = editorViewStore.current;
		if (view) {
			const { state, dispatch } = view;
			const { from, to } = state.selection;

			if (color === 'default') {
				dispatch(state.tr.removeMark(from, to, markSchema.marks.textcolor));
			} else {
				const mark = markSchema.marks.textcolor.create({ color });
				dispatch(state.tr.addMark(from, to, mark));
			}
			view.focus();
			open = false;
		}
	}
</script>

<Popover
	{open}
	onOpenChange={(e) => (open = e.open)}
	positioning={{ placement: 'bottom-start', offset: { mainAxis: 4 } }}
	autoFocus={false}
>
	<Popover.Trigger class="toolbarButton rounded-base p-1 hover:bg-surface-200-800">
		<button aria-label={m.tbar_text_color_aria()} use:tip={m.tbar_text_color_aria()} class="relative flex items-center">
			<!-- nudged down 1.5px, lucide's A glyph rides high; matches the underline correction -->
			<Baseline class="h-5 w-5 translate-y-[1.5px] text-surface-800-200" />
			<!-- active-color bar is absolute so it doesn't add height and lift the icon off center -->
			<span
				class="absolute inset-x-0 -bottom-1 h-[3px] rounded-full"
				style="background-color: {activeTextColor ? activeTextColor : 'transparent'};"
			></span>
		</button>
	</Popover.Trigger>

	<Portal>
		<Popover.Positioner class="z-floating-ui">
			<Popover.Content class="card bg-surface-50-950 border-surface-300-700 min-w-[140px] border p-1 shadow-lg">
				{#if textColorDisabled}
					<div class="text-warning-ink border-surface-300-700 flex items-start gap-2 border-b px-3 py-2 text-xs">
						<AlertTriangle class="mt-0.5 h-4 w-4 flex-shrink-0" />
						<span>{m.tbar_text_color_disabled_warning()}</span>
					</div>
				{/if}
				{#each textColors as { name, value } (value)}
					<button
						type="button"
						class="hover:preset-tonal-primary flex w-full items-center gap-2 rounded-base px-3 py-2 text-left"
						onclick={() => setTextColor(value)}
					>
						{#if value === 'default'}
							<span class="relative inline-block h-3 w-3 rounded-full border border-surface-300-700 bg-surface-100-900">
								<span class="absolute inset-0 flex items-center justify-center text-xs text-swatch-clear">✕</span>
							</span>
						{:else}
							<span class="inline-block h-3 w-3 rounded-full border border-surface-300-700" style="background-color: {value};"></span>
						{/if}
						<span class="text-sm">{name}</span>
					</button>
				{/each}
			</Popover.Content>
		</Popover.Positioner>
	</Portal>
</Popover>
