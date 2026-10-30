<script lang="ts">
	import { LibraryBig, Lock, LockOpen } from '@lucide/svelte';
	import { tip } from '../ui/tooltip';
	import type { FigureEditorState } from '../state/editorState.svelte';
	import { familyOf } from '../state/drawModes/drawModes';
	import DrawModeIcon from './DrawModeIcon.svelte';
	import DrawModeMenu from './DrawModeMenu.svelte';
	import MoreToolsMenu from './MoreToolsMenu.svelte';
	import { MODE_MENU_TOOLS, VIEW_TOOLS, railTools } from './tools';

	const HINTS = {
		grid: "Click a free place to add a cell, drag from a cell's side to draw an arrow",
		tree: 'Tab adds a child and Enter a sibling, drag a node onto another to move it there'
	};

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
	aria-label="Tools"
>
	{#if !layout}
		<button
			class="btn-icon btn-icon-base {props.editor.toolLocked ? 'bg-primary-tint text-primary-ink' : 'hover:preset-tonal'}"
			aria-pressed={props.editor.toolLocked}
			aria-label="Keep the tool after drawing"
			onclick={() => (props.editor.toolLocked = !props.editor.toolLocked)}
			use:tip={'Keep the tool after drawing (Q)'}
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
				aria-label={tool.label}
				onclick={() => (props.editor.tool = tool.id)}
				use:tip={`${tool.label} (${tool.digit ? `${tool.key} or ${tool.digit}` : tool.key})`}
			>
				<!-- the way it draws, once that is not the plain one -->
				{#if family && mode && mode !== 'corners'}<DrawModeIcon {family} {mode} class="size-5" />{:else}<Icon class="size-5" />{/if}
				<!-- the key, as Excalidraw marks its tools -->
				<span class="text-muted pointer-events-none absolute right-0.5 bottom-0 text-[9px] leading-none">{tool.digit ?? tool.key}</span>
			</button>
			{#if family}<DrawModeMenu editor={props.editor} tool={tool.id} {family} label={tool.label.split(',')[0]} />{/if}
		{:else}
			<span class="border-surface-300-700 mx-1 h-5 border-l"></span>
		{/if}
	{/each}
	{#if layout}
		<span class="text-muted px-2 text-xs whitespace-nowrap">{HINTS[layout]}</span>
	{:else}
		<span class="border-surface-300-700 mx-1 h-5 border-l"></span>
		<MoreToolsMenu editor={props.editor} />
		{#if library}<button
				class="btn-icon btn-icon-base {props.editor.libraryShown ? 'bg-primary-tint text-primary-ink' : 'hover:preset-tonal'}"
				data-library-toggle
				aria-pressed={props.editor.libraryShown}
				aria-label="Library"
				onclick={() => props.editor.showLibrary(!props.editor.libraryShown)}
				use:tip={'Library: shapes, math, solids and plots to add (I)'}
			>
				<LibraryBig class="size-5" />
			</button>{/if}
	{/if}
</div>
