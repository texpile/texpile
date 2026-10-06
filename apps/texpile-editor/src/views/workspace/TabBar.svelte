<script lang="ts">
	// Open tabs on a dedicated strip above the editor. Tabs shrink as the count grows; past
	// the point where another one would be narrower than MIN_TAB_PX the strip stops growing and
	// the leftovers move into a dropdown, so the bar never scrolls out from under the pointer.
	//
	// A tab is a file or a comparison of that file against one saved version. Both live here
	// because both are things you opened and can close; visual/source is a separate axis and
	// stays a toolbar toggle applying to whichever tab is focused.
	import { tip } from '$lib/components/tooltip.svelte';
	import { X, ChevronDown, Columns2, GitCompare, GitMerge } from '@lucide/svelte';
	import { gitChanges, gitKey, isConflicted } from '$lib/workspace/scm/gitStore';
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import { basename } from '$lib/workspace/fileSystem';
	import { tabKey, type Tab } from '$lib/workspace/tabs.svelte';
	import { draggedTab, endTabDrag, startTabDrag, type DraggedTab } from '$lib/workspace/groups/tabDrag';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		tabs: Tab[];
		/** key of the focused tab, from tabKey() */
		activeKey: string | null;
		/** only the active FILE can be dirty (switching files flushes saves; a comparison is read-only). */
		dirty: boolean;
		/** the unedited PREVIEW tab, shown in italics; the next thing opened takes its slot. */
		previewKey?: string | null;
		onActivate: (tab: Tab) => void;
		onClose: (tab: Tab) => void;
		/** double-click keeps a preview tab (the only way to hold one you never edit, e.g. a PDF). */
		onKeep?: (tab: Tab) => void;
		onContextMenu?: (tab: Tab, event: MouseEvent) => void;
		/** Split Editor Right, at the strip's end as in VS Code */
		onSplit?: () => void;
		/** false in a parked editor group, whose active tab is dimmed as VS Code dims it */
		groupFocused?: boolean;
		/** the editor group this strip belongs to, which makes its tabs draggable */
		groupId?: number;
		/** a tab dropped on this strip, to sit at `index` */
		onDropTab?: (drop: DraggedTab, index: number) => void;
	};
	let {
		tabs,
		activeKey,
		dirty,
		previewKey = null,
		onActivate,
		onClose,
		onKeep,
		onContextMenu,
		onSplit,
		groupFocused = true,
		groupId,
		onDropTab
	}: Props = $props();

	/** files both sides changed, by the key the tree's badges use */
	const conflicted = $derived(new Set(gitChanges.current.filter((c) => isConflicted(c.x, c.y)).map((c) => gitKey(c.path))));

	function isActive(t: Tab) {
		return !!activeKey && tabKey(t) === activeKey;
	}
	/** the version name rides on the tooltip: at MIN_TAB_PX only the filename fits on the strip */
	function tabTitle(t: Tab) {
		return t.compare ? m.tabs_compare_title({ name: t.path, version: t.compare.subject }) : t.path;
	}

	/** a tab narrower than this is unreadable, so it goes in the dropdown instead.
	 *  drives the tabs' CSS min-width directly - do not restate it as a class. */
	const MIN_TAB_PX = 96;
	/** the overflow button's own footprint, reserved before dividing up the rest */
	const OVERFLOW_PX = 44;
	/** the split button's, which is always there when it is offered */
	const SPLIT_PX = 36;

	let stripWidth = $state(0);

	/** how many tabs the strip can show without any of them dropping below MIN_TAB_PX. Each tab
	 *  carries that as its CSS min-width, so this count is exact rather than an estimate. */
	const room = $derived(stripWidth - (onSplit ? SPLIT_PX : 0));
	const capacity = $derived(
		stripWidth === 0 || tabs.length * MIN_TAB_PX <= room ? tabs.length : Math.max(1, Math.floor((room - OVERFLOW_PX) / MIN_TAB_PX))
	);
	const overflowing = $derived(capacity < tabs.length);

	// The visible window slides only as far as it must to reach the active tab, the way a scroll
	// position does - recomputing it from the active index every time would shuffle the strip on
	// every switch.
	let windowStart = $state(0);
	$effect(() => {
		const max = Math.max(0, tabs.length - capacity);
		const i = activeKey ? tabs.findIndex((t) => tabKey(t) === activeKey) : -1;
		let start = Math.min(windowStart, max);
		if (i >= 0) {
			if (i < start) start = i;
			else if (i >= start + capacity) start = i - capacity + 1;
		}
		if (start !== windowStart) windowStart = start;
	});

	const visible = $derived(tabs.slice(windowStart, windowStart + capacity));

	let strip = $state<HTMLElement | null>(null);
	/** where a dragged tab would go: its place on the strip and the x of the marker drawn there */
	let insert = $state<{ index: number; x: number } | null>(null);
	function insertAt(clientX: number): { index: number; x: number } {
		const box = strip!.getBoundingClientRect();
		const shown = [...strip!.querySelectorAll<HTMLElement>('[role=tab]')];
		for (const [i, el] of shown.entries()) {
			const r = el.getBoundingClientRect();
			if (clientX < r.left + r.width / 2) return { index: windowStart + i, x: r.left - box.left };
		}
		const last = shown.at(-1)?.getBoundingClientRect();
		return { index: windowStart + shown.length, x: last ? last.right - box.left : 0 };
	}
	function onStripDragOver(event: DragEvent) {
		if (!onDropTab || !strip || !draggedTab(event)) return;
		event.preventDefault();
		// the strip is the target, not the editor area under it
		event.stopPropagation();
		insert = insertAt(event.clientX);
	}
	function onStripDrop(event: DragEvent) {
		const drop = draggedTab(event);
		const at = insert;
		insert = null;
		if (!onDropTab || !drop || !at) return;
		event.preventDefault();
		event.stopPropagation();
		onDropTab(drop, at.index);
	}

	let menuOpen = $state(false);
	function chooseFromMenu(tab: Tab) {
		menuOpen = false;
		onActivate(tab);
	}
</script>

{#if tabs.length > 0}
	<div
		class="bg-surface-100-900 border-surface-200-800 relative z-20 flex h-9 shrink-0 items-stretch overflow-clip border-b"
		role="tablist"
		tabindex="-1"
		bind:clientWidth={stripWidth}
		bind:this={strip}
		ondragover={onStripDragOver}
		ondragleave={(e) => {
			if (!strip?.contains(e.relatedTarget as Node | null)) insert = null;
		}}
		ondrop={onStripDrop}
	>
		{#each visible as tab (tabKey(tab))}
			{@const key = tabKey(tab)}
			<div
				class="group border-surface-200-800 flex shrink cursor-pointer items-center gap-1.5 border-r px-3 text-sm {isActive(tab)
					? `bg-surface-50-950 ${groupFocused ? '' : 'text-muted'}`
					: 'text-muted hover:bg-surface-wash'}"
				style="min-width: {MIN_TAB_PX}px; max-width: 15rem"
				role="tab"
				aria-selected={isActive(tab)}
				tabindex="0"
				draggable={groupId !== undefined}
				ondragstart={(e) => groupId !== undefined && startTabDrag(e, tab, groupId)}
				ondragend={endTabDrag}
				use:tip={tabTitle(tab)}
				onclick={() => onActivate(tab)}
				ondblclick={() => onKeep?.(tab)}
				oncontextmenu={(e) => onContextMenu?.(tab, e)}
				onkeydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						onActivate(tab);
					}
				}}
				onauxclick={(e) => {
					if (e.button === 1) onClose(tab);
				}}
			>
				<!-- the marker carries the whole distinction between a file and a comparison of it, so
				     it sits BEFORE the name where it cannot be trimmed away by a long filename -->
				{#if tab.compare}
					<GitCompare class="text-primary-ink size-3.5 shrink-0" />
				{:else if conflicted.has(gitKey(tab.path))}
					<!-- the file holds places a merge marked: visible from any tab, as the tree's C is -->
					<span class="shrink-0" use:tip={m.tabs_conflicted()}><GitMerge class="text-warning-ink size-3.5" /></span>
				{/if}
				<span class="truncate" class:italic={previewKey === key}>{basename(tab.path)}</span>
				<!-- fixed-size trailing slot: dirty dot and close button share it, so neither ever
				     changes the tab's width; hovering swaps the dot for the close button.
				     ml-auto keeps it on the right edge when the name leaves slack -->
				<span class="-mr-1 ml-auto flex size-5 shrink-0 items-center justify-center">
					{#if isActive(tab) && dirty && !tab.compare}
						<span class="bg-warning-500 size-2 rounded-full group-hover:hidden" use:tip={m.wsview_unsaved_changes()}></span>
					{/if}
					<button
						class="btn-icon btn-icon-xs hover:bg-surface-300-700 items-center justify-center {isActive(tab) && dirty && !tab.compare
							? 'hidden group-hover:inline-flex'
							: isActive(tab)
								? 'inline-flex'
								: 'inline-flex opacity-0 group-hover:opacity-100'}"
						onclick={(e) => {
							e.stopPropagation();
							onClose(tab);
						}}
						aria-label={m.tabs_close()}
						use:tip={m.tabs_close()}
					>
						<X class="size-3.5" />
					</button>
				</span>
			</div>
		{/each}

		{#if overflowing}
			<Popover
				open={menuOpen}
				onOpenChange={(e) => (menuOpen = e.open)}
				positioning={{ placement: 'bottom-end', offset: { mainAxis: 2 } }}
				autoFocus={false}
			>
				<Popover.Trigger
					class="text-muted hover:bg-surface-wash ml-auto flex shrink-0 items-center gap-0.5 px-2 text-sm"
					aria-label={m.tabs_show_all({ count: tabs.length })}
				>
					{#snippet element(attrs)}
						<button {...attrs} use:tip={m.tabs_show_all({ count: tabs.length })}>
							<span class="tabular-nums">{tabs.length - capacity}</span>
							<ChevronDown class="size-4" />
						</button>
					{/snippet}
				</Popover.Trigger>
				<Portal>
					<Popover.Positioner class="z-floating-ui">
						<Popover.Content class="card bg-surface-50-950 border-surface-300-700 max-h-96 min-w-[240px] overflow-y-auto border shadow-lg">
							<div class="py-1">
								{#each tabs as tab (tabKey(tab))}
									{@const key = tabKey(tab)}
									<button
										type="button"
										class="hover:preset-tonal flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
										class:preset-tonal-primary={isActive(tab)}
										use:tip={tabTitle(tab)}
										onclick={() => chooseFromMenu(tab)}
									>
										{#if tab.compare}<GitCompare class="text-primary-ink size-3.5 shrink-0" />{/if}
										<span class="truncate" class:italic={previewKey === key}>{basename(tab.path)}</span>
										<!-- in the menu there IS room for the version, and without it two comparisons of
										     the same file would be two identical rows -->
										{#if tab.compare}
											<span class="text-muted ml-auto shrink-0 truncate text-xs">{tab.compare.subject}</span>
										{/if}
									</button>
								{/each}
							</div>
						</Popover.Content>
					</Popover.Positioner>
				</Portal>
			</Popover>
		{/if}
		{#if insert}
			<div class="bg-primary-500 pointer-events-none absolute inset-y-0 z-10 w-0.5" style="left: {Math.max(0, insert.x - 1)}px"></div>
		{/if}
		{#if onSplit}
			<button
				type="button"
				class="text-muted hover:bg-surface-wash flex shrink-0 items-center justify-center px-2.5 {overflowing ? '' : 'ml-auto'}"
				style="width: {SPLIT_PX}px"
				aria-label={m.tabs_split_right()}
				use:tip={m.tabs_split_right()}
				onclick={onSplit}
			>
				<Columns2 class="size-4" />
			</button>
		{/if}
	</div>
{/if}
