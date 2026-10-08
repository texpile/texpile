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
		/** a file opened on its own has no sidebar and one editor */
		project: boolean;
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
	<button
		class="hover:bg-surface-200-800 rounded-base flex h-[22px] items-center gap-1 px-1.5 text-xs"
		onclick={() => (open ? close() : (open = true))}
		aria-haspopup="menu"
		aria-expanded={open}
	>
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
				{#if props.project}
					<PanelMenuItem
						icon={PanelLeft}
						open={props.panes.sidebarOpen}
						label={m.groups_layout_sidebar()}
						onclick={() => toggle(props.panes.toggleSidebar)}
					/>
				{/if}
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
			{#if props.project}
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
			{/if}
			<span class="text-muted px-1 text-xs">{m.wsview_preview_label()}</span>
			<div class="flex gap-0.5">
				<!-- greyed rather than hidden, and not `disabled`: a disabled button shows no hint, and the hint is the reason -->
				<button
					class="btn-icon btn-icon-sm {props.splittable ? on(stored.current.pdfSplit) : 'cursor-default opacity-40'}"
					role="menuitemcheckbox"
					aria-checked={props.splittable && stored.current.pdfSplit}
					aria-label={m.pdf_split()}
					use:tip={props.splittable ? m.pdf_split() : m.pdf_split_unavailable()}
					aria-disabled={!props.splittable}
					onclick={() => props.splittable && updateLayout({ pdfSplit: !stored.current.pdfSplit })}
				>
					<SquareSplitVertical class="size-4" />
				</button>
				<button
					class="btn-icon btn-icon-sm {on(props.panes.pdfPopout)}"
					role="menuitemcheckbox"
					aria-checked={props.panes.pdfPopout}
					aria-label={m.wsview_popout_preview()}
					use:tip={m.wsview_popout_preview()}
					onclick={() => props.panes.setPdfPopout(!props.panes.pdfPopout)}
				>
					<PictureInPicture2 class="size-4" />
				</button>
			</div>
		</div>
	{/if}
</div>
