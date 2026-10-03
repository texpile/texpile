<script lang="ts">
	// The PDF lane of the export dialog: which standard to conform to, PDF/UA, and tags.
	import { PDF_ARCHIVAL, PDF_VERSIONS, tagsRequired, uaConflicts } from '../exportOptions';
	import { ROW, ROW_HEAD, pdfStandardLabel } from './exportDialogStyles';
	import type { PdfStandardChoice, TypstExportOptions } from '../exportOptions.types';
	import { m } from '$lib/paraglide/messages';

	type Props = { options: TypstExportOptions; onchange: (patch: Partial<TypstExportOptions>) => void };
	let { options, onchange }: Props = $props();

	const forcedTags = $derived(tagsRequired(options));
</script>

<div class={ROW}>
	<div class={ROW_HEAD}>
		<label class="text-sm font-medium" for="typst-export-standard">{m.typst_export_pdf_standard()}</label>
		<select
			id="typst-export-standard"
			class="select w-48 text-sm"
			value={options.pdfStandard}
			onchange={(e) => onchange({ pdfStandard: e.currentTarget.value as PdfStandardChoice })}
		>
			<option value="">{pdfStandardLabel('')}</option>
			<optgroup label={m.typst_export_pdf_versions()}>
				{#each PDF_VERSIONS as choice (choice)}<option value={choice}>{pdfStandardLabel(choice)}</option>{/each}
			</optgroup>
			<optgroup label={m.typst_export_pdf_archival()}>
				{#each PDF_ARCHIVAL as choice (choice)}<option value={choice}>{pdfStandardLabel(choice)}</option>{/each}
			</optgroup>
		</select>
	</div>
	<p class="text-muted mt-1 text-xs">{m.typst_export_pdf_standard_hint()}</p>
</div>

<div class={ROW}>
	<label class="flex cursor-pointer items-center gap-1.5 text-sm font-medium">
		<input
			type="checkbox"
			class="checkbox scale-75"
			checked={options.pdfUa}
			onchange={(e) => onchange({ pdfUa: e.currentTarget.checked })}
		/>
		{m.typst_export_pdf_ua()}
	</label>
	{#if uaConflicts(options)}
		<p class="text-error-ink mt-1 text-xs">{m.typst_export_pdf_ua_conflict()}</p>
	{:else}
		<p class="text-muted mt-1 text-xs">{m.typst_export_pdf_ua_hint()}</p>
	{/if}
</div>

<div class={ROW}>
	<label class="flex cursor-pointer items-center gap-1.5 text-sm font-medium">
		<input
			type="checkbox"
			class="checkbox scale-75"
			checked={options.pdfTagged || forcedTags}
			disabled={forcedTags}
			onchange={(e) => onchange({ pdfTagged: e.currentTarget.checked })}
		/>
		{m.typst_export_pdf_tagged()}
	</label>
	<p class="text-muted mt-1 text-xs">{forcedTags ? m.typst_export_pdf_tagged_required() : m.typst_export_pdf_tagged_hint()}</p>
</div>
