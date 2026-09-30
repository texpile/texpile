<script lang="ts">
	// The empty-folder starter grid, split by typesetter.
	//
	// The tab is not a preference, and nothing remembers it: it only chooses which starters are on
	// screen. What a starter creates decides everything downstream, because its main file's extension
	// is what selects the compiler.
	import { onDestroy, onMount } from 'svelte';
	import { STARTERS, type ImportedFile } from '$lib/workspace/starters';
	import { FileText, FilePlus, FolderInput, Globe } from '@lucide/svelte';
	import StarterCard from '$lib/workspace/templates/StarterCard.svelte';
	import UserTemplateCard from '$lib/workspace/templates/saved/UserTemplateCard.svelte';
	import UniverseGalleryDialog from '$lib/workspace/templates/universe/UniverseGalleryDialog.svelte';
	import { refreshUserTemplates, userTemplates } from '$lib/workspace/templates/saved/userTemplateList';
	import { userTemplatesAvailable } from '$lib/workspace/templates/templateBridge';
	import { universeGallery } from '$lib/workspace/templates/universe/universeGallery.svelte';
	import type { StarterChoice } from '$lib/workspace/templates/starterChoice';
	import { m } from '$lib/paraglide/messages';

	let {
		onPick,
		onBlank,
		onImport,
		busy = false,
		lang = $bindable('latex')
	}: {
		onPick: (choice: StarterChoice) => void;
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
	const saved = $derived(userTemplates.current.filter((t) => t.lang === lang));
	// Both are .tex-only: the importer looks for a \begin{document} to pick its main file, and the
	// blank link creates main.tex. Offering either under Typst would hand back a LaTeX project.
	const isLatex = $derived(lang === 'latex');
	// the saved templates and the gallery both live in the desktop app's main process
	const desktop = userTemplatesAvailable();

	onMount(() => void refreshUserTemplates());
	// the gallery's state outlives this screen, which a folder switch can take away while it is open
	onDestroy(() => universeGallery.hide());

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
			<StarterCard
				icon={FileText}
				title={s.name}
				description={s.description}
				disabled={busy}
				onclick={() => onPick({ kind: 'bundled', starter: s })}
			/>
		{/each}
		{#if desktop && !isLatex}
			<StarterCard
				icon={Globe}
				title={m.starter_gallery_open()}
				description={m.starter_gallery_description()}
				disabled={busy}
				onclick={() => universeGallery.show((template) => onPick({ kind: 'universe', template }))}
			/>
		{/if}
		{#if onImport && isLatex}
			<StarterCard
				icon={FolderInput}
				title={m.starter_import_own()}
				description={m.starter_import_description()}
				disabled={busy}
				wide
				onclick={() => importInput?.click()}
			/>
			<input bind:this={importInput} type="file" multiple accept=".tex,.bib,.cls,.sty,.bst" class="hidden" onchange={onFilesPicked} />
		{/if}
	</div>

	{#if saved.length}
		<h3 class="text-muted mt-5 mb-2 text-xs font-semibold tracking-wider uppercase">{m.starter_your_templates()}</h3>
		<div class="grid gap-2 sm:grid-cols-2">
			{#each saved as t (t.id)}
				<UserTemplateCard template={t} disabled={busy} onPick={() => onPick({ kind: 'saved', template: t })} />
			{/each}
		</div>
	{/if}

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

<UniverseGalleryDialog />
