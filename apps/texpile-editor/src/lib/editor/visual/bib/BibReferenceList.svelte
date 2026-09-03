<script lang="ts">
	// The reference rows on the manager's left: author/title/year summary, a raw badge for
	// entries that only edit as CM text, and per-row delete.
	import { tip } from '$lib/components/tooltip.svelte';
	import { AlertTriangle, Code, Trash2 } from '@lucide/svelte';
	import { fitsVisualEditor, type BiblatexReference } from '$lib/languages/bib/biblatex';
	import { validateEntry } from '$lib/languages/bib/bibValidate';
	import { bibProblemText } from '$lib/languages/bib/bibProblemText';
	import { m } from '$lib/paraglide/messages';

	// one walk per row per render; a bibliography is short and the check is a few set lookups
	const problemsOf = (ref: BiblatexReference) =>
		validateEntry(
			ref.entrytype,
			Object.entries(ref)
				.filter(([, v]) => typeof v === 'string' && v.trim().length > 0)
				.map(([k]) => k)
		);

	let {
		refs,
		selectedKey,
		onEdit,
		onDelete
	}: {
		refs: BiblatexReference[];
		/** the key being edited, so its row stays highlighted */
		selectedKey: string | null;
		onEdit: (ref: BiblatexReference) => void;
		onDelete: (key: string) => void;
	} = $props();
</script>

{#if refs.length === 0}
	<li class="text-muted flex h-40 items-center justify-center rounded-container border border-dashed text-sm">
		{m.bib_no_references_empty()}
	</li>
{:else}
	{#each refs as ref (ref.key)}
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_click_events_have_key_events -->
		<li
			class="mb-2 flex cursor-pointer items-center justify-between gap-2 rounded-container border p-3 transition-colors {ref.key ===
			selectedKey
				? 'border-primary-500 bg-primary-500/15 '
				: 'border-surface-200-800 hover:bg-surface-100-900'}"
			onclick={() => onEdit(ref)}
		>
			<div class="pointer-events-none min-w-0 flex-1">
				<div class="truncate text-sm font-semibold">{ref.author || m.bib_unknown_author_placeholder()}</div>
				<div class="text-muted truncate text-xs">{ref.title || m.bib_untitled_placeholder()}</div>
				<div class="text-muted mt-1 flex items-center gap-2 text-xs">
					<!-- date is biblatex's spelling and year the older one; a row showing "No year"
					     next to date = {1843} was reading only half the document -->
					<span>{ref.year || ref.date || m.bib_no_year_placeholder()}</span>
					<span>•</span>
					<code class="text-xs">{ref.key}</code>
					{#if problemsOf(ref).length > 0}
						<!-- what the entry would be reported for, where the entries are actually read:
						     a warning only in the edit form is one nobody goes looking for -->
						<span
							class="text-warning-ink inline-flex items-center gap-0.5 text-[10px]"
							use:tip={problemsOf(ref).map(bibProblemText).join('\n')}
						>
							<AlertTriangle class="size-2.5" />
							{problemsOf(ref).length}
						</span>
					{/if}
					{#if !fitsVisualEditor(ref)}
						<!-- raw badge: this row edits as raw CM -->
						<span
							class="border-surface-300-700 text-muted inline-flex items-center gap-0.5 rounded-base border px-1 py-px text-[10px]"
							use:tip={m.bib_raw_badge_list_tooltip()}
						>
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
