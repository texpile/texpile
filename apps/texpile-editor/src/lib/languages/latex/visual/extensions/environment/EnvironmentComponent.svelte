<!-- header form for an environment block: name + \begin args as inline fields -->
<script lang="ts">
	import type { Node } from 'prosemirror-model';
	import { m } from '$lib/paraglide/messages';

	let { node, updateAttrs }: { node: Node; updateAttrs: (attrs: Record<string, unknown>) => void } = $props();

	// first-paint snapshot by design: the $effect below re-syncs on node changes
	// svelte-ignore state_referenced_locally
	const initialAttrs = node.attrs;
	let nameVal = $state(initialAttrs.name || '');
	let argsVal = $state(initialAttrs.args || '');
	$effect(() => {
		nameVal = node.attrs.name || '';
		argsVal = node.attrs.args || '';
	});

	const friendlyLabels: Record<string, string> = {
		abstract: m.envcomp_label_abstract(),
		acknowledgements: m.envcomp_label_acknowledgements(),
		keywords: m.envcomp_label_keywords()
	};
	const friendlyLabel = $derived(friendlyLabels[node.attrs.name || '']);

	const isFrame = $derived((node.attrs.name || '') === 'frame');
	// frame args that are empty or a single {...} group are edited as a plain title
	const showTitleField = $derived(isFrame && (argsVal.trim() === '' || /^\{[\s\S]*\}$/.test(argsVal)));
	const titleVal = $derived(argsVal.replace(/^\{([\s\S]*)\}$/, '$1'));

	function commitName() {
		const v = nameVal.trim();
		if (v && v !== node.attrs.name) updateAttrs({ name: v });
		else nameVal = node.attrs.name || '';
	}
	function commitArgs() {
		if (argsVal !== node.attrs.args) updateAttrs({ args: argsVal });
	}
	function commitTitle(v: string) {
		const t = v.trim();
		updateAttrs({ args: t ? `{${t}}` : '' });
	}
	function blurOnEnter(e: KeyboardEvent) {
		if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
	}
</script>

{#if friendlyLabel}
	<div class="env-friendly-label" contenteditable="false">{friendlyLabel}</div>
{:else}
	<div class="env-header" contenteditable="false">
		<span class="env-syntax">{'\\begin{'}</span>
		<input
			class="env-name"
			style="width: {Math.max(2, nameVal.length)}ch"
			bind:value={nameVal}
			onblur={commitName}
			onkeydown={blurOnEnter}
			spellcheck="false"
			aria-label={m.envcomp_aria_env_name()}
		/>
		<span class="env-syntax">}</span>
		{#if showTitleField}
			<input
				class="env-args"
				placeholder={m.envcomp_placeholder_title()}
				value={titleVal}
				onblur={(e) => commitTitle((e.currentTarget as HTMLInputElement).value)}
				onkeydown={blurOnEnter}
				spellcheck="false"
				aria-label={m.envcomp_aria_frame_title()}
			/>
		{:else}
			<input
				class="env-args"
				placeholder={m.envcomp_placeholder_arguments()}
				bind:value={argsVal}
				onblur={commitArgs}
				onkeydown={blurOnEnter}
				spellcheck="false"
				aria-label={m.envcomp_aria_env_arguments()}
			/>
		{/if}
	</div>
{/if}

<style>
	.env-friendly-label {
		text-align: center;
		font-size: 1.05rem;
		font-weight: 600;
		margin-bottom: calc(var(--spacing) * 2);
		user-select: none;
	}
	.env-header {
		/* gap 0 + flex (which ignores inter-item whitespace) keeps the braces tight to the name */
		display: flex;
		align-items: baseline;
		gap: 0;
		margin-bottom: calc(var(--spacing) * 1.5);
		user-select: none;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 11px;
	}
	.env-syntax {
		color: var(--muted-text);
	}
	.env-name,
	.env-args {
		border: none;
		background: transparent;
		outline: none;
		padding: 0;
		border-radius: var(--radius-base);
		font-family: inherit;
		font-size: inherit;
	}
	.env-name {
		flex: none; /* hold the exact text width so the closing } hugs it */
		font-weight: 600;
		color: var(--primary-ink);
	}
	.env-args {
		color: var(--muted-text);
		flex: 1;
		margin-left: 0.6em; /* the only gap: a space after the closing } */
		min-width: 8ch;
	}
	.env-name:hover,
	.env-args:hover,
	.env-name:focus,
	.env-args:focus {
		background: color-mix(in srgb, var(--color-surface-500) 12%, transparent);
	}
	.env-args::placeholder {
		color: var(--faint-text);
	}
</style>
