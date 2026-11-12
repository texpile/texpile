<script lang="ts">
	import { inEditorPane, isReadOnly, tip, type GearPlace } from '$lib/languages/latex/visual/core';

	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import { Settings } from '@lucide/svelte';
	import type { EditorView } from 'prosemirror-view';
	import type { Node as PMNode } from 'prosemirror-model';

	import { m } from '$lib/paraglide/messages';
	import { renameGroupLabel } from './figureGroupLabel';

	type Props = { node: PMNode; view: EditorView; getPos: () => number | undefined };

	const props: Props = $props();
	let open = $state(false);
	let typed = $state('');
	let place = $state.raw<GearPlace | null>(null);
	const positioning = $derived(
		inEditorPane({ placement: 'bottom-end', offset: { mainAxis: 4 }, ...(place ? { getAnchorRect: place } : {}) })
	);

	/** `at`: the block handle's gear, when that is what opened them */
	export function openAt(at: GearPlace | null): void {
		place = at;
		typed = String(props.node.attrs.label ?? '');
		open = true;
	}

	function commit(): void {
		typed = renameGroupLabel(props.view, props.getPos, props.node, typed);
	}
</script>

<Popover
	{open}
	onOpenChange={(e) => {
		open = e.open;
		if (e.open) typed = String(props.node.attrs.label ?? '');
	}}
	{positioning}
>
	<Popover.Trigger>
		<button
			class="btn-icon btn-icon-sm preset-tonal"
			use:tip={m.imageoverlay_settings_title()}
			type="button"
			aria-label={m.imageoverlay_settings_aria()}
			disabled={isReadOnly.current}
		>
			<Settings class="h-4 w-4" />
		</button>
	</Popover.Trigger>
	<Portal>
		<Popover.Positioner class="z-floating-ui">
			<Popover.Content class="card bg-surface-50-950 border-surface-300-700 min-w-[250px] border p-3 shadow-lg">
				<label class="label">
					<span>
						{m.imageoverlay_latex_label()}
						<span class="text-muted text-sm">{m.imageoverlay_latex_label_hint()}</span>
					</span>
					<input
						type="text"
						class="input text-sm"
						bind:value={typed}
						onblur={commit}
						onkeydown={(e) => e.key === 'Enter' && commit()}
						placeholder={m.imageoverlay_label_placeholder()}
					/>
				</label>
			</Popover.Content>
		</Popover.Positioner>
	</Portal>
</Popover>
