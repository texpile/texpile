<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import { SquareRadical, ChevronDown } from '@lucide/svelte';
	import { createMathField } from '$lib/editor/visual/extensions/mathlivebridge/mlcommands';
	import { editorViewStore } from '$lib/stores/editorStore';
	import Kbd from '$lib/components/Kbd.svelte';
	import { m } from '$lib/paraglide/messages';

	let open = $state(false);

	// label is a function, not a string: this list is built once at init, before the persisted
	// locale is applied, so the text has to be read at render time
	const mathOptions = [
		{
			id: 'inline',
			label: () => m.mathpal_inline_math(),
			shortcut: 'Mod+M',
			command: createMathField(false)
		},
		{
			id: 'block',
			label: () => m.mathpal_block_math(),
			shortcut: 'Mod+Shift+M',
			command: createMathField(true)
		}
	];

	function handleInsert(option: (typeof mathOptions)[0]) {
		const view = editorViewStore.current;
		if (view && view.state && view.dispatch) {
			const success = option.command(view.state, view.dispatch);
			if (success) {
				view.focus();
				open = false;
			}
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
		<button aria-label={m.mathpal_insert_math_aria()} use:tip={m.mathpal_insert_math_aria()} class="flex items-center gap-0.5">
			<SquareRadical class="h-5 w-5 text-surface-800-200" />
			<ChevronDown class="text-surface-500 size-3 shrink-0" />
		</button>
	</Popover.Trigger>

	<Portal>
		<Popover.Positioner class="z-floating-ui">
			<Popover.Content class="card bg-surface-50-950 border-surface-300-700 min-w-[180px] border p-1 shadow-lg">
				{#each mathOptions as option (option.label)}
					<button
						type="button"
						class="hover:preset-tonal-primary flex w-full items-center justify-between gap-3 rounded-base px-3 py-2 text-left"
						onclick={() => handleInsert(option)}
					>
						<span class="text-sm">{option.label()}</span>
						<Kbd keys={option.shortcut} />
					</button>
				{/each}
			</Popover.Content>
		</Popover.Positioner>
	</Portal>
</Popover>
