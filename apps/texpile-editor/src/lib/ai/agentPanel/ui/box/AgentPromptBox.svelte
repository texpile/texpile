<script lang="ts">
	// Where the reader writes to the agent. The open file, or the lines selected in it, goes with each message unless
	// taken off; the agent's own settings (its permission mode, its model) sit beside the box as it offers them
	import { ArrowUp, ChevronDown, Square } from '@lucide/svelte';
	import MenuDropdown from '$lib/menus/MenuDropdown.svelte';
	import AgentFilePill from '../AgentFilePill.svelte';
	import { configOptionButton, configOptionMenu } from './configOptionMenu';
	import { SlashMenu } from './slashMenu.svelte';
	import AgentCommandMenu from './AgentCommandMenu.svelte';
	import { runsCommand } from '../../slashMatch';
	import { attachedKey } from '../../attach/attached';
	import { EditorSelection } from '../../attach/editorSelection.svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { AgentCommand, Attached, ConfigOption } from '../../agentPanel.types';

	type Props = {
		agent: string;
		working: boolean;
		file: string | null;
		config: ConfigOption[];
		/** the agent's slash commands, offered when the text starts with / */
		commands: AgentCommand[];
		/** the agent takes the selected lines' text; without it only the file goes */
		takesSelection: boolean;
		onSend: (text: string, attached: Attached | null) => void;
		onStop: () => void;
		onConfig: (id: string, value: string) => void;
	};
	const props: Props = $props();
	let text = $state('');
	const slash = new SlashMenu(
		() => text,
		() => props.commands
	);
	const menuId = $props.id();
	const selected = new EditorSelection();
	$effect(() => selected.watch());
	// what the x took off, which stays off until the file or the selected lines change
	let detached = $state<string | null>(null);
	const attached = $derived.by((): Attached | null => {
		// a command goes alone: the agent runs one only when its text comes by itself
		if (!props.file || runsCommand(text, props.commands)) return null;
		const lines = props.takesSelection && selected.current?.path === props.file ? selected.current.lines : null;
		const a = { path: props.file, lines };
		return attachedKey(a) === detached ? null : a;
	});

	function send(): void {
		if (props.working || !text.trim()) return;
		props.onSend(text, attached);
		text = '';
	}

	function takeCommand(command: AgentCommand): void {
		text = slash.completion(command);
	}

	// while the / menu is open the arrows, Enter, Tab and Escape are its; Enter only completes, a second one sends
	function slashKey(e: KeyboardEvent): boolean {
		if (!slash.open || e.isComposing) return false;
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') slash.move(e.key === 'ArrowDown' ? 1 : -1);
		else if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
			if (!slash.picked) return false;
			takeCommand(slash.picked);
		} else if (e.key === 'Escape') {
			e.stopPropagation();
			slash.dismiss();
		} else return false;
		e.preventDefault();
		return true;
	}

	function onKeydown(e: KeyboardEvent): void {
		if (slashKey(e)) return;
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
			e.preventDefault();
			send();
		}
	}
</script>

<div class="px-3 pb-2">
	<!-- Skeleton's textarea on the frame, so it reads as the app's other text boxes and lights up while one types in it.
	     The text, then a row of what goes with it, as chat boxes in other editors lay it out -->
	<div class="textarea relative [--field-size:var(--text-sm)]">
		{#if slash.open}
			<AgentCommandMenu id={menuId} commands={slash.matches} picked={slash.picked} onPick={takeCommand} />
		{/if}
		<textarea
			class="field-sizing-content block max-h-32 min-h-5 w-full resize-none bg-transparent text-sm leading-5 outline-none placeholder:text-[var(--field-placeholder)]"
			rows="1"
			placeholder={m.agent_panel_placeholder({ agent: props.agent })}
			aria-label={m.agent_panel_placeholder({ agent: props.agent })}
			aria-autocomplete="list"
			aria-controls={slash.open ? menuId : undefined}
			aria-activedescendant={slash.open && slash.picked ? `${menuId}-${slash.picked.name}` : undefined}
			bind:value={text}
			onkeydown={onKeydown}
			onfocus={() => selected.read()}></textarea>
		<div class="mt-1.5 flex h-6 items-center gap-1">
			{#if attached}<AgentFilePill {attached} onDetach={() => (detached = attachedKey(attached))} />{/if}
			<span class="flex-1"></span>
			{#each props.config as option (option.id)}
				<MenuDropdown groups={configOptionMenu(option)} placement="bottom-end" onSelect={(v) => props.onConfig(option.id, v)}>
					{#snippet trigger(attrs)}
						<button
							{...attrs}
							class="text-muted hover:bg-surface-200-800 flex h-6 shrink-0 items-center gap-0.5 rounded-base px-1.5 text-xs whitespace-nowrap transition-colors"
							aria-label={option.name}
							use:tip={option.description ?? option.name}
						>
							{configOptionButton(option)}
							<ChevronDown class="size-3 shrink-0" />
						</button>
					{/snippet}
				</MenuDropdown>
			{/each}
			{#if props.working}
				<button
					class="btn-icon size-6 shrink-0 preset-tonal p-0"
					use:tip={m.agent_panel_stop()}
					aria-label={m.agent_panel_stop()}
					onclick={props.onStop}
				>
					<Square class="size-2.5 fill-current" />
				</button>
			{:else}
				<button
					class="btn-icon size-6 shrink-0 preset-filled-primary-500 p-0"
					disabled={!text.trim()}
					use:tip={m.agent_panel_send()}
					aria-label={m.agent_panel_send()}
					onclick={send}
				>
					<ArrowUp class="size-3.5" />
				</button>
			{/if}
		</div>
	</div>
</div>
