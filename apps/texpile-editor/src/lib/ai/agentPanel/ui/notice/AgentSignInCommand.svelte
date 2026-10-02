<script lang="ts">
	// the sign-in command drawn as a line in a terminal, dark in either theme, so it reads as something to run
	import { Check, Copy } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { m } from '$lib/paraglide/messages';

	type Props = { command: string };
	const props: Props = $props();
	let copied = $state(false);

	async function copyCommand(): Promise<void> {
		try {
			await navigator.clipboard.writeText(props.command);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			/* clipboard denied */
		}
	}
</script>

<span
	class="border-surface-700 bg-surface-950 text-surface-50 inline-flex h-6 shrink-0 items-center gap-1.5 rounded-base border pr-0.5 pl-2 font-mono text-xs"
>
	<span class="text-surface-400 select-none">$</span>
	<span class="select-all">{props.command}</span>
	<button
		class="hover:bg-surface-800 text-surface-300 flex size-5 items-center justify-center rounded-base"
		use:tip={copied ? m.menubar_copied() : m.menubar_copy()}
		aria-label={m.menubar_copy()}
		onclick={copyCommand}
	>
		{#if copied}<Check class="size-3" />{:else}<Copy class="size-3" />{/if}
	</button>
</span>
