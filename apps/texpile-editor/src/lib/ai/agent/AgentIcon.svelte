<script lang="ts">
	import { SquareTerminal } from '@lucide/svelte';
	import { AGENT_ICON_PATHS } from './agentIcons';
	import type { AiAgent } from './aiAgents';

	type Props = { agent: AiAgent; class?: string };
	const props: Props = $props();
	const size = $derived(props.class ?? 'size-4');
</script>

{#if props.agent === 'custom'}
	<SquareTerminal class="{size} shrink-0" aria-hidden="true" />
{:else}
	<svg class="{size} shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={AGENT_ICON_PATHS[props.agent]} /></svg>
{/if}
