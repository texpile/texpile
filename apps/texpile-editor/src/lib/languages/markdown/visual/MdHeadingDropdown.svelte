<script lang="ts">
	// markdown heading picker: same trigger/panel styling as the tex HeadingDropdown, markdown
	// vocabulary (Paragraph / Heading 1-6, # hints) instead of Section/Subsection + starring
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import { ChevronDown, Check } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		/** Current heading level of the selection (0 = paragraph). */
		level: number;
		onSelect: (level: number) => void;
	};
	let { level, onSelect }: Props = $props();

	let open = $state(false);

	const triggerLabel = $derived(level === 0 ? m.mdtoolbar_paragraph() : m.mdtoolbar_heading_n({ n: level }));

	function choose(lvl: number) {
		open = false;
		onSelect(lvl);
	}
</script>

<Popover
	{open}
	onOpenChange={(e) => (open = e.open)}
	positioning={{ placement: 'bottom-start', offset: { mainAxis: 2 } }}
	autoFocus={false}
>
	<Popover.Trigger
		class="text-surface-800-200 hover:bg-surface-200-800 flex h-7 items-center gap-1 rounded-base px-2 text-sm font-medium transition-colors"
	>
		<span class="min-w-[5.5rem] text-left">{triggerLabel}</span>
		<ChevronDown class="text-muted size-4 shrink-0" />
	</Popover.Trigger>

	<Portal>
		<Popover.Positioner class="z-floating-ui">
			<Popover.Content class="card bg-surface-50-950 border-surface-300-700 min-w-[220px] border shadow-lg">
				<div class="py-1">
					<button
						type="button"
						class="hover:preset-tonal-primary flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm"
						class:preset-tonal-primary={level === 0}
						onclick={() => choose(0)}
					>
						<span class="text-faint w-10 shrink-0"></span>
						<span class="flex-1">{m.mdtoolbar_paragraph()}</span>
						{#if level === 0}<Check class="h-4 w-4 shrink-0" />{/if}
					</button>
					{#each [1, 2, 3, 4, 5, 6] as lvl (lvl)}
						{@const active = level === lvl}
						<button
							type="button"
							class="hover:preset-tonal-primary flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm"
							class:preset-tonal-primary={active}
							onclick={() => choose(lvl)}
						>
							<span class="text-muted w-10 shrink-0 font-mono text-xs">{'#'.repeat(lvl)}</span>
							<span class="flex-1">{m.mdtoolbar_heading_n({ n: lvl })}</span>
							{#if active}<Check class="h-4 w-4 shrink-0" />{/if}
						</button>
					{/each}
				</div>
			</Popover.Content>
		</Popover.Positioner>
	</Portal>
</Popover>
