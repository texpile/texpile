<script lang="ts">
	// how far an install of one of Texpile's own copies has got, or why the last one failed
	import { installStepPercent } from './installStepUtils';

	const props: { step: InstallStep | null; describe: (step: InstallStep) => string; failure: string | null } = $props();
	const step = $derived(props.step);
	const failure = $derived(props.failure);
</script>

{#if step}
	<div class="mt-2" role="status">
		<div class="bg-surface-200-800 h-1.5 w-full overflow-hidden rounded-full">
			<div
				class="bg-primary-500 h-full rounded-full transition-[width] duration-300"
				style="width: {Math.max(2, installStepPercent(step))}%"
			></div>
		</div>
		<p class="text-muted mt-1 text-xs">{props.describe(step)}</p>
	</div>
{:else if failure}
	<p class="text-error-ink mt-2 text-xs leading-relaxed break-words" role="alert">{failure}</p>
{/if}
