<script lang="ts">
	// the start screen of a folder with no documents
	import StarterPicker from '$lib/workspace/StarterPicker.svelte';
	import type { ImportedFile } from '$lib/workspace/starters';
	import type { StarterChoice } from '$lib/workspace/templates/starterChoice';
	import { m } from '$lib/paraglide/messages';

	type NewDocumentStartProps = {
		onPick: (choice: StarterChoice) => void;
		onBlank: () => void;
		onImport: (files: ImportedFile[]) => void;
		busy: boolean;
	};

	const props: NewDocumentStartProps = $props();

	/** deliberately not persisted: it is a view of the templates, not a setting */
	let lang = $state<'latex' | 'typst'>('latex');
</script>

<div class="mx-auto max-w-xl px-6 pt-16 pb-16">
	<div class="text-center">
		<h2 class="text-lg font-semibold">{m.wsview_start_new_doc_heading()}</h2>
		<p class="text-muted mt-1 text-sm">
			<!-- follows the open tab: telling someone reading the Typst templates that this folder
			     has no .tex files in it is true and useless -->
			{m.wsview_start_new_doc_desc_pre()} <code>{lang === 'typst' ? '.typ' : '.tex'}</code>
			{m.wsview_start_new_doc_desc_post()}
		</p>
	</div>
	<div class="mt-6">
		<StarterPicker onPick={props.onPick} onBlank={props.onBlank} onImport={props.onImport} busy={props.busy} bind:lang />
	</div>
</div>
