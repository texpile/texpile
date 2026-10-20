<script lang="ts">
	import IconCircleAlert from '@lucide/svelte/icons/circle-alert';
	import IconInfo from '@lucide/svelte/icons/info';
	import IconTriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import DiagnosticCardMenu from './DiagnosticCardMenu.svelte';
	import DiagnosticFixLink from './DiagnosticFixLink.svelte';
	import type { DiagnosticCardProps } from './diagnosticCardTypes';

	const props: DiagnosticCardProps = $props();
	const { severity, heading, message, fix, turnOff } = $derived(props);
</script>

<div
	class="card border-surface-300-700 bg-surface-50-950 pointer-events-auto max-w-[280px] min-w-[200px] space-y-1 border p-2.5 shadow-2xl"
>
	<div class="flex items-center gap-2">
		{#if severity === 'error'}
			<IconCircleAlert size={14} class="text-error-ink shrink-0" />
		{:else if severity === 'warning'}
			<IconTriangleAlert size={14} class="text-warning-ink shrink-0" />
		{:else}
			<IconInfo size={14} class="text-primary-ink shrink-0" />
		{/if}
		<span class="cap-center text-xs font-semibold opacity-75">{heading}</span>
		{#if turnOff}
			<DiagnosticCardMenu {turnOff} />
		{/if}
	</div>

	<p class="pl-[22px] text-xs [overflow-wrap:anywhere] whitespace-pre-wrap">{message}</p>

	{#if fix}
		<DiagnosticFixLink {fix} />
	{/if}
</div>
