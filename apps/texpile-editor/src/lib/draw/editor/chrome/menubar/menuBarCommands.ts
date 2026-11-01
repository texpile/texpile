import type { FigureEditorState } from '../../state/editorState.svelte';
import { copySelectionText, pasteText } from '../../state/selection/pasteCommands';
import { deleteSelection } from '../../state/selection/selectionCommands';

export function downloadTex(editor: FigureEditorState) {
	const url = URL.createObjectURL(new Blob([editor.source], { type: 'text/x-tex' }));
	const link = Object.assign(document.createElement('a'), { href: url, download: 'figure.tex' });
	link.click();
	URL.revokeObjectURL(url);
}

export async function openTexFile(editor: FigureEditorState, file: File) {
	editor.load(await file.text());
}

export async function copyPictureText(editor: FigureEditorState) {
	const picture = editor.pictures[editor.shownIndex];
	await navigator.clipboard.writeText(picture ? editor.source.slice(picture.from, picture.to) : editor.source);
}

export async function copySelection(editor: FigureEditorState, cut: boolean) {
	const text = copySelectionText(editor);
	if (!text) return;
	await navigator.clipboard.writeText(text);
	if (cut) deleteSelection(editor);
}

export async function pasteClipboard(editor: FigureEditorState) {
	const text = await navigator.clipboard.readText();
	if (text) pasteText(editor, text, null);
}
