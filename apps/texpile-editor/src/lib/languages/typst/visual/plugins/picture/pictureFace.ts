// a package's call that draws a picture, shown as the figure card shows one no engine has drawn: named for the package
import { faceElement, setLook } from '$lib/editor/canvas';
import { figurePlaceholderFace, sourceHint, type ChipFace } from '$lib/languages/typst/visual/core';
import { readPicture } from './pictureCall';

export function pictureFace(source: string): ChipFace | null {
	const picture = readPicture(source);
	if (!picture) return null;
	const dom = faceElement('div', 'figure-card');
	setLook(dom, { display: 'flex', justifyContent: 'center', margin: 'calc(var(--spacing) * 2) 0', padding: 'calc(var(--spacing) * 2)' });
	const card = dom.appendChild(faceElement('div', 'figure-card-frame'));
	setLook(card, { position: 'relative', width: '100%', maxWidth: '28rem' });
	card.appendChild(figurePlaceholderFace(picture.package, picture.name));
	dom.hint = sourceHint(source);
	return { dom, line: true };
}
