// A picture a paste brings along is kept when the clipboard holds it (a data: URL), and written into
// the project like a pasted screenshot. One that only links to the web or to a file is left out:
// the app never loads remote images (a remote one would tell its host the paste happened), and a
// file link from Word points into a temporary folder.
import { Fragment, Slice, type Node as PMNode } from 'prosemirror-model';
import { PluginKey, type PluginSpec, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { imagePluginKey } from '$lib/editor/visual/extensions/image/imagepluginutils';
import type { ImagePluginSettings } from '$lib/editor/visual/extensions/image/types';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';

export type PasteDialect = 'latex' | 'typst' | 'markdown';

type PastedImageFate = 'keep' | 'save' | 'drop';

// a Markdown file can point at a web image; LaTeX and Typst cannot load one
function imageFate(src: string, dialect: PasteDialect): PastedImageFate {
	if (/^data:image\//i.test(src)) return 'save';
	if (/^https?:/i.test(src)) return dialect === 'markdown' ? 'keep' : 'drop';
	// a scheme is two letters or more; `C:/figures/a.png` is a Windows path in the file's own \includegraphics
	return /^[a-z][a-z0-9+.-]+:/i.test(src) ? 'drop' : 'keep';
}

function isKept(src: string, dialect: PasteDialect, canSave: boolean): boolean {
	const fate = imageFate(src, dialect);
	return fate === 'keep' || (fate === 'save' && canSave);
}

function withoutUnkeptImages(fragment: Fragment, dialect: PasteDialect, canSave: boolean): Fragment {
	const kept: PMNode[] = [];
	fragment.forEach((node) => {
		if (node.type.name === 'image') {
			if (isKept(String(node.attrs.src ?? ''), dialect, canSave)) kept.push(node);
			return;
		}
		if (!node.childCount) return void kept.push(node);
		const content = withoutUnkeptImages(node.content, dialect, canSave);
		const rebuilt = node.type.validContent(content) ? node.copy(content) : node.type.createAndFill(node.attrs, content, node.marks);
		if (rebuilt) kept.push(rebuilt);
	});
	return Fragment.from(kept);
}

/** `slice` without the pictures a file of `dialect` cannot keep; `canSave` is whether one the clipboard holds can be written into the project */
export function sliceWithKeptImages(slice: Slice, dialect: PasteDialect, canSave: boolean): Slice {
	const content = withoutUnkeptImages(slice.content, dialect, canSave);
	const open = Slice.maxOpen(content);
	return new Slice(content, Math.min(slice.openStart, open.openStart), Math.min(slice.openEnd, open.openEnd));
}

function fileOfDataUrl(url: string): File {
	const [head, body] = url.split(',', 2);
	const type = /^data:([^;,]+)/.exec(head)?.[1] ?? 'image/png';
	const bytes = /;base64$/i.test(head)
		? Uint8Array.from(atob(body), (c) => c.charCodeAt(0))
		: new TextEncoder().encode(decodeURIComponent(body));
	return new File([bytes], `pasted.${type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png'}`, { type });
}

/** a picture a paste from another app put in, showing the clipboard's data until it is saved */
type UnsavedImage = { pos: number; src: string };

const unsavedImagesKey = new PluginKey<UnsavedImage[]>('unsavedPastedImages');

/** the images `tr` put in that show one of `srcs` */
function insertedImages(tr: Transaction, srcs: Set<string>): UnsavedImage[] {
	const found = new Map<number, string>();
	tr.mapping.maps.forEach((map, i) => {
		const later = tr.mapping.slice(i + 1);
		map.forEach((_oldFrom, _oldTo, newFrom, newTo) => {
			const from = later.map(newFrom, 1);
			tr.doc.nodesBetween(from, later.map(newTo, -1), (node, pos) => {
				if (pos >= from && node.type.name === 'image' && srcs.has(node.attrs.src)) found.set(pos, node.attrs.src);
			});
		});
	});
	return [...found].map(([pos, src]) => ({ pos, src }));
}

/** point the images a paste put in showing `src` at `saved`, or take them out when it could not be saved */
function repointImages(view: EditorView, src: string, saved: string | null): void {
	const tr = view.state.tr;
	const unsaved = new Set((unsavedImagesKey.getState(view.state) ?? []).filter((image) => image.src === src).map((image) => image.pos));
	for (const pos of [...unsaved].sort((a, b) => b - a)) {
		const node = tr.doc.nodeAt(pos);
		if (node?.type.name !== 'image' || node.attrs.src !== src) continue;
		if (saved) tr.setNodeMarkup(pos, null, { ...node.attrs, src: saved });
		else tr.delete(pos, pos + node.nodeSize);
	}
	// the paste is the undo step; where its picture was written is not a second one
	view.dispatch(tr.setMeta(unsavedImagesKey, src).setMeta('addToHistory', false));
}

/** where the picture was written in the project; null when it could not be, a data URL that does not decode included */
async function savedImage(settings: ImagePluginSettings | undefined, src: string): Promise<string | null> {
	if (!settings) return null;
	try {
		return await settings.uploadFile(fileOfDataUrl(src));
	} catch {
		return null;
	}
}

async function saveClipboardImages(view: EditorView, sources: string[]): Promise<void> {
	const settings = imagePluginKey.get(view.state)?.spec.settings as ImagePluginSettings | undefined;
	for (const src of sources) {
		const saved = await savedImage(settings, src);
		if (view.isDestroyed) return;
		repointImages(view, src, saved);
	}
}

/** the smart paste plugin's part that saves the clipboard pictures a paste puts in, once it has put them in */
export function pastedImageSaving(): PluginSpec<UnsavedImage[]> {
	let expected: Set<string> | null = null;
	return {
		key: unsavedImagesKey,
		expect: (srcs: Set<string>) => void (expected = srcs),
		state: {
			init: () => [],
			apply(tr, unsaved) {
				const pasted = expected && tr.docChanged ? insertedImages(tr, expected) : [];
				if (pasted.length) expected = null;
				if (!unsaved.length && !pasted.length) return unsaved;
				const settled = tr.getMeta(unsavedImagesKey) as string | undefined;
				const kept = unsaved.filter((image) => image.src !== settled).map((image) => ({ ...image, pos: tr.mapping.map(image.pos, 1) }));
				return [...kept, ...pasted];
			}
		},
		view: () => ({
			update(view, prev) {
				const unsaved = unsavedImagesKey.getState(view.state);
				if (!unsaved?.length || unsaved === unsavedImagesKey.getState(prev)) return;
				const before = new Set(unsavedImagesKey.getState(prev)?.map((image) => image.src));
				const fresh = new Set(unsaved.flatMap((image) => (before.has(image.src) ? [] : [image.src])));
				if (fresh.size) void saveClipboardImages(view, [...fresh]);
			}
		})
	};
}

/**
 * The pasted slice without the pictures it cannot keep. With `save` (a paste from another app, not
 * a copy or drag inside Texpile) the ones the clipboard holds are saved once the paste puts them in.
 */
export function keepSavableImages(slice: Slice, view: EditorView, dialect: PasteDialect, save: boolean): Slice {
	const toSave = new Set<string>();
	slice.content.descendants((node) => {
		if (node.type.name === 'image' && imageFate(String(node.attrs.src ?? ''), dialect) === 'save') toSave.add(node.attrs.src);
	});
	if (save && toSave.size) unsavedImagesKey.get(view.state)?.spec.expect(toSave);
	return leavesOutImages(slice, dialect) ? sliceWithKeptImages(slice, dialect, true) : slice;
}

/** whether `slice` holds a picture a file of `dialect` cannot show, which keepSavableImages takes out */
export function leavesOutImages(slice: Slice, dialect: PasteDialect): boolean {
	let found = false;
	slice.content.descendants((node) => {
		if (node.type.name === 'image' && imageFate(String(node.attrs.src ?? ''), dialect) === 'drop') found = true;
		return !found;
	});
	return found;
}

/** tells the author a paste went in without some of its pictures; only once it has gone in */
export function warnImagesLeftOut(): void {
	toaster.warning({ title: m.paste_images_left_out(), description: m.paste_images_left_out_note(), duration: 8000 });
}
