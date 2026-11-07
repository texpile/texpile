<script lang="ts">
	import type { Node } from 'prosemirror-model';
	import { isReadOnly } from '$lib/stores/permissionStore';
	import { typstScopeNow } from '../../core/scope/fileScopeNow.svelte';
	import { drawTheoremHead, showTheoremHead, theoremHead } from '../../core/own/theoremHead';

	type Props = { node: Node; onopen: () => void };
	const props: Props = $props();

	const printed = $derived(theoremHead(typstScopeNow.current?.own(String(props.node.attrs.name ?? '')), props.node.attrs.args ?? null));
	const head = $derived(printed ? drawTheoremHead(printed) : null);
</script>

<div class="typ-env-header" contenteditable="false">
	{#if head}
		<button class="env-head" data-look="theorem" disabled={isReadOnly.current} onclick={props.onopen} use:showTheoremHead={head}></button>
	{:else}
		<button class="env-label" disabled={isReadOnly.current} onclick={props.onopen}>{props.node.attrs.name}</button>
	{/if}
	{#if props.node.attrs.label}
		<span class="typ-env-label">&lt;{props.node.attrs.label}&gt;</span>
	{/if}
</div>

<style>
	.typ-env-label {
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 0.75rem;
		color: var(--faint-text);
	}
</style>
