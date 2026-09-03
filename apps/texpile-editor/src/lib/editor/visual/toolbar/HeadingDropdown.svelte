<script lang="ts">
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import { ChevronDown, Check } from '@lucide/svelte';

	type Props = {
		/** Current heading level of the selection (0 = normal paragraph). */
		level: number;
		/** Whether the current heading is numbered (\section vs \section*). */
		numbered: boolean;
		/** Apply a heading level (0 = normal) with the chosen numbering. */
		onSelect: (level: number, numbered: boolean) => void;
	};

	let { level, numbered, onSelect }: Props = $props();

	let open = $state(false);

	const LEVELS = [
		{ level: 1, name: 'Section', number: '1' },
		{ level: 2, name: 'Subsection', number: '1.1' },
		{ level: 3, name: 'Subsubsection', number: '1.1.1' }
	];

	const triggerLabel = $derived.by(() => {
		if (level === 0) return 'Normal';
		const l = LEVELS.find((x) => x.level === level);
		return l ? l.name + (numbered ? '' : '*') : 'Normal';
	});

	function choose(lvl: number, num: boolean) {
		open = false;
		onSelect(lvl, num);
	}
</script>

<Popover
	{open}
	onOpenChange={(e) => (open = e.open)}
	positioning={{ placement: 'bottom-start', offset: { mainAxis: 2 } }}
	autoFocus={false}
>
	<Popover.Trigger
		class="flex h-7 items-center gap-1 rounded-base px-2 text-sm font-medium text-surface-800-200 transition-colors hover:bg-surface-200-800"
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
						class="hover:preset-tonal flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm"
						class:preset-tonal-primary={level === 0}
						onclick={() => choose(0, true)}
					>
						<span class="text-faint w-10 shrink-0"></span>
						<span class="flex-1">Normal</span>
						{#if level === 0}<Check class="h-4 w-4 shrink-0" />{/if}
					</button>

					<div class="text-muted px-3 pt-2 pb-1 text-xs font-semibold tracking-wide uppercase">Numbered</div>
					{#each LEVELS as l (l)}
						{@const active = level === l.level && numbered}
						<button
							type="button"
							class="hover:preset-tonal flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm"
							class:preset-tonal-primary={active}
							style="padding-left: {l.level * 0.5 + 0.75}rem"
							onclick={() => choose(l.level, true)}
						>
							<span class="text-muted w-10 shrink-0 font-mono text-xs">{l.number}</span>
							<span class="flex-1">{l.name}</span>
							{#if active}<Check class="h-4 w-4 shrink-0" />{/if}
						</button>
					{/each}

					<div class="text-muted px-3 pt-2 pb-1 text-xs font-semibold tracking-wide uppercase">Unnumbered</div>
					{#each LEVELS as l (l)}
						{@const active = level === l.level && !numbered}
						<button
							type="button"
							class="hover:preset-tonal flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm"
							class:preset-tonal-primary={active}
							style="padding-left: {l.level * 0.5 + 0.75}rem"
							onclick={() => choose(l.level, false)}
						>
							<span class="text-faint w-10 shrink-0 font-mono text-xs">*</span>
							<span class="flex-1">{l.name}</span>
							{#if active}<Check class="h-4 w-4 shrink-0" />{/if}
						</button>
					{/each}
				</div>
			</Popover.Content>
		</Popover.Positioner>
	</Portal>
</Popover>
