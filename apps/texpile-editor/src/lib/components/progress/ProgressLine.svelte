<script lang="ts">
	// VS Code's indeterminate progress line, with its timing: on at once, off 300 ms after the work
	// ends, so steps run back to back read as one
	type ProgressLineProps = { active: boolean; label: string };
	const props: ProgressLineProps = $props();

	let shown = $state(false);
	$effect(() => {
		if (props.active) {
			shown = true;
			return;
		}
		const t = setTimeout(() => (shown = false), 300);
		return () => clearTimeout(t);
	});
</script>

<div class="relative h-0.5 shrink-0 overflow-hidden">
	{#if shown}
		<div class="absolute inset-0" role="progressbar" aria-label={props.label}>
			<div class="progress-line-bit bg-primary-500 absolute inset-y-0 w-[5%]"></div>
		</div>
	{/if}
</div>

<style>
	/* monaco-progress-container's infinite bit: a short segment sweeping left to right */
	.progress-line-bit {
		animation: progress-line 4s linear infinite;
	}
	@keyframes progress-line {
		from {
			transform: translateX(0) scaleX(1);
		}
		50% {
			transform: translateX(2500%) scaleX(3);
		}
		to {
			transform: translateX(4900%) scaleX(1);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.progress-line-bit {
			animation: none;
			width: 100%;
			opacity: 0.5;
		}
	}
</style>
