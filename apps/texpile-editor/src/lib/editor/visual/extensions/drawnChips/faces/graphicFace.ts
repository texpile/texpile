// an image file inside a chip (\includegraphics, #image: a logo in a table cell, a panel of a figure the parse keeps as
// source), found and shown as the image node finds and shows its file
import { faceElement, type ChipFace } from '../chipFace';
import { knownLocalImageUrl, localImageUrl } from '$lib/editor/visual/extensions/image/localImageUrl';
import { missingImageNote } from '$lib/editor/visual/extensions/image/missingImagePlaceholder';
import './graphicFace.css';

export function graphicFace(path: string): ChipFace {
	const img = faceElement('img', 'drawn-graphic');
	img.alt = path;
	img.draggable = false;
	let live = true;
	function showMissing(): void {
		img.onerror = null;
		if (live) img.replaceWith(missingImageNote(path));
	}
	img.onerror = showMissing;
	const known = knownLocalImageUrl(path);
	if (known) img.src = known;
	else
		void localImageUrl(path).then((url) => {
			if (!live) return;
			if (url) img.src = url;
			else showMissing();
		});
	return { dom: img, destroy: () => void (live = false) };
}
