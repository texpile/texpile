<script lang="ts">
	// how far an install of Texpile's tinymist has got, or why the last one failed
	import { tinymistInstaller } from './tinymistInstall.svelte';
	import { tinymistFailureText, tinymistStepPercent, tinymistStepText } from './tinymistInstallText';

	const step = $derived(tinymistInstaller.step);
	const failure = $derived(tinymistInstaller.failure);
	const version = $derived(tinymistInstaller.status?.pinned ?? '');
</script>

{#if step}
	<div class="mt-2" role="status">
		<div class="bg-surface-200-800 h-1.5 w-full overflow-hidden rounded-full">
			<div
				class="bg-primary-500 h-full rounded-full transition-[width] duration-300"
				style="width: {Math.max(2, tinymistStepPercent(step))}%"
			></div>
		</div>
		<p class="text-muted mt-1 text-xs">{tinymistStepText(step, version)}</p>
	</div>
{:else if failure}
	<p class="text-error-ink mt-2 text-xs leading-relaxed break-words" role="alert">{tinymistFailureText(failure)}</p>
{/if}
