<script lang="ts">
	// The reference rows on the manager's left: author/title/year summary, a raw badge for
	// entries that only edit as CM text, and per-row delete.
	import { tip } from '$lib/components/tooltip.svelte';
	import { AlertTriangle, Code, Trash2 } from '@lucide/svelte';
	import {
		bibDisplayText,
		bibProblemText,
		fitsVisualEditor,
		sameWorkIn,
		validateEntry,
		type BibProblem,
		type BiblatexReference
	} from '$lib/languages/bib/biblatex';
	import type { CitedKeys } from '$lib/workspace/document/citedKeys';
	import { m } from '$lib/paraglide/messages';

	let {
		refs,
		selectedKey,
		cited = null,
		onEdit,
		onDelete
	}: {
		refs: BiblatexReference[];
		/** the key being edited, so its row stays highlighted */
		selectedKey: string | null;
		/** what the folder's documents cite, or null when that is not known */
		cited?: CitedKeys | null;
		onEdit: (ref: BiblatexReference) => void;
		onDelete: (key: string) => void;
	} = $props();

	// entries for the same paper, by a DOI or arXiv number they share
	const twins = $derived(sameWorkIn(refs));

	// per row per render on purpose: a bibliography is short
	function problemsOf(ref: BiblatexReference): BibProblem[] {
		const own = validateEntry(
			ref.entrytype,
			Object.entries(ref)
				.filter(([, v]) => typeof v === 'string' && v.trim().length > 0)
				.map(([k]) => k)
		);
		return [...own, ...(twins.get(ref.key) ?? []).map((t): BibProblem => ({ kind: 'same-work', ...t }))];
	}

	// a key another entry names as its parent (crossref, xdata) is in by that entry's citation
	const named = $derived(
		new Set(
			refs.flatMap((r) =>
				['crossref', 'xref', 'xdata', 'related']
					.flatMap((f) => (typeof r[f] === 'string' ? (r[f] as string).split(',') : []))
					.map((k) => k.trim())
			)
		)
	);

	function uncited(ref: BiblatexReference): boolean {
		return !!cited && !cited.all && !cited.keys.has(ref.key) && !named.has(ref.key);
	}
</script>

{#if refs.length === 0}
	<li class="text-muted flex h-40 items-center justify-center rounded-container border border-dashed text-sm">
		{m.bib_no_references_empty()}
	</li>
{:else}
	{#each refs as ref (ref.key)}
		{@const problems = problemsOf(ref)}
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_click_events_have_key_events -->
		<li
			class="mb-2 flex cursor-pointer items-center justify-between gap-2 rounded-container border p-3 transition-colors {ref.key ===
			selectedKey
				? 'border-primary-500 bg-primary-tint '
				: 'border-surface-200-800 hover:bg-surface-wash'}"
			onclick={() => onEdit(ref)}
		>
			<div class="min-w-0 flex-1">
				<div class="truncate text-sm font-semibold">{bibDisplayText(ref.author) || m.bib_unknown_author_placeholder()}</div>
				<div class="text-muted truncate text-xs">{bibDisplayText(ref.title) || m.bib_untitled_placeholder()}</div>
				<!-- wraps, and the key truncates, so a narrow pane never scrolls sideways -->
				<div class="text-muted mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
					<!-- date is biblatex's spelling and year the older one; a row showing "No year"
					     next to date = {1843} was reading only half the document -->
					<span>{ref.year || ref.date || m.bib_no_year_placeholder()}</span>
					<span class="chip preset-outlined-surface-400-600 [--chip-size:var(--text-xs)] min-w-0 max-w-full font-mono">
						<span class="truncate">{ref.key}</span>
					</span>
					{#if problems.length > 0}
						<!-- what the entry would be reported for, where the entries are actually read:
						     a warning only in the edit form is one nobody goes looking for -->
						<span class="badge preset-tonal-warning gap-1" use:tip={problems.map(bibProblemText).join('\n')}>
							<AlertTriangle class="size-3" />
							{problems.length}
						</span>
					{/if}
					{#if uncited(ref)}
						<!-- a note, not a warning: an entry kept for later is a choice the bibliography will not print -->
						<span class="text-faint" use:tip={m.bib_not_cited_tooltip()}>{m.bib_not_cited()}</span>
					{/if}
					{#if !fitsVisualEditor(ref)}
						<!-- raw badge: this row edits as raw CM -->
						<span class="badge preset-outlined-surface-400-600 text-muted gap-1" use:tip={m.bib_raw_badge_list_tooltip()}>
							<Code class="size-2.5" />
							{m.bib_raw_badge_text()}
						</span>
					{/if}
				</div>
			</div>
			<button
				type="button"
				class="btn-icon btn-icon-xs hover:preset-tonal hover:text-error-ink shrink-0"
				onclick={(e) => {
					e.stopPropagation();
					onDelete(ref.key);
				}}
				use:tip={m.bib_delete_tooltip()}
			>
				<Trash2 class="size-4" />
			</button>
		</li>
	{/each}
{/if}
