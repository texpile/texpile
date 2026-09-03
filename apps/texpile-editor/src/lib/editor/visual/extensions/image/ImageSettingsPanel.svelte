<script lang="ts">
	// The image settings popover's content: size, caption/numbering toggles, column spanning,
	// and the LaTeX \label under Advanced. ImageOverlay owns the popover shell and trigger.
	import { tip } from '$lib/components/tooltip.svelte';
	import { ChevronDown, Info } from '@lucide/svelte';
	import type { EditorView } from 'prosemirror-view';
	import type { Node as PMNode } from 'prosemirror-model';
	import type { Dialect } from '$lib/editor/visual/dialect';
	import { sanitizeLabel } from '$lib/editor/visual/label';
	import { labelTaken } from '$lib/editor/visual/labelTaken';
	import { repointRefs } from '$lib/editor/visual/repointRefs';
	import { templateFeaturesStore } from '$lib/stores/editorStore';
	import { settings } from '$lib/settings';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		node: PMNode;
		view: EditorView;
		getPos: () => number | undefined;
		dialect: Dialect;
		/** the overlay element, for resolving the image and its column width */
		overlayElement: HTMLDivElement | undefined;
	};

	let { node, view, getPos, dialect, overlayElement }: Props = $props();
	// markdown has no width or figure-numbering syntax to write back, so those controls hide
	const latexControls = $derived(dialect === 'latex');

	// figure* spanning both columns is a LaTeX two-column-template feature; markdown has no
	// counterpart, and templateFeatures is never populated for an md doc anyway
	const columnSpanningEnabled = $derived(latexControls && (templateFeaturesStore.current?.columnSpanningFigures ?? false));

	let showAdvanced = $state(false);
	// first-paint snapshot by design: the $effect below re-syncs on node changes
	// svelte-ignore state_referenced_locally
	const initialAttrs = node.attrs;
	let labelInput = $state(initialAttrs.label || '');
	let numberedInput = $state(initialAttrs.numbered !== false);
	let showCaptionInput = $state(initialAttrs.showCaption !== false);
	let spanningInput = $state(initialAttrs.spanning === true);

	let originalTexpileLabel = $derived(node.attrs.label || '');

	// re-sync local state on external node changes
	$effect(() => {
		labelInput = node.attrs.label || '';
		numberedInput = node.attrs.numbered !== false;
		showCaptionInput = node.attrs.showCaption !== false;
		spanningInput = node.attrs.spanning === true;
	});

	function isTexpileManagedLabel(label: string | null): boolean {
		if (!label) return false;
		return label.startsWith('texpile-fig-');
	}

	function updateAttrs(attrs: Partial<typeof node.attrs>) {
		const pos = getPos();
		if (pos === undefined) return;

		const tr = view.state.tr.setNodeMarkup(pos, undefined, {
			...node.attrs,
			...attrs
		});
		// renaming the label follows every reference to it, in the same transaction (one undo
		// step). This panel had no such branch at all, in either dialect, so a renamed figure left
		// each \ref to it pointing at a name that no longer existed.
		if ('label' in attrs) repointRefs(tr, view.state.doc, String(node.attrs.label ?? ''), String(attrs.label ?? ''));
		view.dispatch(tr);
	}

	// size slider: width as a fraction of \textwidth
	const sizeStep = $derived(settings.current.figureResizeStep || 0.25);
	// fraction from a prior resize (width/maxWidth), else parsed \includegraphics options, else full width
	const sizePercent = $derived(Math.round(currentFraction() * 100));

	function currentFraction(): number {
		const w = Number(node.attrs.width);
		const mw = Number(node.attrs.maxWidth);
		if (Number.isFinite(w) && Number.isFinite(mw) && mw > 0) return Math.min(1, Math.max(0.05, w / mw));
		const opt = String(node.attrs.options ?? '');
		const m = opt.match(/width\s*=\s*([0-9]*\.?[0-9]+)\s*\\(?:text|line|column)width/);
		if (m) return Math.min(1, Math.max(0.05, parseFloat(m[1])));
		return 1;
	}

	// typst sizing: the `options` attr is the verbatim extra-args slice of image(...); this field
	// edits ONLY its width: entry and re-emits everything else untouched. Comma-splitting is fine
	// for the flat arg lists image() takes; a call complex enough to break it never became an
	// image node in the first place.
	const typstWidth = $derived.by(() => {
		const w = String(node.attrs.options ?? '').match(/(?:^|,)\s*width:\s*([^,]+)/);
		return w ? w[1].trim() : '';
	});
	function setTypstWidth(raw: string) {
		const trimmed = raw.trim();
		// a Typst length or 'auto'; anything else would be spliced into the call and break it
		if (trimmed && !/^([0-9]*\.?[0-9]+(%|pt|mm|cm|in|em|fr)|auto)$/.test(trimmed)) return;
		const rest = String(node.attrs.options ?? '')
			.split(',')
			.map((s) => s.trim())
			.filter((s) => s && !/^width:/.test(s));
		const next = [...(trimmed ? [`width: ${trimmed}`] : []), ...rest].join(', ');
		updateAttrs({ options: next || null });
	}

	function imgEl(): HTMLImageElement | null {
		return overlayElement?.parentElement?.querySelector('img') ?? null;
	}

	/** px available to the image: the editor column minus horizontal padding. */
	function containerWidth(): number {
		const pm = overlayElement?.closest('.ProseMirror') as HTMLElement | null;
		if (!pm) return imgEl()?.parentElement?.clientWidth || 600;
		const style = getComputedStyle(pm);
		const pad = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
		return Math.max(50, pm.clientWidth - pad);
	}

	function setSizePercent(pct: number) {
		const cw = containerWidth();
		const img = imgEl();
		const aspect =
			img && img.naturalWidth && img.naturalHeight
				? img.naturalWidth / img.naturalHeight
				: Number(node.attrs.width) / Number(node.attrs.height) || 1;
		const width = Math.round((pct / 100) * cw);
		updateAttrs({ width, height: Math.round(width / aspect), maxWidth: Math.round(cw) });
	}

	function handleLabelInput(e: Event) {
		const input = e.target as HTMLInputElement;
		const newLabel = sanitizeLabel(input.value);
		labelInput = newLabel;
		// commit on blur, not per keystroke
	}

	function handleLabelBlur(e: Event) {
		const input = e.target as HTMLInputElement;
		const newLabel = sanitizeLabel(input.value);

		// a name another anchor already holds is refused, not merged: the references would survive,
		// pointing at whichever of the two LaTeX numbered last
		const pos = getPos();
		if (!newLabel || (pos !== undefined && labelTaken(view.state.doc, newLabel, pos))) {
			labelInput = originalTexpileLabel;
			updateAttrs({ label: originalTexpileLabel });
			return;
		}

		updateAttrs({ label: newLabel });
	}
</script>

<div class="settings-content">
	{#if latexControls}
		<div class="settings-row">
			<div class="mb-1 flex items-center justify-between">
				<span class="text-sm">{m.imageoverlay_size_label()}</span>
				<span class="text-muted text-xs tabular-nums">{sizePercent}%</span>
			</div>
			<input
				type="range"
				class="accent-primary-500 w-full"
				min={Math.round(sizeStep * 100)}
				max={100}
				step={Math.round(sizeStep * 100)}
				value={sizePercent}
				oninput={(e) => setSizePercent(Number((e.currentTarget as HTMLInputElement).value))}
			/>
		</div>
	{/if}

	{#if dialect === 'typst'}
		<div class="settings-row">
			<div class="mb-1 flex items-center justify-between">
				<span class="text-sm">{m.imageoverlay_size_label()}</span>
			</div>
			<input
				class="input w-full px-2 py-1 font-mono text-sm"
				value={typstWidth}
				placeholder="70%"
				spellcheck="false"
				onchange={(e) => setTypstWidth((e.currentTarget as HTMLInputElement).value)}
			/>
			<p class="text-muted mt-1 text-xs">{m.imageoverlay_typst_width_note()}</p>
		</div>
	{/if}

	<div class="settings-row flex items-center justify-between">
		<div class="flex items-center gap-2">
			<span class="text-sm">{m.imageoverlay_show_caption_label()}</span>
			<button type="button" class="inline-flex items-center" use:tip={m.imageoverlay_show_caption_tooltip()}>
				<Info class="text-muted h-3.5 w-3.5" />
			</button>
		</div>
		<button
			type="button"
			class="toggle-button {showCaptionInput ? 'active' : ''}"
			aria-label={m.imageoverlay_show_caption_aria()}
			aria-pressed={showCaptionInput}
			onclick={() => {
				showCaptionInput = !showCaptionInput;
				updateAttrs({ showCaption: showCaptionInput });
			}}
		>
			<span class="toggle-thumb"></span>
		</button>
	</div>

	{#if latexControls}
		<div class="settings-row flex items-center justify-between">
			<div class="flex items-center gap-2">
				<span class="text-sm">{m.imageoverlay_numbered_label()}</span>
				<button type="button" class="inline-flex items-center" use:tip={m.imageoverlay_numbered_tooltip()}>
					<Info class="text-muted h-3.5 w-3.5" />
				</button>
			</div>
			<button
				type="button"
				class="toggle-button {numberedInput ? 'active' : ''}"
				aria-label={m.imageoverlay_numbered_aria()}
				aria-pressed={numberedInput}
				onclick={() => {
					numberedInput = !numberedInput;
					updateAttrs({ numbered: numberedInput });
				}}
			>
				<span class="toggle-thumb"></span>
			</button>
		</div>
	{/if}

	{#if columnSpanningEnabled}
		<div class="settings-row flex items-center justify-between">
			<div class="flex items-center gap-2">
				<span class="text-sm">{m.imageoverlay_span_columns_label()}</span>
				<button type="button" class="inline-flex items-center" use:tip={m.imageoverlay_span_columns_tooltip()}>
					<Info class="text-muted h-3.5 w-3.5" />
				</button>
			</div>
			<button
				type="button"
				class="toggle-button {spanningInput ? 'active' : ''}"
				aria-label={m.imageoverlay_span_columns_aria()}
				aria-pressed={spanningInput}
				onclick={() => {
					spanningInput = !spanningInput;
					updateAttrs({ spanning: spanningInput });
				}}
			>
				<span class="toggle-thumb"></span>
			</button>
		</div>
	{/if}

	<!-- the only thing under Advanced is the \label for \ref, so the whole disclosure is
	     LaTeX-only; gated on the dialect as well as on numbering, so an image carrying
	     numbered=true (pasted from a tex doc) still can't offer it in markdown -->
	{#if latexControls && numberedInput}
		<button
			type="button"
			class="text-muted hover:text-surface-900-100 my-3 flex w-full items-center gap-2 text-sm transition-colors"
			onclick={() => (showAdvanced = !showAdvanced)}
		>
			<ChevronDown class="h-4 w-4 transition-transform {showAdvanced ? 'rotate-180' : ''}" />
			<span>{m.imageoverlay_advanced_options()}</span>
		</button>

		{#if showAdvanced}
			<div class="border-surface-300-700 space-y-4 pl-6">
				<label class="label">
					<span>
						{m.imageoverlay_latex_label()}
						<span class="text-muted text-sm">{m.imageoverlay_latex_label_hint()}</span>
					</span>
					<input
						type="text"
						class="input text-sm"
						value={labelInput}
						oninput={handleLabelInput}
						onblur={handleLabelBlur}
						placeholder={m.imageoverlay_label_placeholder()}
					/>
					{#if isTexpileManagedLabel(labelInput)}
						<span class="text-muted mt-1 flex items-center gap-1 text-xs">
							<Info class="h-3 w-3" />
							{m.imageoverlay_auto_label_hint()}
						</span>
					{/if}
				</label>
			</div>
		{/if}
	{/if}
</div>

<style>
	.settings-content {
		padding: calc(var(--spacing) * 3);
	}

	.settings-row {
		margin-bottom: calc(var(--spacing) * 3);
	}

	.settings-row:last-child {
		margin-bottom: 0;
	}

	.toggle-button {
		position: relative;
		width: calc(var(--spacing) * 9);
		height: calc(var(--spacing) * 5);
		border-radius: calc(var(--radius-base) * 2.5);
		border: none;
		background: var(--color-surface-300);
		cursor: pointer;
		transition: background-color 0.2s ease;
		padding: 0;
		flex-shrink: 0;
	}

	.toggle-button.active {
		background: var(--color-primary-500);
	}

	.toggle-thumb {
		position: absolute;
		top: calc(var(--spacing) * 0.5);
		left: calc(var(--spacing) * 0.5);
		width: calc(var(--spacing) * 4);
		height: calc(var(--spacing) * 4);
		border-radius: 50%;
		background: white;
		transition: transform 0.2s ease;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
	}

	.toggle-button.active .toggle-thumb {
		transform: translateX(16px);
	}

	:global(.dark) .toggle-button {
		background: var(--color-surface-600);
	}

	:global(.dark) .toggle-button.active {
		background: var(--color-primary-500);
	}
</style>
