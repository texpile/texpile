<script lang="ts">
	// The empty-folder starter grid, split by typesetter.
	//
	// The tab is not a preference, and nothing remembers it: it only chooses which starters are on
	// screen. What a starter creates decides everything downstream, because its main file's extension
	// is what selects the compiler.
	import { STARTERS, type Starter, type ImportedFile } from '$lib/workspace/starters';
	import { FileText, FilePlus, FolderInput } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages';

	let {
		onPick,
		onBlank,
		onImport,
		busy = false,
		lang = $bindable('latex')
	}: {
		onPick: (s: Starter) => void;
		onBlank?: () => void;
		/** "Import your own" card: existing text files the user picked, to seed the folder with. */
		onImport?: (files: ImportedFile[]) => void;
		busy?: boolean;
		/** the open tab, bound out so the heading above can name the right extension */
		lang?: 'latex' | 'typst';
	} = $props();

	// LaTeX and Typst are product names, so they are not translated
	const TABS = [
		{ id: 'latex', label: 'LaTeX' },
		{ id: 'typst', label: 'Typst' }
	] as const;

	const shown = $derived(STARTERS.filter((s) => s.lang === lang));
	// Both are .tex-only: the importer looks for a \begin{document} to pick its main file, and the
	// blank link creates main.tex. Offering either under Typst would hand back a LaTeX project.
	const isLatex = $derived(lang === 'latex');

	// the segmented-control classes the compile dialog and Preferences use for an exclusive choice
	function seg(active: boolean) {
		return `rounded-base px-3 py-1 text-sm ${active ? 'bg-surface-50-950 font-medium shadow-sm' : 'text-muted hover:text-surface-950-50'}`;
	}

	let importInput = $state<HTMLInputElement>();
	async function onFilesPicked(e: Event) {
		const input = e.target as HTMLInputElement;
		const picked = [...(input.files ?? [])];
		input.value = '';
		if (!picked.length) return;
		// text formats only; read in place, nothing is uploaded
		const files = await Promise.all(picked.map(async (f) => ({ name: f.name, content: await f.text() })));
		onImport?.(files);
	}
</script>

<div class="w-full">
	<div class="mb-3 flex justify-center">
		<div class="bg-surface-200-800 rounded-base flex shrink-0 gap-1 p-0.5">
			{#each TABS as t (t.id)}
				<button type="button" class={seg(lang === t.id)} disabled={busy} onclick={() => (lang = t.id)}>
					{t.label}
				</button>
			{/each}
		</div>
	</div>

	<div class="grid gap-2 sm:grid-cols-2">
		{#each shown as s (s.id)}
			<button
				class="border-surface-200-800 hover:border-primary-500 hover:bg-surface-100-900 rounded-container flex flex-col gap-1 border p-3 text-left transition-colors disabled:opacity-50"
				disabled={busy}
				onclick={() => onPick(s)}
			>
				<span class="flex items-center gap-2 font-medium"><FileText class="text-primary-ink size-4 shrink-0" /> {s.name}</span>
				<span class="text-muted text-xs">{s.description}</span>
			</button>
		{/each}
		{#if onImport && isLatex}
			<button
				class="border-surface-200-800 hover:border-primary-500 hover:bg-surface-100-900 rounded-container flex flex-col gap-1 border p-3 text-left transition-colors disabled:opacity-50 sm:col-span-2"
				disabled={busy}
				onclick={() => importInput?.click()}
			>
				<span class="flex items-center gap-2 font-medium"
					><FolderInput class="text-primary-ink size-4 shrink-0" /> {m.starter_import_own()}</span
				>
				<span class="text-muted text-xs">{m.starter_import_description()}</span>
			</button>
			<input bind:this={importInput} type="file" multiple accept=".tex,.bib,.cls,.sty,.bst" class="hidden" onchange={onFilesPicked} />
		{/if}
	</div>
	{#if onBlank && isLatex}
		<button
			class="text-muted hover:text-surface-950-50 mt-3 inline-flex items-center gap-1.5 text-sm disabled:opacity-50"
			disabled={busy}
			onclick={onBlank}
		>
			<FilePlus class="size-4" />
			{m.starter_blank_file()}
		</button>
	{/if}
</div>
