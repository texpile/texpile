<!-- an environment's head as the paper prints it (Theorem (Main).), which opens its head as LaTeX -->
<script lang="ts">
	import type { Node } from 'prosemirror-model';
	import { Settings } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { templateFeaturesStore } from '$lib/stores/editorStore';
	import { isReadOnly } from '$lib/stores/permissionStore';
	import { m } from '$lib/paraglide/messages';
	import { environmentLook } from './environmentLook';
	import EnvironmentHeadText from './EnvironmentHeadText.svelte';

	/** number: what the numbers plugin counted for it, a theorem's */
	type Props = { node: Node; onopen: () => void; number?: string | null };
	const props: Props = $props();

	const look = $derived(
		environmentLook(
			String(props.node.attrs.name ?? ''),
			String(props.node.attrs.args ?? ''),
			templateFeaturesStore.current.environmentHeads
		)
	);
</script>

{#if look.kind === 'theorem'}
	<button class="env-head" data-look="theorem" data-style={look.style} disabled={isReadOnly.current} onclick={props.onopen}
		><span class="env-head-name">{look.head}{props.number ? ` ${props.number}` : ''}</span>{#if look.note}&#32;(<EnvironmentHeadText
				text={look.note}
			/>){/if}.</button
	>
{:else if look.kind === 'proof'}
	<button class="env-head" data-look="proof" disabled={isReadOnly.current} onclick={props.onopen}
		><EnvironmentHeadText text={look.head} />.</button
	>
{:else if look.kind === 'align'}
	<button
		class="env-gear"
		data-look="align"
		data-align={look.align}
		disabled={isReadOnly.current}
		onclick={props.onopen}
		use:tip={m.env_settings_button_label()}><Settings class="size-3.5" /></button
	>
{:else}
	<button class="env-label" data-look="box" disabled={isReadOnly.current} onclick={props.onopen}>{look.label}</button>
{/if}
