// a TikZ or CeTZ picture on the canvas: what the figure engine or the last compile drew of it, else its placeholder,
// and the Edit figure action that opens it in its figure tab
import { Pencil } from '@lucide/svelte';
import { faceElement, setLook, type BlockAction, type ReplacedContent } from '$lib/editor/canvas';
import type { ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { pictureAt, reloadPicture, type Picture } from '$lib/editor/visual/extensions/image/canvas/imagePicture';
import { GUEST_ROOT } from '$lib/collab/sessionProvider';
import { m } from '$lib/paraglide/messages';
import { workspaceRoot } from '$lib/workspace/workspaceStore';
import { cachedDrawing, loadSavedDrawing, onDrawingsChange } from '../drawingCache';
import { onCompiledChange, resolveCardPicture } from './compiled/compiledPictures.svelte';
import { figurePlaceholderFace } from './figurePlaceholderFace';

export type FigureCardParts = {
	/** the drawing cache's key and the picture's source, with its place among the file's pictures for the compiled crop */
	key: string;
	picture: string;
	index(): number;
	title: string;
	summary: string;
	/** a figure the compiled PDF can draw (TikZ; CeTZ has no SyncTeX) */
	fromPdf: boolean;
	open(): void;
};

const shown = new Set<string>();
// a compiled crop's size in css px, which its bitmap holds at the PDF's resolution
const cropSizes = new Map<string, { width: number; height: number }>();
let watching = false;

function watchPictures(): void {
	if (watching) return;
	watching = true;
	function again(): void {
		for (const key of shown) reloadPicture(window, key);
	}
	onDrawingsChange(again);
	onCompiledChange(again);
}

function svgUrl(svg: string | null): string {
	return svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : '';
}

async function cardUrl(parts: FigureCardParts, key: string): Promise<string> {
	if (!parts.fromPdf) return svgUrl(cachedDrawing(parts.key));
	const card = await resolveCardPicture(parts.key, parts.picture, parts.index());
	if (card.compiled) {
		cropSizes.set(key, { width: card.compiled.width, height: card.compiled.height });
		return card.compiled.url;
	}
	cropSizes.delete(key);
	return svgUrl(card.svg);
}

function pictureContent(picture: Picture, key: string): ReplacedContent {
	return {
		intrinsic: () => (picture.state === 'ready' ? (cropSizes.get(key) ?? { width: picture.width, height: picture.height }) : null),
		paint(ctx, box) {
			if (picture.state === 'ready') ctx.drawImage(picture.image, box.x, box.y, box.width, box.height);
		}
	};
}

/** the card's action in the bar over it while it is selected; a guest has no folder on disk for the figure tab to draw from */
function cardActions(parts: FigureCardParts): readonly BlockAction[] {
	if (workspaceRoot.current === GUEST_ROOT) return [];
	return [{ key: 'edit-figure', label: m.figure_edit(), icon: Pencil, run: parts.open }];
}

export function figureCardFace(parts: FigureCardParts): ChipFace {
	watchPictures();
	if (!cachedDrawing(parts.key)) void loadSavedDrawing(parts.key);
	const key = `figure\n${parts.key}`;
	shown.add(key);
	const picture = pictureAt(window, key, () => cardUrl(parts, key));
	const drawn = picture.state === 'ready';
	const dom = faceElement('div', 'figure-card');
	setLook(dom, { display: 'flex', justifyContent: 'center', margin: 'calc(var(--spacing) * 2) 0', padding: 'calc(var(--spacing) * 2)' });
	dom.on.dblclick = () => {
		parts.open();
		return true;
	};
	const frame = dom.appendChild(faceElement('div', 'figure-card-frame'));
	// the block bar's Edit figure shows on hover, as an image's Crop does
	frame.anchor = 'picture';
	setLook(frame, drawn ? { position: 'relative', maxWidth: '100%' } : { position: 'relative', width: '100%', maxWidth: '28rem' });
	if (drawn) {
		// on white in dark mode: a picture's black ink is made for paper
		const ground = frame.appendChild(faceElement('div', 'figure-card-ground'));
		setLook(ground, {
			display: 'flex',
			justifyContent: 'center',
			backgroundColor: 'light-dark(transparent, white)',
			borderRadius: 'var(--radius-base)'
		});
		const image = ground.appendChild(faceElement('img', 'compiled-picture'));
		image.setAttribute('alt', parts.title);
		image.setAttribute('data-source', cropSizes.has(key) ? 'pdf' : 'drawing');
		image.replaced = pictureContent(picture, key);
		setLook(image, { maxWidth: '100%', height: 'auto' });
	} else frame.appendChild(figurePlaceholderFace(parts.title, parts.summary));
	return { dom, line: true, reads: [{ kind: 'bitmap', source: key }], actions: () => cardActions(parts) };
}
