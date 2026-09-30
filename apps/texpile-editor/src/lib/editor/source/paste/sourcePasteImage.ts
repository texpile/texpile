// A picture pasted into a source file is saved into the project's images folder, as the visual
// editor saves one, and referenced at the caret.
import type { EditorView as CMView } from '@codemirror/view';
import { uploadLocalImage } from '$lib/editor/visual/extensions/image/imageplugin.svelte';
import { DEFAULT_FIGURE_FRACTION } from '$lib/editor/visual/extensions/image/figureDefaults';
import { typStr } from '$lib/languages/typst/visual/serialize/typstInline';
import { offerPackageFor } from '$lib/languages/latex/symbols/latexSymbolPackage';
import type { PasteDialect } from '$lib/editor/paste/pastedImages';

const GRAPHICX = { command: '\\includegraphics', package: 'graphicx', fontenc: '' };

/** the picture a paste holds on its own; a spreadsheet or word processor puts one of the selection beside its rich text */
export function clipboardImage(clipboard: DataTransfer): File | null {
	if (clipboard.types.includes('text/rtf')) return null;
	for (const item of clipboard.items) if (item.kind === 'file' && item.type.startsWith('image/')) return item.getAsFile();
	return null;
}

/** the picture at `src` in the file's language, as wide as the visual editor makes a new one */
export function imageSource(src: string, dialect: PasteDialect): string {
	if (dialect === 'latex') return `\\includegraphics[width=${DEFAULT_FIGURE_FRACTION}\\textwidth]{${src}}`;
	if (dialect === 'typst') return `#image(${typStr(src)}, width: ${DEFAULT_FIGURE_FRACTION * 100}%)`;
	// CommonMark ends a bare destination at a space and pairs its parentheses
	return /[\s()]/.test(src) ? `![](<${src}>)` : `![](${src})`;
}

export async function pasteImageFile(view: CMView, file: File, dialect: PasteDialect, imageDir: string): Promise<void> {
	const src = await uploadLocalImage(file, imageDir).catch(() => null);
	if (!src || !view.dom.isConnected) return;
	view.dispatch({ ...view.state.replaceSelection(imageSource(src, dialect)), userEvent: 'input.paste', scrollIntoView: true });
	if (dialect === 'latex') offerPackageFor(GRAPHICX);
}
