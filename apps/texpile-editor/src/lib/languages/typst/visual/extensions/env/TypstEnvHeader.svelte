<!-- header of a typst environment: the call's name, its arguments as typst text, and its label -->
<script lang="ts">
	import type { Node } from 'prosemirror-model';
	import { sanitizeLabel } from '$lib/editor/visual/label';
	import { isReadOnly } from '$lib/stores/permissionStore';
	import { argsFromField, envHeadReadsBack } from './envHeadEdits';
	import { m } from '$lib/paraglide/messages';

	let {
		node,
		updateAttrs,
		labelTaken
	}: {
		node: Node;
		updateAttrs: (attrs: Record<string, unknown>) => void;
		/** another anchor in the document already answers to this name */
		labelTaken: (name: string) => boolean;
	} = $props();

	// first-paint snapshot by design: the $effect below re-syncs on node changes
	// svelte-ignore state_referenced_locally
	const initialAttrs = node.attrs;
	let nameVal = $state(String(initialAttrs.name ?? ''));
	let argsVal = $state(initialAttrs.args ?? '');
	let labelVal = $state(initialAttrs.label ?? '');
	$effect(() => {
		nameVal = String(node.attrs.name ?? '');
		argsVal = node.attrs.args ?? '';
		labelVal = node.attrs.label ?? '';
	});

	function commitName() {
		const name = nameVal.trim();
		if (name && name !== node.attrs.name && envHeadReadsBack(name, node.attrs.args)) updateAttrs({ name });
		else nameVal = String(node.attrs.name ?? '');
	}

	function commitArgs() {
		const args = argsFromField(argsVal, node.attrs.args);
		if (args !== node.attrs.args && envHeadReadsBack(String(node.attrs.name), args)) updateAttrs({ args });
		else argsVal = node.attrs.args ?? '';
	}

	// an emptied field takes the label away; a name another anchor holds is refused, not shared
	function commitLabel() {
		if (labelVal === (node.attrs.label ?? '')) return;
		const label = sanitizeLabel(labelVal) || null;
		if (label !== node.attrs.label && (label === null || !labelTaken(label))) updateAttrs({ label });
		else labelVal = node.attrs.label ?? '';
	}

	function blurOnEnter(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			(e.currentTarget as HTMLElement).blur();
		}
	}
</script>

<div class="env-header text-xs" contenteditable="false">
	<span class="env-syntax">#</span>
	<input
		class="env-name"
		style="width: {Math.max(2, nameVal.length)}ch"
		bind:value={nameVal}
		onblur={commitName}
		onkeydown={blurOnEnter}
		spellcheck="false"
		disabled={isReadOnly.current}
		aria-label={m.envcomp_aria_env_name()}
	/>
	<span class="env-syntax">(</span>
	<textarea
		class="env-args"
		rows="1"
		bind:value={argsVal}
		onblur={commitArgs}
		onkeydown={blurOnEnter}
		spellcheck="false"
		disabled={isReadOnly.current}
		placeholder={m.envcomp_typst_placeholder_arguments()}
		aria-label={m.envcomp_aria_env_arguments()}></textarea>
	<span class="env-syntax">)</span>
	<span class="env-label">
		<span class="env-syntax">&lt;</span>
		<input
			class="env-label-input"
			style="width: {Math.max(5, labelVal.length)}ch"
			bind:value={labelVal}
			onblur={commitLabel}
			onkeydown={blurOnEnter}
			spellcheck="false"
			disabled={isReadOnly.current}
			placeholder={m.envcomp_typst_placeholder_label()}
			aria-label={m.envcomp_typst_aria_label()}
		/>
		<span class="env-syntax">&gt;</span>
	</span>
</div>

<style>
	.env-header {
		/* gap 0 + flex (which ignores inter-item whitespace) keeps the parentheses tight to the name */
		display: flex;
		align-items: baseline;
		gap: 0;
		margin-bottom: calc(var(--spacing) * 1.5);
		user-select: none;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	}
	.env-syntax {
		color: var(--muted-text);
	}
	.env-name,
	.env-args,
	.env-label-input {
		border: none;
		background: transparent;
		outline: none;
		padding: 0;
		border-radius: var(--radius-base);
		font-family: inherit;
		font-size: inherit;
		line-height: inherit;
	}
	.env-name {
		flex: none; /* hold the exact text width so the parenthesis hugs it */
		font-weight: 600;
		color: var(--primary-ink);
	}
	.env-args {
		color: var(--muted-text);
		field-sizing: content;
		min-width: 8ch;
		max-width: 100%;
		resize: none;
		overflow: hidden;
	}
	.env-label {
		display: flex;
		align-items: baseline;
		margin-left: auto;
		padding-left: calc(var(--spacing) * 3);
	}
	.env-label-input {
		flex: none;
		color: var(--muted-text);
	}
	.env-name:hover,
	.env-args:hover,
	.env-label-input:hover,
	.env-name:focus,
	.env-args:focus,
	.env-label-input:focus {
		background: var(--surface-wash);
	}
	.env-args::placeholder,
	.env-label-input::placeholder {
		color: var(--faint-text);
	}
</style>
