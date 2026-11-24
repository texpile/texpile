// a graphic inside the text (an \includegraphics outside a figure, a Typst image in a line), drawn from its file
import { faceElement, setLook, type ReplacedContent } from '$lib/editor/canvas';
import { pictureAt, type Picture } from '$lib/editor/visual/extensions/image/canvas/imagePicture';
import { knownLocalImageUrl, localImageUrl } from '$lib/editor/visual/extensions/image/localImageUrl';
import { m } from '$lib/paraglide/messages';
import type { ChipFace } from '../chipFace';

function pictureContent(picture: Picture, key: string): ReplacedContent {
	return {
		keys: [{ kind: 'bitmap', source: key }],
		intrinsic: () => (picture.state === 'ready' ? { width: picture.width, height: picture.height } : null),
		paint(ctx, box) {
			if (picture.state === 'ready') ctx.drawImage(picture.image, box.x, box.y, box.width, box.height);
		}
	};
}

export function graphicFace(path: string): ChipFace {
	const key = `graphic\n${path}`;
	const picture = pictureAt(window, key, async () => knownLocalImageUrl(path) ?? (await localImageUrl(path)));
	if (picture.state === 'missing') {
		const note = faceElement('span', 'drawn-graphic-missing', m.image_missing_note({ path }));
		setLook(note, { color: 'var(--muted-text)' });
		return { dom: note, reads: [{ kind: 'bitmap', source: key }] };
	}
	const img = faceElement('img', 'drawn-graphic');
	img.setAttribute('alt', path);
	img.replaced = pictureContent(picture, key);
	setLook(img, { display: 'inline-block', maxWidth: '100%', maxHeight: '10em', verticalAlign: 'middle' });
	return { dom: img, reads: [{ kind: 'bitmap', source: key }] };
}
