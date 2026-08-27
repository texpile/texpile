<!-- visual .bib editor: reference list + add/edit form. value is the raw .bib text;
  every change re-serialises and flows back through onInput -->
<script lang="ts">
	import { Pencil, Code } from '@lucide/svelte';
	import { generateLabel } from '$lib/editor/visual/label';
	import {
		type BiblatexReference,
		type BibToken,
		biblatexReferenceSchema,
		parseBibtexWithWarnings,
		parseSingleEntry,
		serializeBibtex,
		fitsVisualEditor,
		getEntryTypeOptions,
		isKeyUnique as checkKeyUnique
	} from '$lib/languages/bib/biblatex';
	import type { ZodIssue } from 'zod';
	import { referenceStore } from '$lib/stores/editorStore';
	import CodeMirrorLatex from '$lib/components/CodeMirrorLatex.svelte';
	import { m } from '$lib/paraglide/messages';
	import BibEntryForm from './BibEntryForm.svelte';
	import BibReferenceList from './BibReferenceList.svelte';

	let {
		value = '',
		onInput,
		publishReferences = true
	}: { value?: string; onInput?: (v: string) => void; publishReferences?: boolean } = $props();

	// refs = entries, tokens = file-order stream for round-trip, parseError switches to whole-file raw mode
	let refs = $state<BiblatexReference[]>([]);
	let tokens = $state<BibToken[]>([]);
	let parseError = $state<string | null>(null);
	// initial value by design; the $effect below re-parses on later external changes
	// svelte-ignore state_referenced_locally
	let lastSerialized = $state(value);

	function reparse(text: string) {
		const result = parseBibtexWithWarnings(text);
		refs = result.entries;
		tokens = result.tokens;
		parseError = result.parseError ?? null;
	}
	// svelte-ignore state_referenced_locally
	reparse(value);

	// re-parse external changes, unless it's text we just produced ourselves
	$effect(() => {
		const v = value;
		if (v !== lastSerialized) {
			reparse(v);
			lastSerialized = v;
		}
	});

	let currentReference: Partial<BiblatexReference> = $state({});
	let isEditing = $state(false);
	let editMode = $state<'form' | 'raw'>('form');
	let originalKey: string | null = $state(null);
	let formErrors: Record<string, string[]> = $state({});
	let bibtexContent = $state('');
	let bibtexWarnings = $state<{ key: string; issues: string[] }[]>([]);
	let rawEntryText = $state('');
	let rawEntryError = $state<string | null>(null);
	let fileRawText = $state('');
	let fileRawError = $state<string | null>(null);

	// sync the whole-file CM buffer when entering file-raw mode
	$effect(() => {
		if (parseError) fileRawText = value;
	});

	const entryTypeOptions = getEntryTypeOptions();

	function isKeyUnique(k: string) {
		return checkKeyUnique(k, refs, originalKey ?? undefined);
	}

	$effect(() => {
		if (!isEditing && !currentReference.key && currentReference.entrytype) currentReference.key = generateLabel('citation');
	});

	// reserialise via the token stream (preserves comments, @String, order); new refs without
	// a token get a synthetic one appended so the serializer emits them
	function commit() {
		const knownKeys = new Set<string>();
		for (const t of tokens) if (t.kind === 'entry') knownKeys.add(t.entry.citationKey);
		const appended: BibToken[] = [];
		for (const ref of refs) {
			if (!knownKeys.has(ref.key)) {
				appended.push({
					kind: 'entry',
					entry: { citationKey: ref.key, entryType: ref.entrytype, entryTags: {} },
					raw: '',
					hasInlineComment: false
				});
			}
		}
		if (appended.length) tokens = [...tokens, ...appended];

		const refsByKey = new Map(refs.map((r) => [r.key, r]));
		const text = serializeBibtex(tokens, refsByKey);
		lastSerialized = text;
		if (publishReferences) referenceStore.current = [...refs];
		onInput?.(text);
	}

	function mapIssues(issues: ZodIssue[]) {
		const out: Record<string, string[]> = {};
		for (const i of issues) {
			const msg =
				i.code === 'invalid_type'
					? m.bib_error_required_field()
					: String(i.message)
							.replace(/received.+/i, '')
							.trim();
			(out[(i.path[0] as string) || 'form'] ||= []).push(msg);
		}
		return out;
	}

	function resetForm() {
		currentReference = {};
		isEditing = false;
		editMode = 'form';
		formErrors = {};
		originalKey = null;
		rawEntryText = '';
		rawEntryError = null;
	}

	// entries the form can render losslessly get the pretty form; anything with unknown
	// fields/types or an in-entry comment gets raw CM so nothing is silently lost
	function editReference(r: BiblatexReference) {
		originalKey = r.key;
		isEditing = true;
		formErrors = {};
		rawEntryError = null;

		if (fitsVisualEditor(r)) {
			editMode = 'form';
			// strip internal bookkeeping fields so they don't land in the form inputs
			const ref: BiblatexReference = { ...r };
			delete ref.raw;
			delete ref.displayLabel;
			delete ref.hasInlineComment;
			currentReference = ref;
		} else {
			editMode = 'raw';
			// prefer original source bytes (comments/spacing survive); regenerate for brand-new entries
			rawEntryText = r.raw ?? renderReferenceAsBibText(r);
			currentReference = { key: r.key, entrytype: r.entrytype };
		}
	}

	function saveReference() {
		formErrors = {};
		const parsed = biblatexReferenceSchema.safeParse(currentReference);
		if (!parsed.success) {
			formErrors = mapIssues(parsed.error.issues);
			return;
		}
		const entry = parsed.data as BiblatexReference;
		if (!isKeyUnique(entry.key)) {
			formErrors.key = [m.bib_error_key_unique()];
			return;
		}
		if (isEditing && originalKey) refs = refs.map((r) => (r.key === originalKey ? entry : r));
		else refs = [...refs, entry];
		commit();
		resetForm();
	}

	// re-parse the CM text as a single entry; on failure keep the CM open with an inline error
	function saveRawEntry() {
		rawEntryError = null;
		const parsed = parseSingleEntry(rawEntryText);
		if ('error' in parsed) {
			rawEntryError = parsed.error;
			return;
		}
		if (parsed.entry.key !== originalKey && !isKeyUnique(parsed.entry.key)) {
			rawEntryError = m.bib_error_key_unique();
			return;
		}
		if (isEditing && originalKey) refs = refs.map((r) => (r.key === originalKey ? parsed.entry : r));
		else refs = [...refs, parsed.entry];
		commit();
		resetForm();
	}

	// whole .bib failed to parse; on a clean re-parse drop back to the normal split-pane UI
	function saveFileRaw() {
		fileRawError = null;
		const result = parseBibtexWithWarnings(fileRawText);
		if (result.parseError) {
			fileRawError = result.parseError;
			return;
		}
		refs = result.entries;
		tokens = result.tokens;
		parseError = null;
		lastSerialized = fileRawText;
		if (publishReferences) referenceStore.current = [...refs];
		onInput?.(fileRawText);
	}

	function renderReferenceAsBibText(ref: BiblatexReference): string {
		// fallback when ref.raw is missing (brand-new entry); skips internal bookkeeping fields
		const internal = new Set(['key', 'entrytype', 'raw', 'displayLabel', 'hasInlineComment']);
		const lines: string[] = [`@${ref.entrytype}{${ref.key},`];
		for (const [k, v] of Object.entries(ref)) {
			if (internal.has(k) || v === undefined || v === '') continue;
			lines.push(`    ${k} = {${v}},`);
		}
		lines.push('}');
		return lines.join('\n');
	}

	function deleteReference(key: string) {
		refs = refs.filter((r) => r.key !== key);
		commit();
		if (currentReference.key === key) resetForm();
	}

	function importBibtex() {
		bibtexWarnings = [];
		if (!bibtexContent.trim()) return;
		const result = parseBibtexWithWarnings(bibtexContent);
		if (result.parseError) {
			bibtexWarnings = [{ key: m.bib_parse_error_label(), issues: [result.parseError] }];
			return;
		}
		if (result.warnings.length) bibtexWarnings = result.warnings;
		const fresh = result.entries.filter((r) => isKeyUnique(r.key));
		if (fresh.length) {
			refs = [...refs, ...fresh];
			commit();
			bibtexContent = '';
		}
	}
</script>

{#if parseError}
	<!-- file-level parse failure: edit the whole .bib as raw CM until it parses cleanly -->
	<div class="mx-auto flex h-full max-w-5xl flex-col gap-3 p-4">
		<div class="border-error-500 bg-error-500/10 rounded border p-3 text-sm">
			<div class="mb-1 flex items-center gap-2 font-semibold">
				<Code class="size-4" />
				{m.bib_parse_syntax_error_title()}
			</div>
			<div class="text-error-600-400 text-xs">{parseError}</div>
			<div class="text-surface-600-400 mt-2 text-xs">
				{m.bib_parse_syntax_error_hint()}
			</div>
		</div>
		<div class="min-h-0 flex-1 overflow-hidden rounded border border-surface-200-800">
			<CodeMirrorLatex bind:value={fileRawText} language="bibtex" />
		</div>
		{#if fileRawError}
			<p class="text-error-500 text-sm">{fileRawError}</p>
		{/if}
		<div class="flex justify-end gap-2">
			<button class="btn hover:preset-tonal" type="button" onclick={() => (fileRawText = value)}>{m.bib_reset_button()}</button>
			<button class="btn preset-filled-primary-500" type="button" onclick={saveFileRaw}>{m.bib_save_button()}</button>
		</div>
	</div>
{:else}
	<div class="mx-auto flex h-full max-w-5xl gap-4 p-4">
		<div class="w-1/2 overflow-y-auto pr-2">
			<button class="btn preset-outlined-primary-500 hover:preset-tonal mb-3 w-full" type="button" onclick={resetForm}
				>{m.bib_new_reference_button()}</button
			>
			<ul>
				<BibReferenceList
					{refs}
					selectedKey={isEditing ? (currentReference.key ?? null) : null}
					onEdit={editReference}
					onDelete={deleteReference}
				/>
			</ul>
		</div>

		<div class="border-surface-200-800 w-1/2 overflow-y-auto border-l pl-4">
			<div class="mb-2 flex items-center gap-2 text-base font-semibold">
				{#if isEditing}
					<Pencil class="size-4" />
					{m.bib_editing_heading({ key: currentReference.key ?? '' })}
					{#if editMode === 'raw'}
						<span
							class="border-surface-300-700 text-surface-500 ml-1 inline-flex items-center gap-0.5 rounded border px-1 py-px text-[10px]"
							title={m.bib_raw_badge_edit_tooltip()}
						>
							<Code class="size-2.5" />
							{m.bib_raw_badge_text()}
						</span>
					{/if}
				{:else}{m.bib_new_reference_heading()}{/if}
			</div>

			{#if editMode === 'raw'}
				<div class="border-surface-200-800 min-h-[16rem] overflow-hidden rounded border">
					<CodeMirrorLatex bind:value={rawEntryText} language="bibtex" />
				</div>
				{#if rawEntryError}
					<p class="text-error-500 mt-2 text-sm">{rawEntryError}</p>
				{/if}
				<div class="mt-3 flex justify-end gap-2">
					<button class="btn hover:preset-tonal" type="button" onclick={resetForm}>{m.bib_cancel_button()}</button>
					<button class="btn preset-filled-primary-500" type="button" onclick={saveRawEntry}>{m.bib_update_reference_button()}</button>
				</div>
			{:else}
				<BibEntryForm bind:currentReference {formErrors} {entryTypeOptions} {isEditing} onSave={saveReference} onCancel={resetForm} />
			{/if}

			{#if !isEditing}
				<div class="border-surface-200-800 mt-4 border-t pt-4">
					<div class="text-sm font-semibold">{m.bib_paste_bibtex_heading()}</div>
					<textarea
						class="input mt-1 w-full font-mono text-xs"
						rows="5"
						bind:value={bibtexContent}
						placeholder={m.bib_paste_bibtex_placeholder()}></textarea>
					{#if bibtexWarnings.length}
						<div class="border-warning-500 bg-warning-500/10 mt-2 rounded border p-2 text-xs">
							{#each bibtexWarnings as w (w.key)}<div><strong>{w.key}:</strong> {w.issues.join(', ')}</div>{/each}
						</div>
					{/if}
					<div class="mt-2 flex justify-end">
						<button class="btn btn-xs preset-outlined-primary-500 hover:preset-tonal" type="button" onclick={importBibtex}
							>{m.bib_import_button()}</button
						>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}
