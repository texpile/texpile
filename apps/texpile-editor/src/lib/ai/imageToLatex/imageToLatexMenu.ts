// Convert to LaTeX on a picture and Paste as LaTeX, for both right-click menus. Both are left out while no agent is
// picked
import { ClipboardPaste, ScanText } from '@lucide/svelte';
import type { ContextMenuItem } from '$lib/menus/contextMenu.svelte';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';
import { agentOffered } from '$lib/ai/agent/aiAgent.svelte';
import { imageToLatexBridge } from './imageToLatexBridge';
import type { EditorView } from 'prosemirror-view';
import type { EditorView as CMView } from '@codemirror/view';
import type { ImageDialect } from './imagePrompt';
import { imageToLatexRequest, type ImageToLatexTarget, type RegionFirst } from './imageToLatexRequest';
import { sourceImageTarget, visualImageTarget } from './imageTargets';
import { imageDialectOf, imageSrcAt } from './sourceImageAt';

function imageReaderAvailable(): boolean {
	return agentOffered() !== null && !!imageToLatexBridge();
}

async function clipboardPicture(): Promise<Blob | null> {
	for (const item of await navigator.clipboard.read().catch(() => [])) {
		const type = item.types.find((t) => t.startsWith('image/'));
		if (type) return item.getType(type);
	}
	return null;
}

async function pictureAt(url: string | null): Promise<Blob | null> {
	if (!url) return null;
	return fetch(url)
		.then((r) => (r.ok ? r.blob() : null))
		.catch(() => null);
}

function open(target: ImageToLatexTarget, blob: Blob | null, regionFirst: RegionFirst, missing: string): void {
	if (!blob) return void toaster.info({ title: missing, duration: 4000 });
	imageToLatexRequest.current = { target, picture: { blob, regionFirst } };
}

function convertLabel(dialect: ImageDialect): string {
	return dialect === 'typst' ? m.ai_image_convert_typst() : m.ai_image_convert_latex();
}

/** `url` is the picture as the editor shows it, a PDF's page already drawn */
function convertImageItem(url: () => Promise<string | null>, target: () => ImageToLatexTarget): ContextMenuItem[] {
	if (!imageReaderAvailable()) return [];
	const t = target();
	return [
		{
			label: convertLabel(t.dialect),
			icon: ScanText,
			onclick: () =>
				void url()
					.then(pictureAt)
					.then((blob) => open(t, blob, 'large', m.ai_image_unreadable()))
		}
	];
}

function pasteAsLatexItem(target: () => ImageToLatexTarget): ContextMenuItem[] {
	if (!imageReaderAvailable()) return [];
	const t = target();
	return [
		{
			label: t.dialect === 'typst' ? m.ai_image_paste_typst() : m.ai_image_paste_latex(),
			icon: ClipboardPaste,
			onclick: () => void clipboardPicture().then((blob) => open(t, blob, 'never', m.ai_image_no_picture()))
		}
	];
}

/** the picture the pointer is on: the image node itself, or its caption */
function imageUnder(view: EditorView, at: { pos: number; inside: number } | null): { src: string; at: number } | null {
	if (!at) return null;
	const doc = view.state.doc;
	for (const pos of [at.inside, at.pos]) {
		const node = pos >= 0 ? doc.nodeAt(pos) : null;
		if (node?.type.name === 'image') return { src: String(node.attrs.src), at: pos };
	}
	const $pos = doc.resolve(at.pos);
	for (let d = $pos.depth; d > 0; d--)
		if ($pos.node(d).type.name === 'image') return { src: String($pos.node(d).attrs.src), at: $pos.before(d) };
	return null;
}

/** both items for the visual editor's menu: Convert on the picture under the pointer, Paste as LaTeX at the caret */
export function visualImageItems(at: { pos: number; inside: number } | null, view: EditorView, dialect: ImageDialect): ContextMenuItem[] {
	if (!imageReaderAvailable() || !view.editable) return [];
	const image = imageUnder(view, at);
	const items: ContextMenuItem[] = [];
	if (image) {
		items.push(
			...convertImageItem(
				() => shownUrl(image.src),
				() => visualImageTarget(view, dialect, image)
			)
		);
	}
	items.push(...pasteAsLatexItem(() => visualImageTarget(view, dialect, null)));
	return items;
}

// the PDF reader a PDF figure is drawn with comes with the first one converted
async function shownUrl(src: string): Promise<string | null> {
	const { localImageUrl } = await import('$lib/editor/visual/extensions/image/localImageUrl');
	return localImageUrl(src).catch(() => null);
}

/** the same for the source editor, on the line's \includegraphics or image() */
export function sourceImageItems(view: CMView, pos: number | null, path: string): ContextMenuItem[] {
	if (!imageReaderAvailable()) return [];
	const dialect = imageDialectOf(path);
	const items: ContextMenuItem[] = [];
	if (pos !== null) {
		const line = view.state.doc.lineAt(pos);
		const src = imageSrcAt(line.text, pos - line.from, dialect);
		if (src)
			items.push(
				...convertImageItem(
					() => shownUrl(src),
					() => sourceImageTarget(view, dialect, { src, line: line.number })
				)
			);
	}
	items.push(...pasteAsLatexItem(() => sourceImageTarget(view, dialect, null)));
	return items;
}
