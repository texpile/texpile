<script lang="ts">
	import { tip } from './tooltip.svelte';
	import type { Snippet } from 'svelte';

	type Props = {
		enabled: boolean;
		tooltip?: string;
		children: Snippet;
	};

	let { enabled, tooltip = 'This feature is not enabled for this template', children }: Props = $props();
</script>

{#if enabled}
	{@render children()}
{:else}
	<!-- the hint hangs on the wrapper, not on the greyed content: that has pointer-events: none -->
	<div class="w-full" use:tip={tooltip}>
		<div class="disabled-feature">
			{@render children()}
		</div>
	</div>
{/if}

<style>
	.disabled-feature {
		opacity: 0.4;
		pointer-events: none;
		cursor: not-allowed;
	}
</style>
