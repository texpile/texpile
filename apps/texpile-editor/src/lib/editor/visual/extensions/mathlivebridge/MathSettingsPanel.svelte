<script lang="ts">
	// The equation settings popover's content: numbering, labels (per line for align-family
	// environments), and the environment picker. MathSettings owns the trigger and shell.
	import { tip } from '$lib/components/tooltip.svelte';
	import { Switch } from '@skeletonlabs/skeleton-svelte';
	import { ChevronDown, Info, Trash2 } from '@lucide/svelte';
	import type { EditorView } from 'prosemirror-view';
	import type { Node as PMNode } from 'prosemirror-model';
	import { generateLabel, isTexpileLabel, sanitizeLabel } from '$lib/editor/visual/label';
	import { labelTaken } from '$lib/editor/visual/labelTaken';
	import { repointRefs } from '$lib/editor/visual/repointRefs';
	import { toggleEnvironmentStar } from './mathEnvironments';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		node: PMNode;
		view: EditorView;
		getPos: () => number | undefined;
	};

	let { node, view, getPos }: Props = $props();

	// the typst editor: no numbering toggle or environments (numbering is a document-level
	// #set rule the template owns), just the <label> that @refs point at
	const isTypst = $derived(!!view.state.schema.nodes.typ_ref);

	let showAdvanced = $state(false);
	// form fields are seeded from the node once, by design
	// svelte-ignore state_referenced_locally
	const initialAttrs = node.attrs;
	let labelInput = $state(initialAttrs.label || '');
	let numberedInput = $state(initialAttrs.numbered || false);
	let environmentInput = $state<string>(initialAttrs.environment || '');
	let lineLabelsInput = $state<string[]>((initialAttrs.lineLabels as string[]) || []);

	let originalTexpileLabel = $derived(node.attrs.label || '');

	let mathContent = $derived(node.content?.firstChild?.text || '');

	let detectedLineCount = $derived(() => {
		if (!mathContent) return 1;
		const matches = mathContent.match(/\\\\/g);
		return matches ? matches.length + 1 : 1;
	});

	// re-sync when the node changes externally
	$effect(() => {
		labelInput = node.attrs.label || '';
		numberedInput = node.attrs.numbered || false;
		environmentInput = node.attrs.environment || '';
		lineLabelsInput = (node.attrs.lineLabels as string[]) || [];
	});

	// multline only has one label, so it uses the single-label UI
	let isPerLineLabelMode = $derived(environmentInput !== '' && ['align', 'gather', 'alignat', 'eqnarray'].includes(environmentInput));

	let hasSpecialEnvironment = $derived(
		environmentInput !== '' && ['align', 'gather', 'alignat', 'eqnarray', 'multline'].includes(environmentInput)
	);

	function isLabelDuplicate(label: string): boolean {
		const pos = getPos();
		if (!label || pos === undefined) return false;
		// against every anchor, not only other equations: a name shared with a figure is just as ambiguous
		return labelTaken(view.state.doc, label, pos);
	}

	let isDuplicate = $derived(labelInput && !isTexpileLabel(labelInput) && isLabelDuplicate(labelInput));

	function updateAttrs(attrs: Partial<typeof node.attrs>) {
		const pos = getPos();
		if (pos !== undefined) {
			const tr = view.state.tr.setNodeMarkup(pos, undefined, {
				...node.attrs,
				...attrs
			});
			// renaming the label follows every reference to it, in the same transaction (one undo
			// step). Both dialects: a \ref left behind still compiles, resolving to ??.
			if ('label' in attrs) repointRefs(tr, view.state.doc, String(node.attrs.label ?? ''), String(attrs.label ?? ''));
			view.dispatch(tr);
		}
	}

	function handleNumberedToggle(details: { checked: boolean }) {
		const newNumbered = details.checked;
		numberedInput = newNumbered;

		if (hasSpecialEnvironment) {
			const pos = getPos();
			if (pos !== undefined) {
				// the node prop can be stale, read from the live doc
				const currentNode = view.state.doc.nodeAt(pos);
				if (!currentNode) return;
				const currentContent = currentNode.textContent || '';

				// star = unnumbered, so invert
				const newContent = toggleEnvironmentStar(currentContent, !newNumbered);

				if (newContent !== currentContent) {
					const tr = view.state.tr;
					const startPos = pos;
					const endPos = pos + currentNode.nodeSize;
					const nodeType = currentNode.type;
					const newAttrs: Record<string, unknown> = { ...currentNode.attrs, numbered: newNumbered };
					if (newNumbered && !isPerLineLabelMode && !currentNode.attrs.label) {
						const newLabel = generateLabel('equation');
						newAttrs.label = newLabel;
						labelInput = newLabel;
					}
					const textNode = view.state.schema.text(newContent);
					tr.replaceWith(startPos, endPos, nodeType.create(newAttrs, textNode));
					view.dispatch(tr);
					return;
				}
			}
			updateAttrs({ numbered: newNumbered });
		} else if (newNumbered && !labelInput) {
			const newLabel = generateLabel('equation');
			labelInput = newLabel;
			updateAttrs({ numbered: newNumbered, label: newLabel });
		} else {
			updateAttrs({ numbered: newNumbered });
		}
	}

	function handleLineLabelChange(index: number, value: string) {
		const sanitized = sanitizeLabel(value);
		const newLabels = [...lineLabelsInput];
		newLabels[index] = sanitized;
		lineLabelsInput = newLabels;
		updateAttrs({ lineLabels: newLabels });
	}

	function generateLineLabel(index: number) {
		const newLabel = generateLabel('equation');
		const newLabels = [...lineLabelsInput];
		newLabels[index] = newLabel;
		lineLabelsInput = newLabels;
		updateAttrs({ lineLabels: newLabels });
	}

	function clearLineLabel(index: number) {
		const newLabels = [...lineLabelsInput];
		newLabels[index] = '';
		lineLabelsInput = newLabels;
		updateAttrs({ lineLabels: newLabels });
	}

	function handleLabelInput(e: Event) {
		const target = e.target as HTMLInputElement;
		const value = target.value;
		const sanitized = sanitizeLabel(value);

		if (value !== sanitized) {
			target.value = sanitized;
		}
		// `value={labelInput}` is one-way, so without this the typed text never left the DOM:
		// blur then read the OLD label and (in typst) took the empty state as "clear the label"
		labelInput = sanitized;
	}
	function handleLabelBlur() {
		// typst labels keep their conventional colon (eq:mass); an emptied field CLEARS the
		// label there, since a typst equation without one is simply unreferenced
		const currentLabel = isTypst ? sanitizeLabel(labelInput) : labelInput.trim().replace(/[^a-zA-Z0-9-_]/g, '');

		if (isTypst && !currentLabel) {
			labelInput = '';
			updateAttrs({ label: null });
			return;
		}
		if (!currentLabel || isLabelDuplicate(currentLabel)) {
			labelInput = originalTexpileLabel;
			updateAttrs({ label: originalTexpileLabel });
			return;
		}

		if (currentLabel !== node.attrs.label) {
			updateAttrs({ label: currentLabel });
		}
	}
</script>

<div class="settings-content">
	{#if isTypst}
		<div class="settings-row">
			<label class="label">
				<span>
					{m.tablewrap_typst_label()}
					<span class="text-surface-600-400 text-sm">{m.tablewrap_typst_label_hint()}</span>
				</span>
				<input
					type="text"
					class="input text-sm"
					class:input-error={isDuplicate}
					value={labelInput}
					oninput={handleLabelInput}
					onblur={handleLabelBlur}
					placeholder="eq:mass"
				/>
				{#if isDuplicate}
					<p class="text-error-600 mt-1 text-xs">{m.mathsettings_label_duplicate_error()}</p>
				{/if}
				<p class="text-surface-500 mt-1 text-xs">{m.mathsettings_typst_numbering_note()}</p>
			</label>
		</div>
	{:else}
		<div class="settings-row">
			<Switch checked={numberedInput} onCheckedChange={handleNumberedToggle} class="flex w-full items-center justify-between gap-3">
				<Switch.Label class="flex items-center gap-2">
					<span>{m.mathsettings_numbered_label()}</span>
					<button type="button" class="inline-flex items-center" use:tip={m.mathsettings_numbered_tooltip()}>
						<Info class="text-surface-500 h-3.5 w-3.5" />
					</button>
				</Switch.Label>
				<Switch.Control class="preset-filled-surface-200-800 data-[state=checked]:preset-filled-primary-500">
					<Switch.Thumb />
				</Switch.Control>
				<Switch.HiddenInput />
			</Switch>
		</div>

		{#if numberedInput}
			{#if hasSpecialEnvironment}
				<div class="settings-row">
					<div class="flex items-center gap-2">
						<span class="text-surface-600-400 text-sm">{m.mathsettings_environment_label()}</span>
						<span class="preset-tonal-primary rounded-base px-2 py-0.5 text-sm font-medium capitalize">{environmentInput}</span>
						<button
							type="button"
							class="inline-flex items-center"
							use:tip={isPerLineLabelMode ? m.mathsettings_environment_tooltip_perline() : m.mathsettings_environment_tooltip_single()}
						>
							<Info class="text-surface-500 h-3.5 w-3.5" />
						</button>
					</div>
				</div>
			{/if}

			{#if isPerLineLabelMode}
				<div class="border-surface-300-700 mt-3 border-t pt-3">
					<span class="text-surface-700-300 mb-2 block text-sm font-medium">{m.mathsettings_line_labels_heading()}</span>
					<p class="text-surface-500 mb-2 text-xs">
						{m.mathsettings_line_labels_hint({ refSyntax: '\\ref{label}' })}
					</p>
					{#each { length: detectedLineCount() } as _, i (i)}
						<div class="mb-2 flex items-center gap-2">
							<span class="text-surface-500 w-12 text-xs">{m.mathsettings_line_number_label({ number: i + 1 })}</span>
							<input
								type="text"
								class="input flex-1 text-sm"
								value={lineLabelsInput[i] || ''}
								oninput={(e) => handleLineLabelChange(i, (e.target as HTMLInputElement).value)}
								placeholder={m.mathsettings_line_label_placeholder({ index: i + 1 })}
							/>
							{#if lineLabelsInput[i]}
								<button
									type="button"
									class="preset-tonal-surface hover:preset-tonal-error btn-icon btn-icon-xs"
									onclick={() => clearLineLabel(i)}
									use:tip={m.mathsettings_clear_label_title()}
								>
									<Trash2 class="h-3 w-3" />
								</button>
							{:else}
								<button type="button" class="btn btn-xs preset-tonal" onclick={() => generateLineLabel(i)}>
									{m.mathsettings_auto_button()}
								</button>
							{/if}
						</div>
					{/each}
					{#if detectedLineCount() === 1}
						<p class="text-surface-500 mt-2 text-xs italic">{m.mathsettings_multiline_tip()}</p>
					{/if}
				</div>
			{/if}

			{#if !isPerLineLabelMode}
				<button
					type="button"
					class="text-surface-600-400 hover:text-surface-900-100 my-3 flex w-full items-center gap-2 text-sm transition-colors"
					onclick={() => (showAdvanced = !showAdvanced)}
				>
					<ChevronDown class="h-4 w-4 transition-transform {showAdvanced ? 'rotate-180' : ''}" />
					<span>{m.mathsettings_advanced_options()}</span>
				</button>

				{#if showAdvanced}
					<div class="border-surface-300-700 mb-3 space-y-4 pl-6">
						<label class="label">
							<span>
								{m.mathsettings_label_field_label()}
								<span class="text-surface-600-400 text-sm">{m.mathsettings_label_field_hint()}</span>
							</span>
							<input
								type="text"
								class="input text-sm"
								class:input-error={isDuplicate}
								value={labelInput}
								oninput={handleLabelInput}
								onblur={handleLabelBlur}
								placeholder={m.mathsettings_label_placeholder()}
							/>
							{#if isDuplicate}
								<p class="text-error-600 mt-1 text-xs">{m.mathsettings_label_duplicate_error()}</p>
							{/if}
							<p class="text-surface-500 mt-1 text-xs">{m.mathsettings_label_field_note()}</p>
						</label>
					</div>
				{/if}
			{/if}
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
</style>
