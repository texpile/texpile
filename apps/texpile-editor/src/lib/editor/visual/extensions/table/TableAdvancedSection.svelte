<script lang="ts">
	import { AlertCircle, Info } from '@lucide/svelte';
	import type { Node } from 'prosemirror-model';
	import { sanitizeLabel } from '$lib/editor/visual/label';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		/** the popover's open state; the label is validated when it closes */
		open: boolean;
		dialect: 'latex' | 'typst';
		node: Node;
		updateAttrs: (attrs: Partial<typeof node.attrs>) => void;
		checkDuplicate: (label: string) => boolean;
		rowRules: string[];
		bottomRule: string;
		setRowRule: (rowIndex: number, rule: string) => void;
		setBottomRule: (rule: string) => void;
	};

	let { open, dialect, node, updateAttrs, checkDuplicate, rowRules, bottomRule, setRowRule, setBottomRule }: Props = $props();

	// re-derives when the node changes externally, reassigned while typing
	let labelInput = $derived(node?.attrs?.label || '');

	// original label, used to revert invalid edits
	// svelte-ignore state_referenced_locally
	const originalTexpileLabel = node?.attrs?.label || '';

	// validate the label when the popover closes
	$effect(() => {
		if (!open) {
			validateAndFixLabel();
		}
	});

	let isDuplicate = $derived(labelInput && !isTexpileManagedLabel(labelInput) && checkDuplicate(labelInput));

	function isTexpileManagedLabel(label: string | null): boolean {
		if (!label) return false;
		return label.startsWith('texpile-table-');
	}

	function validateAndFixLabel() {
		const currentLabel = sanitizeLabel(labelInput);

		if (!currentLabel || checkDuplicate(currentLabel)) {
			labelInput = originalTexpileLabel;
			updateAttrs({ label: originalTexpileLabel });
		}
	}

	function handleLabelInput(e: Event) {
		const input = e.target as HTMLInputElement;
		const newLabel = sanitizeLabel(input.value);
		labelInput = newLabel;
		// don't update attrs yet, wait for blur to validate
	}

	function handleLabelBlur(e: Event) {
		const input = e.target as HTMLInputElement;
		const newLabel = sanitizeLabel(input.value);

		if (!newLabel || checkDuplicate(newLabel)) {
			labelInput = originalTexpileLabel;
			updateAttrs({ label: originalTexpileLabel });
			return;
		}

		updateAttrs({ label: newLabel });
	}
</script>

<div class="border-surface-300-700 mb-3 space-y-4 pl-6">
	<label class="label">
		<span>
			{dialect === 'typst' ? m.tablewrap_typst_label() : m.tablewrap_latex_label()}
			<span class="text-muted text-sm">
				{dialect === 'typst' ? m.tablewrap_typst_label_hint() : m.tablewrap_latex_label_hint()}
			</span>
		</span>
		<input
			id="table-label-input"
			type="text"
			class="input text-sm"
			value={labelInput}
			oninput={handleLabelInput}
			onblur={handleLabelBlur}
			placeholder={m.tablewrap_label_placeholder()}
		/>
		{#if isTexpileManagedLabel(labelInput)}
			<span class="text-muted mt-1 flex items-center gap-1 text-xs">
				<Info class="h-3 w-3" />
				{m.tablewrap_label_auto_generated_hint()}
			</span>
		{/if}
		{#if isDuplicate}
			<p class="text-error-500 mt-1 flex items-center gap-1 text-sm">
				<AlertCircle class="h-4 w-4" />
				{m.tablewrap_label_duplicate()}
			</p>
		{/if}
	</label>

	<!-- per-row rules (\hline, \toprule, ...); empty = no rule before that row -->
	{#if dialect === 'latex'}
		<div class="space-y-1.5">
			<span class="text-surface-900-100 block text-sm font-medium">
				{m.tablewrap_row_rules_heading()} <span class="text-muted text-xs">{m.tablewrap_row_rules_hint()}</span>
			</span>
			{#each rowRules as rule, i (i)}
				<div class="flex items-center gap-2">
					<span class="text-muted w-24 shrink-0 text-xs">{m.tablewrap_before_row({ index: i + 1 })}</span>
					<input
						type="text"
						class="input flex-1 text-xs"
						value={rule}
						placeholder={m.tablewrap_rule_placeholder()}
						onchange={(e) => setRowRule(i, (e.currentTarget as HTMLInputElement).value)}
					/>
				</div>
			{/each}
			<div class="flex items-center gap-2">
				<span class="text-muted w-24 shrink-0 text-xs">{m.tablewrap_after_last_row()}</span>
				<input
					type="text"
					class="input flex-1 text-xs"
					value={bottomRule}
					placeholder={m.tablewrap_rule_placeholder()}
					onchange={(e) => setBottomRule((e.currentTarget as HTMLInputElement).value)}
				/>
			</div>
		</div>
	{/if}
</div>
