<script lang="ts">
	import { onDestroy, untrack, type Snippet } from 'svelte';
	import { copyCanvasSelection, cutCanvasSelection, pasteOntoCanvas } from '../../../canvas/canvasClipboard';
	import CanvasContextMenu from '../../../canvas/CanvasContextMenu.svelte';
	import ShortcutsDialog from '../../../chrome/ShortcutsDialog.svelte';
	import type { FigureProvider } from '../../../provider/figureEngine';
	import { FigureEditorState } from '../../../state/editorState.svelte';
	import type { HostHistory } from '../../../state/editorState.types';
	import { CanvasGesture } from '../../../state/gesture/canvasGesture.svelte';
	import { handleEditorKey } from '../../../state/keys/editorKeys';
	import { FigureEditorContext, setFigureEditor } from '../../figureEditorContext.svelte';

	type Props = {
		/** the language and the engine that draws it */
		provider: FigureProvider;
		/** read once; afterwards the editor owns the text and reports it through onchange */
		initial: string;
		onchange?: (source: string) => void;
		/** hands the editor's state to the host, to load another file into it */
		onready?: (editor: FigureEditorState) => void;
		/** the document's own undo and redo, so the figure has no second history */
		history?: HostHistory;
		/** which picture of the text to show: the first unless the host opened another */
		picture?: number;
		children: Snippet;
	};
	const props: Props = $props();

	// the props are read once on purpose: the state owns the text from here on
	const editor = untrack(
		() =>
			new FigureEditorState(
				props.provider.engine,
				props.provider.language,
				props.initial,
				(s) => props.onchange?.(s),
				props.history,
				props.picture
			)
	);
	const gesture = new CanvasGesture(editor);
	const context = setFigureEditor(new FigureEditorContext(editor, gesture));
	untrack(() => props.onready?.(editor));
	onDestroy(() => editor.destroy());
</script>

<!-- with nothing focused the keys go to the page, so they are the editor's too -->
<svelte:window
	onkeydown={(e) => e.target === document.body && handleEditorKey(e, editor, gesture) && e.preventDefault()}
	onkeyup={(e) => e.key === ' ' && (gesture.spaceDown = false)}
	onblur={() => (gesture.spaceDown = false)}
	oncopy={(e) => copyCanvasSelection(e, editor, context.frame)}
	oncut={(e) => cutCanvasSelection(e, editor, context.frame)}
	onpaste={(e) => pasteOntoCanvas(e, editor, context.frame, gesture.pointer)}
/>

{@render props.children()}
<ShortcutsDialog {editor} />
<CanvasContextMenu {editor} />
