<script lang="ts">
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
	import type { FigureEditorState } from '../../state/editorState.svelte';
	import { menuContentClass, separatorClass } from '../../ui/menuStyles';
	import { saveSvg } from '../saveSvg';
	import { copyPictureText, downloadTex, openTexFile } from './menuBarCommands';
	import MenuBarItem from './MenuBarItem.svelte';
	import MenuBarTrigger from './MenuBarTrigger.svelte';
	import { shortcutText } from './shortcutText';

	type Props = { editor: FigureEditorState };
	const props: Props = $props();

	let picker = $state<HTMLInputElement>();

	function selectFileItem(value: string) {
		const kind = props.editor.language.newPictures.find((k) => `new:${k.id}` === value);
		if (kind) props.editor.newPicture(kind);
		else if (value === 'open') picker?.click();
		else if (value === 'save') downloadTex(props.editor);
		else if (value === 'copy') void copyPictureText(props.editor);
		else if (value === 'svg') void saveSvg(props.editor);
	}

	// the browser's own Ctrl+S and Ctrl+O would save or open the page
	function onkeydown(e: KeyboardEvent) {
		if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
		const key = e.key.toLowerCase();
		if (key !== 's' && key !== 'o') return;
		e.preventDefault();
		selectFileItem(key === 's' ? 'save' : 'open');
	}
</script>

<svelte:window {onkeydown} />

<input
	bind:this={picker}
	class="hidden"
	type="file"
	accept=".tex,text/x-tex,text/plain"
	onchange={() => {
		const file = picker?.files?.[0];
		if (file) void openTexFile(props.editor, file);
		// the same file picked again is a change too
		if (picker) picker.value = '';
	}}
/>
<Menu onSelect={(d) => selectFileItem(d.value)}>
	<MenuBarTrigger label="File" />
	<Portal>
		<Menu.Positioner>
			<Menu.Content class={menuContentClass}>
				{#each props.editor.language.newPictures as kind (kind.id)}
					<MenuBarItem value="new:{kind.id}" label="New {kind.name.toLowerCase()}" />
				{/each}
				<Menu.Separator class={separatorClass} />
				<MenuBarItem value="open" label="Open .tex file…" shortcut={shortcutText('O')} />
				<MenuBarItem value="save" label="Save as .tex" shortcut={shortcutText('S')} />
				<Menu.Separator class={separatorClass} />
				<MenuBarItem value="copy" label="Copy {props.editor.language.name}" />
				<MenuBarItem value="svg" label="Export as SVG" disabled={!props.editor.render.drawing} />
			</Menu.Content>
		</Menu.Positioner>
	</Portal>
</Menu>
