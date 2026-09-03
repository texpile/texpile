<script lang="ts">
	// Ctrl+K / Cmd+K palette: run a command or jump to a file.
	//
	// Shell follows the app's other modals (fixed overlay, z-1300 card) rather than Skeleton's
	// Dialog, because every other dialog here is built that way and they have to stack predictably.
	// The input and list are Skeleton's Combobox so arrow keys, Enter and the aria wiring come from
	// the same library as the rest of the UI; the filtering, ranking and highlighting are ours.
	//
	// No props: the commands come from the palette action registry, which WorkspaceView fills in.
	import { Combobox, useListCollection } from '@skeletonlabs/skeleton-svelte';
	import { Search } from '@lucide/svelte';
	import Kbd from '$lib/components/Kbd.svelte';
	import { isMac } from '$lib/platform';
	import { commandPalette } from '$lib/workspace/commandPalette.svelte';
	import { buildCommands, type PaletteItem } from './paletteCommands';
	import { goToFileItems, MAX_FILE_RESULTS } from './paletteGoItems';
	import { fuzzyScore, highlightRuns } from './paletteFilter';
	import { m } from '$lib/paraglide/messages';

	let query = $state('');

	// Cmd on macOS, Ctrl elsewhere - not "either". Ctrl+K on macOS is emacs kill-line, which
	// CodeMirror's standard keymap binds there, and stealing it would break editing for the people
	// most likely to notice.
	function isPaletteChord(e: KeyboardEvent): boolean {
		const mod = isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
		if (!mod || e.altKey) return false;
		if (!e.shiftKey && e.key.toLowerCase() === 'k') return true;
		// VS Code's chord, for the muscle memory it comes with
		return e.shiftKey && e.key.toLowerCase() === 'p';
	}

	function onWindowKeydown(e: KeyboardEvent) {
		if (!isPaletteChord(e)) return;
		e.preventDefault();
		query = '';
		commandPalette.toggle();
	}

	/**
	 * Escape, in the CAPTURE phase.
	 *
	 * It used to sit in the bubble handler above and did nothing: while the palette is open the focus
	 * is in the Combobox input, and zag handles Escape there to dismiss its own listbox and stops the
	 * event - so it never reached the window and the dialog stayed up. Capture runs on the way down,
	 * before the input ever sees the key, so the palette closes whatever the widget decides to do
	 * with it afterwards.
	 */
	function onWindowKeydownCapture(e: KeyboardEvent) {
		if (!commandPalette.open || e.key !== 'Escape') return;
		e.preventDefault();
		e.stopPropagation();
		commandPalette.hide();
	}

	// Rebuilt every time the palette opens, never while it is open: the labels read live state
	// ("Hide terminal"), and a list that reshuffled under the highlighted row mid-keystroke would
	// run the wrong command.
	let commands = $state<PaletteItem[]>([]);
	let files = $state<PaletteItem[]>([]);
	$effect(() => {
		if (!commandPalette.open) return;
		const a = commandPalette.actions;
		if (!a) return;
		commands = buildCommands(a);
		files = goToFileItems(a);
	});

	type Scored = {
		item: PaletteItem;
		hits: number[];
	};

	function rank(items: PaletteItem[], q: string, limit: number): Scored[] {
		// searchOnly items (diagnostics) exist to be typed for, never browsed to
		if (!q)
			return items
				.filter((i) => !i.searchOnly)
				.slice(0, limit)
				.map((item) => ({ item, hits: [] }));
		const out: { item: PaletteItem; hits: number[]; score: number }[] = [];
		for (const item of items) {
			const onLabel = fuzzyScore(item.label, q);
			// keywords (and, for a file, its folder) match but do not highlight, so a hit there scores
			// lower than the same hit in the visible label
			const onKeywords = item.keywords ? fuzzyScore(item.keywords, q) : null;
			if (!onLabel && !onKeywords) continue;
			const useLabel = onLabel && (!onKeywords || onLabel.score >= onKeywords.score - 6);
			out.push({
				item,
				hits: useLabel ? onLabel.hits : [],
				score: useLabel ? onLabel.score : (onKeywords?.score ?? 0) - 6
			});
		}
		out.sort((x, y) => y.score - x.score);
		return out.slice(0, limit).map(({ item, hits }) => ({ item, hits }));
	}

	// Commands always come first: they are a short fixed list the user is choosing from, whereas the
	// file list is long and would otherwise bury them. With an empty query the files are left out
	// entirely - "everything in the project" is not a useful first screen.
	const results = $derived.by<Scored[]>(() => {
		const q = query.trim();
		const cmds = rank(commands, q, 50);
		if (!q) return cmds;
		return [...cmds, ...rank(files, q, MAX_FILE_RESULTS)];
	});

	const collection = $derived(
		useListCollection<Scored>({
			items: results,
			itemToString: (s) => s.item.label,
			itemToValue: (s) => s.item.id
		})
	);

	function runValue(id: string | undefined) {
		if (!id) return;
		const hit = results.find((s) => s.item.id === id);
		if (!hit) return;
		// close first: several commands raise their own modal, and two overlays appearing in the same
		// frame flicker in the wrong order
		commandPalette.hide();
		hit.item.run();
	}

	// group headers, emitted when the group changes as the list is rendered
	function groupOf(i: number): string | null {
		const g = results[i]?.item.group;
		return i === 0 || results[i - 1]?.item.group !== g ? (g ?? null) : null;
	}

	const rowClass =
		'grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-base px-2.5 py-1.5 text-sm data-[highlighted]:preset-tonal';
</script>

<svelte:window onkeydown={onWindowKeydown} onkeydowncapture={onWindowKeydownCapture} />

{#if commandPalette.open}
	<div
		class="fixed inset-0 z-1300 flex items-start justify-center app-scrim bg-black/40 p-4 pt-[8vh]"
		role="presentation"
		onmousedown={(e) => e.target === e.currentTarget && commandPalette.hide()}
	>
		<div class="card bg-surface-50-950 border-surface-300-700 flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden border shadow-2xl">
			<Combobox
				class="flex min-h-0 w-full flex-col"
				{collection}
				inputValue={query}
				onInputValueChange={(d) => (query = d.inputValue)}
				onValueChange={(d) => runValue(d.value[0])}
				inputBehavior="autohighlight"
				selectionBehavior="preserve"
				open={true}
			>
				<Combobox.Control class="border-surface-200-800 flex items-center gap-2 border-b px-3 py-2">
					<Search class="text-muted size-4 shrink-0" />
					<Combobox.Input
						class="w-full bg-transparent text-sm outline-none placeholder:text-muted"
						placeholder={m.palette_placeholder()}
						autocomplete="off"
						spellcheck="false"
					/>
				</Combobox.Control>

				{#if results.length === 0}
					<div class="text-muted px-3 py-10 text-center text-sm">{m.palette_empty()}</div>
				{:else}
					<Combobox.Content class="min-h-0 overflow-y-auto border-none bg-transparent p-1.5">
						{#each results as scored, i (scored.item.id)}
							{@const header = groupOf(i)}
							{#if header}
								<div class="text-muted px-2.5 pt-2 pb-1 text-xs font-semibold tracking-wider uppercase">{header}</div>
							{/if}
							<Combobox.Item class={rowClass} item={scored}>
								{#if scored.item.icon}
									{@const Icon = scored.item.icon}
									<Icon class="text-muted size-4 shrink-0" />
								{:else}
									<span class="size-4 shrink-0"></span>
								{/if}
								<Combobox.ItemText class="truncate">
									{#each highlightRuns(scored.item.label, scored.hits) as run, ri (ri)}{#if run.hit}<span
												class="text-primary-ink font-semibold">{run.text}</span
											>{:else}{run.text}{/if}{/each}
								</Combobox.ItemText>
								{#if scored.item.hint}
									<span class="text-muted max-w-56 truncate text-xs">{scored.item.hint}</span>
								{/if}
							</Combobox.Item>
						{/each}
					</Combobox.Content>
				{/if}

				<!-- Skeleton has no .kbd class; Kbd is ours, and using it here means these caps and the
				     ones in the Help shortcut sheet cannot drift apart again -->
				<div class="border-surface-200-800 text-muted flex gap-3 border-t px-3 py-1.5 text-xs">
					<span><Kbd cap keys="up" /> <Kbd cap keys="down" /> {m.palette_hint_navigate()}</span>
					<span><Kbd cap keys="enter" /> {m.palette_hint_select()}</span>
					<span><Kbd cap keys="esc" /> {m.palette_hint_close()}</span>
				</div>
			</Combobox>
		</div>
	</div>
{/if}
