<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import { Settings } from '@lucide/svelte';
	import type { EditorView } from 'prosemirror-view';
	import type { Node as PMNode } from 'prosemirror-model';
	import type { Dialect } from '$lib/editor/visual/dialect';
	import { isReadOnly } from '$lib/stores/permissionStore';
	import ImageSettingsPanel from './ImageSettingsPanel.svelte';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		node: PMNode;
		view: EditorView;
		getPos: () => number | undefined;
		/** dialect-aware chrome (see lib/editor/dialect.ts): feature flags derive from this. */
		dialect?: Dialect;
	};

	let { node, view, getPos, dialect = 'latex' }: Props = $props();

	let settingsOpen = $state(false);
	let overlayElement: HTMLDivElement | undefined = $state();

	// set --caption-height so the overlay stops above the caption
	$effect(() => {
		if (!overlayElement) return;

		const root = overlayElement.parentElement;
		if (!root) return;

		const captionElement = root.querySelector('.text');
		if (captionElement) {
			const captionHeight = (captionElement as HTMLElement).offsetHeight;
			root.style.setProperty('--caption-height', `${captionHeight}px`);
		} else {
			root.style.setProperty('--caption-height', '0px');
		}
	});
</script>

<div class="image-overlay-wrapper" bind:this={overlayElement}>
	<div class="pointer-events-auto absolute right-2 top-2">
		<Popover
			open={settingsOpen}
			onOpenChange={(e) => (settingsOpen = e.open)}
			positioning={{ placement: 'bottom-end', offset: { mainAxis: 4 } }}
		>
			<Popover.Trigger class="image-settings-btn">
				<button
					class="settings-button"
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
					<Popover.Content class="card bg-surface-50-950 border-surface-300-700 min-w-[250px] border shadow-lg">
						<ImageSettingsPanel {node} {view} {getPos} {dialect} {overlayElement} />
					</Popover.Content>
				</Popover.Positioner>
			</Portal>
		</Popover>
	</div>
</div>

<style>
	.image-overlay-wrapper {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		pointer-events: none;
		/* no bottom: 0; the height calc stops the overlay above the caption */
		height: calc(100% - var(--caption-height, 0px));
	}

	:global(.imagePluginRoot:not(:hover)) .image-overlay-wrapper {
		opacity: 0;
		pointer-events: none;
	}

	:global(.imagePluginRoot:hover) .image-overlay-wrapper {
		opacity: 1;
	}

	.image-overlay-wrapper {
		transition: opacity 0.2s ease;
	}

	/* match the table settings button */
	.settings-button {
		width: calc(var(--spacing) * 8);
		height: calc(var(--spacing) * 8);
		padding: 0;
		border: var(--default-border-width) solid var(--color-surface-300);
		border-radius: var(--radius-base);
		background: var(--color-surface-50);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		color: var(--muted-text);
		transition: all 0.2s ease;
	}

	.settings-button:hover {
		background: var(--color-surface-100);
		border-color: var(--color-surface-400);
	}

	:global(.dark) .settings-button {
		background: var(--color-surface-800);
		border-color: var(--color-surface-700);
		color: var(--muted-text);
	}

	:global(.dark) .settings-button:hover {
		background: var(--color-surface-700);
		border-color: var(--color-surface-700);
	}
</style>
