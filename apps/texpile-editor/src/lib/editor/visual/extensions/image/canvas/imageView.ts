// a figure drawn on the canvas as P0 drew it: the picture fitted to the column, the caption under it,
// and the missing-file note in the picture's place
import type { Node as PMNode } from 'prosemirror-model';
import type { Decoration } from 'prosemirror-view';
import type { CanvasNodeViewConstructor, CanvasViewSet, ReplacedContent, StyleLook, VisualView } from '$lib/editor/canvas';
import { countOf, setLook } from '$lib/editor/canvas';
import { compiledNumbersOf } from '$lib/editor/visual/extensions/nodeNumbers';
import type { Dialect } from '$lib/editor/visual/dialect';
import { m } from '$lib/paraglide/messages';
import { imagePluginKey } from '../imagepluginutils';
import type { ImagePluginSettings } from '../types';
import { cropAt, CROP_KEY } from './imageCrop';
import { imageActions, imageOverlays } from './imageOverlays';
import { pictureFor, pictureKey, type Picture } from './imagePicture';
import { RESIZE_KEY, resizeAt, type CanvasResize } from './imageResize';
import { imageSettingsOffer } from './imageSettingsOffer';
import { watchPictureFiles } from './pictureFileWatch';

const ROOT_LOOK: StyleLook = { display: 'flex', flexDirection: 'column', position: 'relative', borderRadius: 'var(--radius-base)' };
// on white in dark mode, as a drawn figure is: a picture's ink is made for paper
const IMAGE_LOOK: StyleLook = { alignSelf: 'center', backgroundColor: 'light-dark(transparent, white)' };
const CAPTION_LOOK: StyleLook = { textAlign: 'center' };
const HIDDEN_LOOK: StyleLook = { display: 'none' };
const MISSING_LOOK: StyleLook = { display: 'block', textAlign: 'center', color: 'var(--muted-text)' };
// in a LaTeX figure group the pictures share the row evenly, and each captioned one is lettered (a), (b)
const GROUPED_ROOT_LOOK: StyleLook = { flex: '1 1 0', minWidth: '0px' };
const GROUPED_PICTURE_LOOK: StyleLook = { width: '100%', maxWidth: '100%', height: 'auto' };
const SUBFIGURE_LOOK: StyleLook = { color: 'var(--muted-text)' };
const NUMBER_LOOK: StyleLook = { fontWeight: '600', color: 'var(--muted-text)', marginRight: '0.25em' };

function settingsOf(view: VisualView): ImagePluginSettings | null {
	const plugin = view.state.plugins.find((p) => p.spec.key === imagePluginKey);
	return (plugin?.spec as { settings?: ImagePluginSettings } | undefined)?.settings ?? null;
}

function pictureContent(picture: Picture): ReplacedContent {
	return {
		intrinsic: () => (picture.state === 'ready' ? { width: picture.width, height: picture.height } : null),
		paint(ctx, box) {
			if (picture.state === 'ready') ctx.drawImage(picture.image, box.x, box.y, box.width, box.height);
		}
	};
}

/** P0's fit: the width written scaled to the column, less the image margins, and never past it */
export function pictureLook(node: PMNode, settings: ImagePluginSettings): StyleLook {
	const column = `(100% - ${settings.imageMargin * 2}px)`;
	const width = Number(node.attrs.width) || 0;
	const height = Number(node.attrs.height) || 0;
	const written = Number(node.attrs.maxWidth) || 0;
	const base: StyleLook = { ...IMAGE_LOOK, maxWidth: `calc${column}` };
	if (width && written && settings.scaleImage) return { ...base, width: `calc(${column} * ${width / written})` };
	if (width) return { ...base, width: `${width}px` };
	// without resizing (Markdown) the stylesheet's width: 100% drew every picture across the column
	if (!settings.enableResize) return { ...IMAGE_LOOK, width: '100%', maxWidth: '100%' };
	return height ? { ...base, height: `${height}px` } : base;
}

/** the size a drag draws the picture at until it lets go */
function resizedLook(look: StyleLook, resize: CanvasResize): StyleLook {
	return {
		...look,
		...(resize.width === null ? {} : { width: `${resize.width}px` }),
		...(resize.height === null ? {} : { height: `${resize.height}px` })
	};
}

/** the letter of a captioned picture in a figure group, null for any other picture */
function subfigureLetter(view: VisualView, pos: number): string | null {
	const $pos = view.state.doc.resolve(pos);
	if ($pos.parent.type.name !== 'figure_group' || $pos.nodeAfter?.attrs.showCaption === false) return null;
	let index = 0;
	for (let i = 0; i < $pos.index(); i++) if ($pos.parent.child(i).attrs.showCaption !== false) index++;
	return String.fromCharCode(97 + index);
}

/** a labeled picture's `Figure 1: `: LaTeX prints the compile's number, Typst and Markdown count their own */
function figureNumberOf(view: VisualView, node: PMNode, pos: number, decorations: readonly Decoration[]): string | null {
	if (!countOf(node, 'figure')) return null;
	if (view.props.language === 'latex') return compiledNumbersOf(decorations)?.[0] ?? null;
	return String(view.canvas.build.counters.at(pos, 'figure'));
}

/** what a rebuild changes: the picture, its size, the caption's switch, its letter and its number */
function drawnWith(node: PMNode, settings: ImagePluginSettings, grouped: boolean, letter: string | null, number: string | null): string {
	const { width, height, maxWidth, showCaption } = node.attrs;
	return JSON.stringify([pictureKey(node, settings.cropFormat), width, height, maxWidth, showCaption, grouped, letter, number]);
}

function imageView(...[node, view, getPos, decorations]: Parameters<CanvasNodeViewConstructor>): ReturnType<CanvasNodeViewConstructor> {
	const settings = settingsOf(view);
	const { el, read } = view.canvas.build;
	const dom = el('div', 'imagePluginRoot');
	const grouped = view.state.doc.resolve(getPos() ?? 0).parent.type.name === 'figure_group';
	const letter = grouped ? subfigureLetter(view, getPos() ?? 0) : null;
	setLook(dom, grouped ? { ...ROOT_LOOK, ...GROUPED_ROOT_LOOK } : ROOT_LOOK);
	if (!settings) return { dom };
	const win = view.dom.ownerDocument.defaultView!;
	watchPictureFiles(win);
	const key = pictureKey(node, settings.cropFormat);
	const picture = read({ kind: 'bitmap', source: key }, () => pictureFor(win, settings, node));
	const crop = read(CROP_KEY, () => cropAt(view, getPos()));
	if (crop) {
		const slot = dom.appendChild(el('div', 'image-crop-slot'));
		slot.anchor = 'crop';
		setLook(slot, { height: `${crop.height}px` });
	} else if (picture.state === 'missing') {
		const note = dom.appendChild(el('span', 'image-missing', m.image_missing_note({ path: String(node.attrs.src) })));
		setLook(note, MISSING_LOOK);
	} else {
		const image = dom.appendChild(el('img', 'imagePluginImg'));
		image.replaced = pictureContent(picture);
		image.anchor = 'picture';
		const resize = read(RESIZE_KEY, () => resizeAt(view, getPos()));
		const look = grouped ? { ...pictureLook(node, settings), ...GROUPED_PICTURE_LOOK } : pictureLook(node, settings);
		setLook(image, resize ? resizedLook(look, resize) : look);
	}
	const caption = settings.hasTitle ? dom.appendChild(el('div', 'text')) : null;
	if (caption) setLook(caption, node.attrs.showCaption === false ? { ...CAPTION_LOOK, ...HIDDEN_LOOK } : CAPTION_LOOK);
	if (caption && letter) {
		const mark = el('span', undefined, `(${letter}) `);
		mark.generated = true;
		setLook(mark, SUBFIGURE_LOOK);
		caption.generatedBefore = mark;
	}
	const number = grouped ? null : figureNumberOf(view, node, getPos() ?? 0, decorations);
	if (caption && number) {
		const mark = el('span', undefined, `Figure ${number}: `);
		mark.generated = true;
		setLook(mark, NUMBER_LOOK);
		caption.generatedBefore = mark;
	}
	const drawn = drawnWith(node, settings, grouped, letter, number);
	const parts = { view, getPos, node, settings: grouped ? { ...settings, enableResize: false } : settings, picture, crop };
	return {
		dom,
		contentDOM: caption,
		update: (next, given) =>
			next.type === node.type &&
			drawnWith(
				next,
				settings,
				grouped,
				grouped ? subfigureLetter(view, getPos() ?? 0) : null,
				grouped ? null : figureNumberOf(view, next, getPos() ?? 0, given)
			) === drawn,
		overlays: imageOverlays(parts),
		actions: () => imageActions(parts)
	};
}

export function imageViews(dialect: Dialect): CanvasViewSet {
	return { nodeViews: { image: imageView }, blockSettings: { image: imageSettingsOffer(dialect) } };
}
