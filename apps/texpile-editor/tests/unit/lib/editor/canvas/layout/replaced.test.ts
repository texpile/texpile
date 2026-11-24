import { expect, it } from 'vitest';
import { faceElement, setLook, type FaceElement, type LayoutBox } from '$lib/editor/canvas';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { layoutTestBlock } from './layoutFixture';

function boxOf(box: LayoutBox, element: FaceElement): LayoutBox | null {
	if (box.element === element) return box;
	const inLines = (box.lines ?? []).flatMap((line) =>
		line.fragments.flatMap((fragment) => (fragment.kind === 'atomic' ? [fragment.box] : []))
	);
	for (const child of [...box.children, ...inLines]) {
		const found = boxOf(child, element);
		if (found) return found;
	}
	return null;
}

it('a picture held to max-width 100% in a centring flex box keeps its natural width', () => {
	const root = faceElement('div', 'figure-card');
	setLook(root, { display: 'flex', justifyContent: 'center' });
	const frame = root.appendChild(faceElement('div', 'figure-card-frame'));
	setLook(frame, { maxWidth: '100%' });
	const picture = frame.appendChild(faceElement('img', 'compiled-picture'));
	setLook(picture, { maxWidth: '100%', height: 'auto' });
	picture.replaced = { intrinsic: () => ({ width: 200, height: 100 }), paint() {} };
	const layout = layoutTestBlock(schema.nodes.paragraph.create(), { root });
	const box = boxOf(layout.box, picture);
	expect(box?.width).toBe(200);
	expect(box?.height).toBe(100);
});
