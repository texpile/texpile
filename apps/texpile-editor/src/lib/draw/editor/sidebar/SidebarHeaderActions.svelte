<script lang="ts">
	import { MoreHorizontal } from '@lucide/svelte';
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { inlineActionCount, type SidebarAction } from './sidebarActions';

	type Props = { actions: SidebarAction[]; width: number };
	const props: Props = $props();

	const inlineCount = $derived(inlineActionCount(props.width, props.actions.length));
	const inlineActions = $derived(props.actions.slice(0, inlineCount));
	const menuActions = $derived(props.actions.slice(inlineCount));
	let menuOpen = $state(false);

	function runFromMenu(action: SidebarAction) {
		menuOpen = false;
		action.run();
	}
</script>

<div class="flex shrink-0 items-center gap-1">
	{#each inlineActions as action (action.key)}
		<button
			class="btn-icon btn-icon-xs hover:preset-tonal disabled:opacity-40"
			disabled={action.disabled}
			aria-label={action.label}
			use:tip={action.hint}
			onclick={action.run}
		>
			<action.icon class="size-4 shrink-0" />
		</button>
	{/each}
	{#if menuActions.length > 0}
		<Popover
			open={menuOpen}
			onOpenChange={(e) => (menuOpen = e.open)}
			positioning={{ placement: 'bottom-end', offset: { mainAxis: 2 } }}
			autoFocus={false}
		>
			<Popover.Trigger class="btn-icon btn-icon-xs hover:preset-tonal" aria-label="More actions">
				{#snippet element(attrs)}
					<button {...attrs} use:tip={'More actions'}><MoreHorizontal class="size-4" /></button>
				{/snippet}
			</Popover.Trigger>
			<Portal>
				<Popover.Positioner class="z-floating-ui">
					<Popover.Content class="card bg-surface-50-950 border-surface-300-700 min-w-[200px] border shadow-lg">
						<div class="py-1">
							{#each menuActions as action (action.key)}
								<button
									type="button"
									class="hover:preset-tonal flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm disabled:pointer-events-none disabled:opacity-40"
									disabled={action.disabled}
									use:tip={action.hint}
									onclick={() => runFromMenu(action)}
								>
									<action.icon class="size-4 shrink-0" />
									<span class="cap-center">{action.label}</span>
								</button>
							{/each}
						</div>
					</Popover.Content>
				</Popover.Positioner>
			</Portal>
		</Popover>
	{/if}
</div>
