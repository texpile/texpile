<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import { inEditorPane } from '$lib/editor/visual/editorPanePositioning';
	import { offerBlockSettings, settingsPlace, type GearPlace } from '$lib/editor/visual/extensions/blockHandle/blockSettings';
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import { Crop, Settings } from '@lucide/svelte';
	import { START_IMAGE_CROP } from './crop/paperCrop';
	import { graphicsCropReadable } from './crop/graphicsCrop';
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
	let place = $state.raw<GearPlace | null>(null);
	const positioning = $derived(
		inEditorPane({ placement: 'bottom-end', offset: { mainAxis: 4 }, ...(place ? { getAnchorRect: place } : {}) })
	);

	function offerSettings(overlay: HTMLElement) {
		const root = overlay.closest('.imagePluginRoot');
		if (!root) return;
		return offerBlockSettings(root, {
			label: () => m.imageoverlay_settings_title(),
			open(gear) {
				place = settingsPlace(root, gear);
				settingsOpen = true;
			}
		});
	}
	const cropReadable = $derived(
		dialect !== 'latex' || graphicsCropReadable(typeof node.attrs.options === 'string' ? node.attrs.options : null)
	);

	function startCrop(): void {
		overlayElement?.closest('.imagePluginRoot')?.dispatchEvent(new CustomEvent(START_IMAGE_CROP));
	}
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

<div class="image-overlay-wrapper" bind:this={overlayElement} {@attach offerSettings}>
	<div class="image-overlay-buttons pointer-events-auto absolute top-2 right-2 flex gap-1">
		{#if dialect !== 'markdown'}
			<button
				class="settings-button"
				use:tip={cropReadable ? m.imageoverlay_crop() : m.imageoverlay_crop_unreadable()}
				type="button"
				aria-label={m.imageoverlay_crop()}
				disabled={isReadOnly.current || !cropReadable}
				onclick={startCrop}
			>
				<Crop class="h-4 w-4" />
			</button>
		{/if}
		<Popover
			open={settingsOpen}
			onOpenChange={(e) => {
				settingsOpen = e.open;
				if (!e.open) place = null;
			}}
			{positioning}
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
						{#if settingsOpen}
							<ImageSettingsPanel {node} {view} {getPos} {dialect} {overlayElement} />
						{/if}
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

	/* directly in an editor with a block handle, the handle's gear opens the settings */
	:global(.ProseMirror[data-block-handle] > .imagePluginRoot .image-settings-btn) {
		display: none;
	}

	/* and the crop button joins the handle's row: its size and look, level with the gear, on a plate the page's
	   color for where it lies on the picture */
	:global(.ProseMirror[data-block-handle] > .imagePluginRoot) .image-overlay-buttons {
		top: 3px;
		right: 0;
	}
	:global(.ProseMirror[data-block-handle] > .imagePluginRoot) .settings-button {
		width: calc(var(--spacing) * 5.5);
		height: calc(var(--spacing) * 5.5);
		border: none;
		background: light-dark(var(--color-surface-50), var(--color-surface-950));
		color: var(--faint-text);
	}
	:global(.ProseMirror[data-block-handle] > .imagePluginRoot) .settings-button:hover {
		background: light-dark(var(--color-surface-200), var(--color-surface-700));
		color: var(--color-surface-950-50);
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
