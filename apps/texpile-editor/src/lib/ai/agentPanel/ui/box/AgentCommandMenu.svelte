<script lang="ts">
	// the agent's slash commands matching what follows the /, above the box. The focus stays in the box: the keys that
	// move through the list are read there, and a click here takes a row without taking the focus
	import { menuItemClass, menuPanelClass } from '$lib/menus/menuStyles';
	import type { AgentCommand } from '../../agentPanel.types';

	type Props = { id: string; commands: AgentCommand[]; picked: AgentCommand | undefined; onPick: (command: AgentCommand) => void };
	const props: Props = $props();
</script>

<div
	id={props.id}
	class="{menuPanelClass} absolute right-0 bottom-full left-0 z-20 mb-1 flex max-h-64 flex-col overflow-y-auto"
	role="listbox"
>
	{#each props.commands as command (command.name)}
		<div
			id="{props.id}-{command.name}"
			class="{menuItemClass} items-baseline"
			role="option"
			tabindex="-1"
			aria-selected={command === props.picked}
			data-highlighted={command === props.picked ? '' : undefined}
			onmousedown={(e) => {
				e.preventDefault();
				props.onPick(command);
			}}
		>
			<span class="shrink-0 font-mono text-xs">/{command.name}</span>
			{#if command.hint}<span class="text-muted shrink-0 font-mono text-xs italic">{command.hint}</span>{/if}
			<span class="text-muted min-w-0 truncate text-xs">{command.description}</span>
		</div>
	{/each}
</div>
