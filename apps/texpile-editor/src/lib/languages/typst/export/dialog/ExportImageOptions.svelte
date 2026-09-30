<script lang="ts">
	// The image lanes of the export dialog: resolution and background for PNG, one image or one file
	// per page for both PNG and SVG.
	import { MAX_PPI, MIN_PPI } from '../exportOptions';
	import { ROW, ROW_HEAD, SEGMENT, segmentClass } from './exportDialogStyles';
	import type { TypstExportOptions } from '../exportOptions.types';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		options: TypstExportOptions;
		ppiInvalid: boolean;
		fillInvalid: boolean;
		onchange: (patch: Partial<TypstExportOptions>) => void;
	};
	let { options, ppiInvalid, fillInvalid, onchange }: Props = $props();

	const png = $derived(options.format === 'png');
</script>

{#if png}
	<div class={ROW}>
		<div class={ROW_HEAD}>
			<label class="text-sm font-medium" for="typst-export-ppi">{m.typst_export_ppi()}</label>
			<span class="flex items-center gap-2 text-sm">
				<input
					id="typst-export-ppi"
					type="number"
					class="input w-24 py-1 text-sm"
					min={MIN_PPI}
					max={MAX_PPI}
					step="1"
					value={options.ppi}
					oninput={(e) => onchange({ ppi: e.currentTarget.valueAsNumber })}
				/>
				<span class="text-muted">PPI</span>
			</span>
		</div>
		<p class="{ppiInvalid ? 'text-error-ink' : 'text-muted'} mt-1 text-xs">
			{ppiInvalid ? m.typst_export_ppi_invalid({ min: MIN_PPI, max: MAX_PPI }) : m.typst_export_ppi_hint()}
		</p>
	</div>
{/if}

<div class={ROW}>
	<div class={ROW_HEAD}>
		<span class="text-sm font-medium">{m.typst_export_layout()}</span>
		<div class={SEGMENT} role="radiogroup" aria-label={m.typst_export_layout()}>
			<button
				type="button"
				role="radio"
				aria-checked={options.merge}
				class={segmentClass(options.merge)}
				onclick={() => onchange({ merge: true })}
			>
				{m.typst_export_merged()}
			</button>
			<button
				type="button"
				role="radio"
				aria-checked={!options.merge}
				class={segmentClass(!options.merge)}
				onclick={() => onchange({ merge: false })}
			>
				{m.typst_export_per_page()}
			</button>
		</div>
	</div>
</div>

<!-- only a merged image has a canvas of its own: a page on its own renders on its own ground -->
{#if png && options.merge}
	<div class={ROW}>
		<div class={ROW_HEAD}>
			<span class="text-sm font-medium">{m.typst_export_background()}</span>
			<div class="flex items-center gap-2">
				<div class={SEGMENT} role="radiogroup" aria-label={m.typst_export_background()}>
					<button
						type="button"
						role="radio"
						aria-checked={!options.fill}
						class={segmentClass(!options.fill)}
						onclick={() => onchange({ fill: '' })}
					>
						{m.typst_export_background_none()}
					</button>
					<button
						type="button"
						role="radio"
						aria-checked={!!options.fill}
						class={segmentClass(!!options.fill)}
						onclick={() => onchange({ fill: options.fill || '#ffffff' })}
					>
						{m.typst_export_background_color()}
					</button>
				</div>
				{#if options.fill}
					<input
						type="color"
						class="input h-7 w-10 cursor-pointer p-0.5"
						value={options.fill}
						oninput={(e) => onchange({ fill: e.currentTarget.value })}
						aria-label={m.typst_export_background_color()}
					/>
				{/if}
			</div>
		</div>
		<p class="{fillInvalid ? 'text-error-ink' : 'text-muted'} mt-1 text-xs">{m.typst_export_background_hint()}</p>
	</div>
{/if}
