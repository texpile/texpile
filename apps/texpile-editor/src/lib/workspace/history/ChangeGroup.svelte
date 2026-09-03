<script lang="ts">
	// One collapsible group of changed files, with a tick box that governs the whole group.
	//
	// Both groups - what you wrote, and what the compiler wrote - render through THIS component, so
	// they cannot drift into different shapes. They previously did: a section heading in one style
	// sat above a group row in another, and the pair read as two unrelated things.
	import { ChevronRight, ChevronDown } from '@lucide/svelte';
	import ChangeRows from './ChangeRows.svelte';
	import type { GitStatusEntry } from '$lib/workspace/git';
	import type { Snippet } from 'svelte';

	type Props = {
		label: string;
		entries: GitStatusEntry[];
		selected: string[];
		open: boolean;
		onToggleOpen: () => void;
		relPath: (p: string) => string;
		baseName: (p: string) => string;
		dirName: (p: string) => string;
		onToggle: (path: string) => void;
		onOpenDiff: (path: string) => void;
		onDiscard: (changes: GitStatusEntry[]) => void;
		/** an extra control on the header, revealed on hover (Build output's Ignore) */
		action?: Snippet;
	};
	let { label, entries, selected, open, onToggleOpen, relPath, baseName, dirName, onToggle, onOpenDiff, onDiscard, action }: Props =
		$props();

	const anyOn = $derived(entries.some((e) => selected.includes(e.path)));
	const allOn = $derived(entries.length > 0 && entries.every((e) => selected.includes(e.path)));

	/**
	 * The group box selects or clears the whole group; there is no separate select-all.
	 *
	 * Both `allOn` and `selected` are derived, so reading either INSIDE the loop re-evaluates it
	 * against the toggle just made: the condition flipped after the first entry and every later one
	 * was skipped, so a click moved exactly one file instead of the group. Decide once, from a
	 * snapshot, then act.
	 */
	function toggleGroup() {
		const turningOff = allOn;
		const on = new Set(selected);
		for (const path of entries.map((e) => e.path)) {
			if (on.has(path) === turningOff) onToggle(path);
		}
	}
</script>

<div class="group text-surface-600-300 hover:bg-surface-200-800 flex items-center gap-1.5 rounded-base px-2 py-0.5 text-sm">
	<input
		type="checkbox"
		class="checkbox border-surface-400-600 accent-primary-500 size-3.5 shrink-0"
		checked={allOn}
		indeterminate={anyOn && !allOn}
		onchange={toggleGroup}
		aria-label={label}
	/>
	<button class="flex min-w-0 flex-1 items-center gap-1.5 text-left" onclick={onToggleOpen}>
		{#if open}<ChevronDown class="size-3.5 shrink-0" />{:else}<ChevronRight class="size-3.5 shrink-0" />{/if}
		<span class="truncate font-medium">{label}</span>
		<!-- plain dim text, not a filled pill: the pill inherited the row's muted colour and the
		     digit inside it was barely legible -->
		<span class="text-surface-500 shrink-0 text-xs tabular-nums">{entries.length}</span>
	</button>
	{#if action}{@render action()}{/if}
</div>

{#if open}
	<div class="ml-3">
		<ChangeRows changes={entries} {selected} {relPath} {baseName} {dirName} {onToggle} {onOpenDiff} {onDiscard} />
	</div>
{/if}
