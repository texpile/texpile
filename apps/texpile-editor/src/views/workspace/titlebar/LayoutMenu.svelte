<script lang="ts">
	// the window's arrangement, in one place: which panels show, the editor layout and where the preview sits
	import {
		ChevronDown,
		Columns2,
		Grid2x2,
		LayoutDashboard,
		PanelBottom,
		PanelLeft,
		PanelRight,
		PictureInPicture2,
		Rows2,
		Square,
		SquareSplitVertical
	} from '@lucide/svelte';
	import type { Component } from 'svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { menuPanelClass } from '$lib/menus/menuStyles';
	import { editorGroups } from '$lib/workspace/groups/editorGroups.svelte';
	import type { EditorLayout } from '$lib/workspace/groups/layouts';
	import { layout as stored, updateLayout } from '$lib/storage/layout';
	import type { PaneLayout } from '$lib/workspace/paneLayout.svelte';
	import type { TerminalDockState } from '$lib/workspace/terminalDockState.svelte';
	import PanelMenuItem from './PanelMenuItem.svelte';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		panes: PaneLayout;
		termDock: TerminalDockState;
		/** only a compiled PDF splits; live mode and the Typst preview draw their own */
		splittable: boolean;
	};
	const props: Props = $props();

	const SHAPES: { layout: EditorLayout; icon: Component; label: () => string }[] = [
		{ layout: 'one', icon: Square, label: m.groups_layout_one },
		{ layout: 'columns', icon: Columns2, label: m.groups_layout_columns },
		{ layout: 'rows', icon: Rows2, label: m.groups_layout_rows },
		{ layout: 'grid', icon: Grid2x2, label: m.groups_layout_grid }
	];

	let open = $state(false);
	// the menu had the keyboard for its moment; the editor being written in gets it back, as in VS Code
	function close(): void {
		open = false;
		editorGroups.keyboardFocus = editorGroups.focusedId;
	}
	function pick(layout: EditorLayout) {
		close();
		editorGroups.setLayout(layout);
	}
	// caught on the way down: an editor with the focus would otherwise keep the key for itself
	function closeOnEscape(e: KeyboardEvent) {
		if (!open || e.key !== 'Escape') return;
		e.preventDefault();
		close();
	}
	function toggle(run: () => void) {
		close();
		run();
	}
	function togglePreview() {
		if (props.panes.pdfPopout) props.panes.setPdfPopout(false);
		else props.panes.togglePdfPane();
	}
	function on(pressed: boolean): string {
		return pressed ? 'preset-filled-primary-500' : 'hover:preset-tonal';
	}
</script>

<svelte:window onkeydowncapture={closeOnEscape} />

<div class="app-no-drag relative flex items-center self-center">
	<button class="title-bar-button gap-1" onclick={() => (open ? close() : (open = true))} aria-haspopup="menu" aria-expanded={open}>
		<LayoutDashboard class="size-3.5" />
		<span class="cap-center">{m.groups_layout()}</span>
		<ChevronDown class="size-3 opacity-60" />
	</button>
	{#if open}
		<!-- click-away layer -->
		<button class="fixed inset-0 z-1200 cursor-default" onclick={close} tabindex="-1" aria-hidden="true"></button>
		<div class="{menuPanelClass} absolute top-full right-0 z-1300 mt-1 flex min-w-48 flex-col gap-1" role="menu">
			<span class="text-muted px-1 text-xs">{m.groups_layout_panels()}</span>
			<div class="flex flex-col">
				<PanelMenuItem
					icon={PanelLeft}
					open={props.panes.sidebarOpen}
					label={m.groups_layout_sidebar()}
					onclick={() => toggle(props.panes.toggleSidebar)}
				/>
				{#if props.termDock.available}
					<PanelMenuItem
						icon={PanelBottom}
						open={props.termDock.visible}
						label={m.wsview_terminal_label()}
						onclick={() => toggle(() => props.termDock.toggle())}
					/>
				{/if}
				<PanelMenuItem
					icon={PanelRight}
					open={props.panes.pdfPaneOpen && !props.panes.pdfPopout}
					label={m.wsview_pdf_preview_label()}
					onclick={() => toggle(togglePreview)}
				/>
			</div>
			<span class="text-muted px-1 text-xs">{m.groups_layout_editors()}</span>
			<div class="flex gap-0.5">
				{#each SHAPES as shape (shape.layout)}
					<button
						class="btn-icon btn-icon-sm {on(shape.layout === editorGroups.layout)}"
						role="menuitemradio"
						aria-checked={shape.layout === editorGroups.layout}
						aria-label={shape.label()}
						use:tip={shape.label()}
						onclick={() => pick(shape.layout)}
					>
						<shape.icon class="size-4" />
					</button>
				{/each}
			</div>
			<span class="text-muted px-1 text-xs">{m.wsview_preview_label()}</span>
			<!-- checked rows like the panels: these are switches, and the editors' icon row reads as one choice -->
			<div class="flex flex-col">
				<PanelMenuItem
					icon={SquareSplitVertical}
					open={props.splittable && stored.current.pdfSplit}
					label={m.pdf_split()}
					unavailable={props.splittable ? undefined : m.pdf_split_unavailable()}
					onclick={() => toggle(() => updateLayout({ pdfSplit: !stored.current.pdfSplit }))}
				/>
				<PanelMenuItem
					icon={PictureInPicture2}
					open={props.panes.pdfPopout}
					label={m.wsview_popout_preview()}
					onclick={() => toggle(() => props.panes.setPdfPopout(!props.panes.pdfPopout))}
				/>
			</div>
		</div>
	{/if}
</div>
