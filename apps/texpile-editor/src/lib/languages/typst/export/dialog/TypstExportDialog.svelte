<script lang="ts">
	// Export the main Typst document as PDF, PNG, SVG or HTML, through the language server's tinymist.
	// The options are the dialog's; where the files go is the platform dialog's, asked on Export.
	import { FileOutput } from '@lucide/svelte';
	import Modal from '$lib/modals/Modal.svelte';
	import ModalActions from '$lib/modals/ModalActions.svelte';
	import { basename } from '$lib/workspace/fileSystem';
	import { mainFile } from '$lib/workspace/workspaceStore';
	import ExportPdfOptions from './ExportPdfOptions.svelte';
	import ExportImageOptions from './ExportImageOptions.svelte';
	import { EXPORT_FORMATS, exportDestination, exportProblems } from '../exportOptions';
	import { exportStem } from '../exportCommand';
	import { ROW, ROW_HEAD, SEGMENT, segmentClass } from './exportDialogStyles';
	import { typstExport } from './typstExportState.svelte';
	import type { TypstExportOptions } from '../exportOptions.types';
	import { m } from '$lib/paraglide/messages';

	const options = $derived(typstExport.options);
	const problems = $derived(exportProblems(options));
	const main = $derived(mainFile.current ?? '');

	function change(patch: Partial<TypstExportOptions>): void {
		typstExport.update(patch);
	}

	/** what happens on Export, said before it does: one file, or a folder of numbered pages */
	const destinationNote = $derived(
		exportDestination(options) === 'folder'
			? m.typst_export_to_folder({ name: `${exportStem(main)}-1.${options.format}`, next: `${exportStem(main)}-2.${options.format}` })
			: m.typst_export_to_file()
	);
</script>

{#if typstExport.open}
	<Modal
		title={m.typst_export_title()}
		icon={FileOutput}
		card="max-h-full max-w-lg overflow-y-auto p-5"
		onClose={() => typstExport.hide()}
		onEnter={() => void typstExport.run()}
	>
		<div class={ROW}>
			<div class={ROW_HEAD}>
				<span class="text-sm font-medium">{m.typst_export_format()}</span>
				<div class={SEGMENT} role="radiogroup" aria-label={m.typst_export_format()}>
					{#each EXPORT_FORMATS as format (format)}
						<button
							type="button"
							role="radio"
							aria-checked={options.format === format}
							class={segmentClass(options.format === format)}
							onclick={() => change({ format })}
						>
							{format.toUpperCase()}
						</button>
					{/each}
				</div>
			</div>
			<p class="text-muted mt-1 text-xs">
				{m.typst_export_main_pre()}
				<code class="bg-surface-200-800 rounded-base px-1">{basename(main)}</code>{m.typst_export_main_post()}
			</p>
		</div>

		{#if options.format === 'html'}
			<div class={ROW}>
				<p class="text-muted text-xs">{m.typst_export_html_note()}</p>
			</div>
		{:else}
			<div class={ROW}>
				<div class={ROW_HEAD}>
					<label class="text-sm font-medium" for="typst-export-pages">{m.typst_export_pages()}</label>
					<input
						id="typst-export-pages"
						class="input w-48 py-1 text-sm"
						placeholder={m.typst_export_pages_all()}
						value={options.pages}
						oninput={(e) => change({ pages: e.currentTarget.value })}
						autocomplete="off"
						spellcheck="false"
					/>
				</div>
				<p class="{problems.includes('pages') ? 'text-error-ink' : 'text-muted'} mt-1 text-xs">{m.typst_export_pages_hint()}</p>
			</div>
		{/if}

		{#if options.format === 'pdf'}
			<ExportPdfOptions {options} onchange={change} />
		{:else if options.format === 'png' || options.format === 'svg'}
			<ExportImageOptions {options} ppiInvalid={problems.includes('ppi')} fillInvalid={problems.includes('fill')} onchange={change} />
		{/if}

		<p class="text-muted pt-3 text-xs">{destinationNote}</p>

		{#if typstExport.error}
			<!-- tinymist's own words, reworded where they were a Rust dump; the compiler's source excerpt keeps its layout -->
			<pre
				class="text-error-ink bg-surface-100-900 rounded-container mt-3 max-h-40 overflow-auto p-3 font-mono text-xs whitespace-pre-wrap"
				role="alert">{typstExport.error}</pre>
		{/if}

		<ModalActions
			class="mt-4"
			size="xs"
			buttons={[
				// closing does not stop a running export: it finishes, and says so in a toast
				{ label: typstExport.busy ? m.modal_close_aria() : m.wsview_cancel_label(), role: 'cancel', onclick: () => typstExport.hide() },
				{
					label: m.typst_export_button(),
					role: 'primary',
					busy: typstExport.busy,
					disabled: problems.length > 0,
					onclick: () => void typstExport.run()
				}
			]}
		/>
	</Modal>
{/if}
