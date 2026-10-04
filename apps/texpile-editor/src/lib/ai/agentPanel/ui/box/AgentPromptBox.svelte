<script lang="ts">
	// Where the reader writes to the agent. The open file, or the lines selected in it, goes with each message unless
	// taken off, and so do images pasted, dropped or picked from the +; the agent's own settings (its permission mode,
	// its model) sit beside the + as it offers them
	import { ArrowUp, ChevronDown, Square } from '@lucide/svelte';
	import MenuDropdown from '$lib/menus/MenuDropdown.svelte';
	import AgentFilePill from '../AgentFilePill.svelte';
	import AgentImagePill from '../AgentImagePill.svelte';
	import { configOptionButton, configOptionMenu } from './configOptionMenu';
	import { SlashMenu } from './slashMenu.svelte';
	import AgentCommandMenu from './AgentCommandMenu.svelte';
	import AgentAddMenu from './AgentAddMenu.svelte';
	import { runsCommand } from '../../slashMatch';
	import { attachedKey } from '../../attach/attached';
	import { EditorSelection } from '../../attach/editorSelection.svelte';
	import { ImageAttachments } from '../../attach/imageAttachments.svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { AgentCommand, Attached, ConfigOption, PastedImage } from '../../agentPanel.types';

	type Props = {
		agent: string;
		working: boolean;
		file: string | null;
		config: ConfigOption[];
		/** the agent's slash commands, offered when the text starts with / */
		commands: AgentCommand[];
		/** the agent takes the selected lines' text; without it only the file goes */
		takesSelection: boolean;
		/** the agent takes images, so a pasted, dropped or picked one goes with the message */
		takesImages: boolean;
		onSend: (text: string, attached: Attached | null, images: PastedImage[]) => void;
		onStop: () => void;
		onConfig: (id: string, value: string) => void;
	};
	const props: Props = $props();
	let text = $state('');
	const images = new ImageAttachments(() => props.takesImages);
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

	const empty = $derived(!text.trim() && !images.list.length);

	function send(): void {
		if (props.working || empty) return;
		props.onSend(text, attached, images.list);
		text = '';
		images.clear();
	}

	// text on the clipboard beside an image still pastes for an agent that takes no images
	function onPaste(e: ClipboardEvent): void {
		if (images.add(e.clipboardData?.files)) e.preventDefault();
	}

	// a file let go anywhere on the box stays in it: left to the window, it would replace the app with the file
	function onDrop(e: DragEvent): void {
		if (!e.dataTransfer?.types.includes('Files')) return;
		e.preventDefault();
		e.stopPropagation();
		images.add(e.dataTransfer.files);
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
		images.refused = false;
		if (slashKey(e)) return;
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
			e.preventDefault();
			send();
		}
	}
</script>

<div class="px-3 pb-2">
	<!-- Skeleton's textarea on the frame, so it reads as the app's other text boxes and lights up while one types in it.
	     What goes with the message above the text, the + and the agent's settings under it, as chat boxes lay it out -->
	<div
		class="textarea relative [--field-size:var(--text-sm)]"
		role="group"
		ondragover={(e) => e.dataTransfer?.types.includes('Files') && e.preventDefault()}
		ondrop={onDrop}
	>
		{#if slash.open}
			<AgentCommandMenu id={menuId} commands={slash.matches} picked={slash.picked} onPick={takeCommand} />
		{/if}
		{#if attached || images.list.length}
			<div class="border-surface-200-800 mb-1.5 flex flex-wrap items-center gap-1 border-b pb-1.5">
				{#if attached}<AgentFilePill {attached} onDetach={() => (detached = attachedKey(attached))} />{/if}
				{#each images.list as image, i (i)}
					<AgentImagePill {image} onDetach={() => images.remove(i)} />
				{/each}
			</div>
		{/if}
		<textarea
			class="block field-sizing-content max-h-32 min-h-5 w-full resize-none bg-transparent text-sm leading-5 outline-none placeholder:text-[var(--field-placeholder)]"
			rows="1"
			placeholder={m.agent_panel_placeholder({ agent: props.agent })}
			aria-label={m.agent_panel_placeholder({ agent: props.agent })}
			aria-autocomplete="list"
			aria-controls={slash.open ? menuId : undefined}
			aria-activedescendant={slash.open && slash.picked ? `${menuId}-${slash.picked.name}` : undefined}
			bind:value={text}
			onkeydown={onKeydown}
			onpaste={(e) => void onPaste(e)}
			onfocus={() => selected.read()}></textarea>
		<div class="mt-1.5 flex h-6 items-center gap-1">
			<AgentAddMenu
				agent={props.agent}
				takesImages={props.takesImages}
				canAttachFile={!!props.file && !attached && !runsCommand(text, props.commands)}
				onImages={(files) => images.add(files)}
				onAttachFile={() => (detached = null)}
			/>
			{#each props.config as option (option.id)}
				<MenuDropdown groups={configOptionMenu(option)} placement="bottom-start" onSelect={(v) => props.onConfig(option.id, v)}>
					{#snippet trigger(attrs)}
						<button
							{...attrs}
							class="text-muted hover:bg-surface-200-800 rounded-base flex h-6 shrink-0 items-center gap-0.5 px-1.5 text-xs whitespace-nowrap transition-colors"
							aria-label={option.name}
							use:tip={option.description ?? option.name}
						>
							{configOptionButton(option)}
							<ChevronDown class="size-3 shrink-0" />
						</button>
					{/snippet}
				</MenuDropdown>
			{/each}
			<span class="flex-1"></span>
			{#if props.working}
				<button
					class="btn-icon preset-tonal size-6 shrink-0 p-0"
					use:tip={m.agent_panel_stop()}
					aria-label={m.agent_panel_stop()}
					onclick={props.onStop}
				>
					<Square class="size-2.5 fill-current" />
				</button>
			{:else}
				<button
					class="btn-icon preset-filled-primary-500 size-6 shrink-0 p-0"
					disabled={empty}
					use:tip={m.agent_panel_send()}
					aria-label={m.agent_panel_send()}
					onclick={send}
				>
					<ArrowUp class="size-3.5" />
				</button>
			{/if}
		</div>
	</div>
	{#if images.refused}<p class="text-muted mt-1 px-1 text-xs">{m.agent_panel_no_images({ agent: props.agent })}</p>{/if}
</div>
