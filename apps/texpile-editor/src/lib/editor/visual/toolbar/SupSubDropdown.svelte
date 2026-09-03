<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import { ChevronDown, Check, Superscript, Subscript } from '@lucide/svelte';
	import { modLabel } from '$lib/platform';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		/** Whether the current selection has the superscript mark. */
		sup: boolean;
		/** Whether the current selection has the subscript mark. */
		sub: boolean;
		/** Toggle one of the two marks. */
		onToggle: (which: 'sup' | 'sub') => void;
	};

	let { sup, sub, onToggle }: Props = $props();

	let open = $state(false);

	function choose(which: 'sup' | 'sub') {
		open = false;
		onToggle(which);
	}

	const modKey = modLabel;

	const anyActive = $derived(sup || sub);
</script>

<Popover
	{open}
	onOpenChange={(e) => (open = e.open)}
	positioning={{ placement: 'bottom-start', offset: { mainAxis: 2 } }}
	autoFocus={false}
>
	<Popover.Trigger
		class="text-surface-800-200 flex h-7 items-center gap-0.5 rounded-base px-1.5 transition-colors {anyActive
			? 'preset-tonal-primary'
			: 'hover:preset-tonal'}"
		aria-label={m.tbar_supsub_aria()}
	>
		{#snippet element(attrs)}
			<button {...attrs} use:tip={m.tbar_supsub_title()}>
				<!-- same box + stroke as every other toolbar icon so it doesn't read bigger/bolder -->
				<Superscript class="h-5 w-5" />
				<ChevronDown class="text-muted size-3 shrink-0" />
			</button>
		{/snippet}
	</Popover.Trigger>

	<Portal>
		<Popover.Positioner class="z-floating-ui">
			<Popover.Content class="card bg-surface-50-950 border-surface-300-700 min-w-[220px] border p-1 shadow-lg">
				<button
					type="button"
					class="hover:preset-tonal-primary flex w-full items-center gap-3 rounded-base px-2 py-1.5 text-left text-sm"
					class:preset-tonal-primary={sup}
					onclick={() => choose('sup')}
				>
					<Superscript class="text-muted size-[18px] shrink-0" strokeWidth={2.25} />
					<span class="flex-1">{m.tbar_superscript()}</span>
					<span class="text-muted text-xs">{modKey}+.</span>
					{#if sup}<Check class="ml-1 h-4 w-4 shrink-0" />{/if}
				</button>
				<button
					type="button"
					class="hover:preset-tonal-primary flex w-full items-center gap-3 rounded-base px-2 py-1.5 text-left text-sm"
					class:preset-tonal-primary={sub}
					onclick={() => choose('sub')}
				>
					<Subscript class="text-muted size-[18px] shrink-0" strokeWidth={2.25} />
					<span class="flex-1">{m.tbar_subscript()}</span>
					<span class="text-muted text-xs">{modKey}+,</span>
					{#if sub}<Check class="ml-1 h-4 w-4 shrink-0" />{/if}
				</button>
			</Popover.Content>
		</Popover.Positioner>
	</Portal>
</Popover>
