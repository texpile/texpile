<script lang="ts">
	// The files a turn changed, listed as Source Control lists changes, without tick boxes: nothing here is
	// being put into a version. A row opens the change in the diff view; its menu can put the file back
	import { ChevronDown, ChevronRight, GitCompare, MoreHorizontal, Undo2 } from '@lucide/svelte';
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import ChangedFileName from '$lib/workspace/scm/ui/changes/ChangedFileName.svelte';
	import {
		MENU_CARD,
		MENU_DANGER,
		MENU_ICON,
		MENU_ITEM,
		MENU_SEPARATOR,
		MENU_TRIGGER,
		hoverAction
	} from '$lib/workspace/scm/ui/changes/rowMenu';
	import { canRevert, changeBadge, openChanges, revertChange } from '../../changes/agentChanges';
	import { m } from '$lib/paraglide/messages';
	import type { ChangedFile } from '../../agentPanel.types';
	import type { PathLabels } from '$lib/workspace/scm/ui/changes/pathLabels';

	type Props = { files: ChangedFile[]; agent: string; labels: PathLabels };
	const props: Props = $props();
	let open = $state(true);
	let menuFor = $state<string | null>(null);
</script>

<div class="-mx-2 text-sm">
	<button
		class="text-muted hover:preset-tonal flex w-full items-center gap-1.5 rounded-base px-2 py-0.5 text-left"
		aria-expanded={open}
		onclick={() => (open = !open)}
	>
		{#if open}<ChevronDown class="size-3.5 shrink-0" />{:else}<ChevronRight class="size-3.5 shrink-0" />{/if}
		<span class="cap-center font-semibold">{m.agent_panel_changed_by({ agent: props.agent })}</span>
		<span class="cap-center text-xs">{props.files.length}</span>
	</button>
	{#if open}
		{#each props.files as file (file.path)}
			<div class="group hover:preset-tonal flex items-center gap-2 rounded-base py-0.5 pr-2 pl-7">
				<button
					class="flex min-w-0 flex-1 items-center gap-1.5 text-left disabled:cursor-default"
					disabled={file.change === 'deleted'}
					onclick={() => openChanges(file, props.agent)}
					use:tip={props.labels.relPath(file.path)}
				>
					<ChangedFileName name={props.labels.baseName(file.path)} dir={props.labels.dirName(file.path)} badge={changeBadge(file)} />
				</button>
				<Popover
					open={menuFor === file.path}
					onOpenChange={(e) => (menuFor = e.open ? file.path : null)}
					positioning={{ placement: 'bottom-end', offset: { mainAxis: 2 } }}
					autoFocus={false}
				>
					<Popover.Trigger class="{MENU_TRIGGER} {hoverAction(menuFor === file.path)}" aria-label={m.vcs_row_actions()}>
						{#snippet element(attrs)}
							<button {...attrs} use:tip={m.vcs_row_actions()}><MoreHorizontal class="size-3.5" /></button>
						{/snippet}
					</Popover.Trigger>
					<Portal>
						<Popover.Positioner class="z-floating-ui">
							<Popover.Content class={MENU_CARD}>
								{#if file.change !== 'deleted'}
									<button
										type="button"
										class={MENU_ITEM}
										onclick={() => {
											menuFor = null;
											openChanges(file, props.agent);
										}}
									>
										<GitCompare class={MENU_ICON} />
										{m.wsview_diff_heading()}
									</button>
								{/if}
								{#if canRevert(file)}
									{#if file.change !== 'deleted'}<div class={MENU_SEPARATOR}></div>{/if}
									<button
										type="button"
										class="{MENU_ITEM} {MENU_DANGER}"
										onclick={() => {
											menuFor = null;
											void revertChange(file);
										}}
									>
										<Undo2 class="size-4 shrink-0" />
										{file.change === 'deleted' ? m.agent_panel_restore() : m.agent_panel_revert({ agent: props.agent })}
									</button>
								{/if}
							</Popover.Content>
						</Popover.Positioner>
					</Portal>
				</Popover>
			</div>
		{/each}
	{/if}
</div>
