// a figure's picture for the canvas: its file resolved as the DOM view resolved it, drawn with its crop, decoded once and
// shared by every view that shows it. A loaded picture relays the blocks that read it
import type { Node as PMNode } from 'prosemirror-model';
import { windowInvalidation } from '$lib/editor/canvas';
import { shownImageUrl, forgetShown } from '../crop/croppedImage';
import type { ImageCropFormat } from '../crop/imageCropFormat';
import type { ImagePluginSettings } from '../types';

export type Picture =
	| { readonly state: 'loading' }
	| { readonly state: 'missing' }
	| { readonly state: 'ready'; readonly image: HTMLImageElement; readonly width: number; readonly height: number; readonly url: string };

const LOADING: Picture = { state: 'loading' };
const MISSING: Picture = { state: 'missing' };
const pictures = new Map<string, Picture>();
const urls = new Map<string, string>();
const loaders = new Map<string, () => Promise<Picture>>();
/** how many times a url's file was written since it was first read: the load after a write skips the cache */
const versions = new Map<string, number>();

/** the picture's key: its source and the crop it is drawn with */
export function pictureKey(node: PMNode, format: ImageCropFormat | undefined): string {
	return `${String(node.attrs.src)}\n${format?.key(node) ?? ''}`;
}

async function decoded(doc: Document, url: string): Promise<HTMLImageElement> {
	const image = doc.createElement('img');
	image.decoding = 'async';
	image.src = url;
	await image.decode();
	return image;
}

function fresh(url: string): string {
	const version = url.startsWith('blob:') ? undefined : versions.get(url);
	return version ? `${url}${url.includes('?') ? '&' : '?'}_=${version}` : url;
}

/** `find` resolves the file's url (empty when there is none), `shown` the url drawn from it */
async function loadPicture(
	doc: Document,
	key: string,
	find: () => Promise<string>,
	shown: (url: string) => Promise<string>
): Promise<Picture> {
	try {
		const url = await find();
		if (!url) return MISSING;
		urls.set(key, url);
		const image = await decoded(doc, await shown(fresh(url)));
		return image.naturalWidth ? { state: 'ready', image, width: image.naturalWidth, height: image.naturalHeight, url } : MISSING;
	} catch {
		return MISSING;
	}
}

function settle(win: Window, key: string, load: Promise<Picture>, shown: Picture): void {
	void load.then((picture) => {
		if (pictures.get(key) !== shown) return;
		pictures.set(key, picture);
		windowInvalidation(win).fire({ kind: 'bitmap', source: key });
	});
}

/** the picture under `key`, loaded once and shared; a load that ends fires the key */
export function pictureAt(
	win: Window,
	key: string,
	find: () => Promise<string>,
	shown: (url: string) => Promise<string> = async (url) => url
): Picture {
	const known = pictures.get(key);
	if (known) return known;
	function load(): Promise<Picture> {
		return loadPicture(win.document, key, find, shown);
	}
	loaders.set(key, load);
	pictures.set(key, LOADING);
	settle(win, key, load(), LOADING);
	return LOADING;
}

export function pictureFor(win: Window, settings: ImagePluginSettings, node: PMNode): Picture {
	const src = String(node.attrs.src);
	return pictureAt(
		win,
		pictureKey(node, settings.cropFormat),
		async () => (settings.downloadImage ? await settings.downloadImage(src) : src),
		(url) => shownImageUrl(url, node, settings.cropFormat)
	);
}

/** a missing picture is looked for again; one whose file `matches` is read again, the old one shown until the new one is in */
export function forgetPictures(win: Window, matches: (url: string) => boolean): void {
	for (const [key, picture] of pictures) {
		const url = urls.get(key);
		if (picture === MISSING) {
			pictures.delete(key);
			windowInvalidation(win).fire({ kind: 'bitmap', source: key });
		} else if (picture.state === 'ready' && url !== undefined && matches(url)) {
			forgetShown(picture.url);
			versions.set(url, (versions.get(url) ?? 0) + 1);
			const load = loaders.get(key);
			if (load) settle(win, key, load(), picture);
		}
	}
}

/** the picture under `key` is loaded again, the one shown kept until the new one is in */
export function reloadPicture(win: Window, key: string): void {
	const shown = pictures.get(key);
	const load = loaders.get(key);
	if (!shown || !load) return;
	if (shown.state === 'ready') forgetShown(shown.url);
	settle(win, key, load(), shown);
}
