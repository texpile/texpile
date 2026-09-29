<script lang="ts">
	// VS Code's Source Control progress: an indeterminate line across the top of the view while a
	// repository operation runs (ProgressLocation.SourceControl), with its timing: on at once, off
	// 300 ms after the last operation ends, so steps run back to back read as one. Status reads are
	// left out, where VS Code counts them: autosave rereads status after nearly every save, and the
	// line would flicker the whole time someone writes.
	import { m } from '$lib/paraglide/messages';

	let { active }: { active: boolean } = $props();

	let shown = $state(false);
	$effect(() => {
		if (active) {
			shown = true;
			return;
		}
		const t = setTimeout(() => (shown = false), 300);
		return () => clearTimeout(t);
	});
</script>

<div class="relative h-0.5 shrink-0 overflow-hidden">
	{#if shown}
		<div class="absolute inset-0" role="progressbar" aria-label={m.vcs_working()}>
			<div class="scm-progress-bit bg-primary-500 absolute inset-y-0 w-[5%]"></div>
		</div>
	{/if}
</div>

<style>
	/* monaco-progress-container's infinite bit: a short segment sweeping left to right */
	.scm-progress-bit {
		animation: scm-progress 4s linear infinite;
	}
	@keyframes scm-progress {
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
		.scm-progress-bit {
			animation: none;
			width: 100%;
			opacity: 0.5;
		}
	}
</style>
