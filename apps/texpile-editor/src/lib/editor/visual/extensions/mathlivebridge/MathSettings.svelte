<script lang="ts">
	// MathSettings popover for equation numbering, labels, and multi-line environments
	import { tip } from '$lib/components/tooltip.svelte';
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import { Settings } from '@lucide/svelte';
	import MathSettingsPanel from './MathSettingsPanel.svelte';
	import type { EditorView } from 'prosemirror-view';
	import type { Node as PMNode } from 'prosemirror-model';
	import { isReadOnly } from '$lib/stores/permissionStore';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		node: PMNode;
		view: EditorView;
		getPos: () => number | undefined;
	};

	let { node, view, getPos }: Props = $props();

	let settingsOpen = $state(false);
</script>

<div class="math-settings-container">
	<Popover
		open={settingsOpen}
		onOpenChange={(details) => (settingsOpen = details.open)}
		positioning={{ placement: 'bottom-end', offset: { mainAxis: 4 } }}
	>
		<Popover.Trigger class="math-settings-btn">
			<button
				type="button"
				use:tip={m.mathsettings_settings_button_label()}
				aria-label={m.mathsettings_settings_button_label()}
				disabled={isReadOnly.current}
			>
				<Settings class="h-4 w-4" />
			</button>
		</Popover.Trigger>

		<Portal>
			<Popover.Positioner class="z-floating-ui">
				<Popover.Content class="card bg-surface-50-950 border-surface-300-700 w-[280px] border shadow-lg">
					<MathSettingsPanel {node} {view} {getPos} />
				</Popover.Content>
			</Popover.Positioner>
		</Portal>
	</Popover>
</div>

<style>
	.math-settings-container {
		position: absolute;
		right: 0.5rem;
		top: 50%;
		transform: translateY(-50%);
		z-index: 10;
		display: flex;
		align-items: center;
		pointer-events: auto;
	}

	/* when numbered, push further left to avoid the equation number */
	:global(.block-math-container[data-numbered='true']) .math-settings-container {
		right: 4rem;
	}

	/* match table wrapper styling */
	:global(.math-settings-btn) button {
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
		cursor: pointer;
		transition: background-color 0.15s;
		border: none;
		background: transparent;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: auto;
		opacity: 0;
	}

	:global(.block-math-container:hover .math-settings-btn) button,
	:global(.math-settings-btn) button:focus-visible {
		opacity: 1;
	}

	:global(.math-settings-btn) button:hover {
		background: var(--color-surface-200);
	}
</style>
