<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { LibraryBig, Lock, LockOpen } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import type { FigureEditorState } from '../state/editorState.svelte';
	import { familyOf } from '../state/drawModes/drawModes';
	import DrawModeIcon from './DrawModeIcon.svelte';
	import DrawModeMenu from './DrawModeMenu.svelte';
	import MoreToolsMenu from './MoreToolsMenu.svelte';
	import { MODE_MENU_TOOLS, VIEW_TOOLS, railTools } from './tools';

	const HINTS = { grid: () => m.figure_toolbar_hint_grid(), tree: () => m.figure_toolbar_hint_tree() };

	type Props = { editor: FigureEditorState };
	const props: Props = $props();
	const layout = $derived(props.editor.picture?.layout);
	const tools = $derived(railTools(props.editor.language));
	const library = $derived(props.editor.language.features.includes('library'));
</script>

<!-- floats over the top of the canvas as Texpile's format bar does, so the canvas runs the full width -->
<div
	class="bg-surface-50-950 border-surface-200-800 rounded-container absolute inset-x-0 top-3 z-20 mx-auto flex w-fit max-w-[calc(100%-1.5rem)] flex-wrap items-center justify-center gap-1 border px-2 py-0.5 shadow-lg"
	role="toolbar"
	aria-label={m.figure_toolbar()}
>
	{#if !layout}
		<button
			class="btn-icon btn-icon-base {props.editor.toolLocked ? 'bg-primary-tint text-primary-ink' : 'hover:preset-tonal'}"
			aria-pressed={props.editor.toolLocked}
			aria-label={m.figure_tool_keep()}
			onclick={() => (props.editor.toolLocked = !props.editor.toolLocked)}
			use:tip={m.figure_tool_keep_tip()}
		>
			{#if props.editor.toolLocked}<Lock class="size-4" />{:else}<LockOpen class="size-4" />{/if}
		</button>
		<span class="border-surface-300-700 mx-1 h-5 border-l"></span>
	{/if}
	<!-- a diagram or a tree is laid out by TeX, so the drawing tools stand aside -->
	{#each layout ? tools.filter((t) => t && VIEW_TOOLS.has(t.id)) : tools as tool, n (tool?.id ?? `gap${n}`)}
		{#if tool}
			{@const Icon = tool.icon}
			{@const family = MODE_MENU_TOOLS.has(tool.id) ? familyOf(tool.id) : null}
			{@const mode = family ? props.editor.drawModes[family] : null}
			<button
				class="btn-icon btn-icon-base relative {props.editor.tool === tool.id ? 'bg-primary-tint text-primary-ink' : 'hover:preset-tonal'}"
				aria-pressed={props.editor.tool === tool.id}
				aria-label={tool.label()}
				onclick={() => (props.editor.tool = tool.id)}
				use:tip={`${tool.label()} (${tool.digit ? m.figure_tool_keys_or({ key: tool.key, digit: tool.digit }) : tool.key})`}
			>
				<!-- the way it draws, once that is not the plain one -->
				{#if family && mode && mode !== 'corners'}<DrawModeIcon {family} {mode} class="size-5" />{:else}<Icon class="size-5" />{/if}
				<!-- the key, as Excalidraw marks its tools -->
				<span class="text-muted pointer-events-none absolute right-0.5 bottom-0 text-[9px] leading-none">{tool.digit ?? tool.key}</span>
			</button>
			{#if family}<DrawModeMenu editor={props.editor} tool={tool.id} {family} label={tool.name()} />{/if}
		{:else}
			<span class="border-surface-300-700 mx-1 h-5 border-l"></span>
		{/if}
	{/each}
	{#if layout}
		<span class="text-muted px-2 text-xs whitespace-nowrap">{HINTS[layout]()}</span>
	{:else}
		<span class="border-surface-300-700 mx-1 h-5 border-l"></span>
		<MoreToolsMenu editor={props.editor} />
		{#if library}<button
				class="btn-icon btn-icon-base {props.editor.libraryShown ? 'bg-primary-tint text-primary-ink' : 'hover:preset-tonal'}"
				data-library-toggle
				aria-pressed={props.editor.libraryShown}
				aria-label={m.figure_library()}
				onclick={() => props.editor.showLibrary(!props.editor.libraryShown)}
				use:tip={m.figure_library_tip()}
			>
				<LibraryBig class="size-5" />
			</button>{/if}
	{/if}
</div>
