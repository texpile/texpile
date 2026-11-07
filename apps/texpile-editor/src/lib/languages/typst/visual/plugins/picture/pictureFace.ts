// a package's call that draws a picture, shown as the figure card shows one no engine has drawn: named for the package
import { mount, unmount } from 'svelte';
import { tip, faceElement, sourceHint, type ChipFace, FigurePlaceholder } from '$lib/languages/typst/visual/core';
import { readPicture } from './pictureCall';

export function pictureFace(source: string): ChipFace | null {
	const picture = readPicture(source);
	if (!picture) return null;
	const dom = faceElement('div', 'figure-card relative my-2 flex justify-center rounded-base p-2');
	const card = dom.appendChild(faceElement('div', 'relative w-full max-w-md'));
	const mounted = mount(FigurePlaceholder, { target: card, props: { title: picture.package, summary: picture.name } });
	const tipped = tip(dom, sourceHint(source));
	return {
		dom,
		line: true,
		destroy() {
			void unmount(mounted);
			tipped.destroy();
		}
	};
}
