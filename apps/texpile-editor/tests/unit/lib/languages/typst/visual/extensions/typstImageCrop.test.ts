import { describe, expect, it } from 'vitest';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { serializeToTypst } from '$lib/languages/typst/visual/serialize/serializer';
import { typSchema as S } from '$lib/languages/typst/visual/schema';
import { typstCropFormat } from '$lib/languages/typst/visual/extensions/typstImageCrop';
import { EditorState } from 'prosemirror-state';

describe('typst image crop', () => {
	it('reads texpile-crop back into the image and writes it again unchanged', () => {
		const src = '#figure(texpile-crop(left: 18%, top: 8%, turn: 90deg, image("loss.png", width: 80%)), caption: [Loss.])\n';
		const img = typstToProseMirror(src).doc.child(0);
		expect(img.type.name).toBe('image');
		expect(img.attrs.crop).toEqual({ left: 18, top: 8, right: 0, bottom: 0, turn: 90 });
		expect(serializeToTypst(S.nodes.doc.create(null, [img]))).toBe(src.trimEnd());
	});

	it('writes a crop with the helper once, and a reset back to a plain image()', () => {
		const img = S.nodes.image.create({ src: 'a.png', options: 'width: 50%', numbered: false, showCaption: false });
		const state = EditorState.create({ doc: S.nodes.doc.create(null, [img]) });
		const write = (crop: { l: number; t: number; r: number; b: number }, turns: number) => {
			const node = tr0.doc.lastChild!;
			const tr = tr0.setNodeMarkup(
				tr0.doc.content.size - node.nodeSize,
				undefined,
				typstCropFormat.write(node, { crop, turns }, { w: 1, h: 1 })
			);
			typstCropFormat.prepare!(tr);
			return tr;
		};
		let tr0 = state.tr;
		tr0 = write({ l: 0.1, t: 0, r: 0, b: 0.25 }, 1);
		tr0 = write({ l: 0.2, t: 0, r: 0, b: 0 }, 0);
		const out = serializeToTypst(tr0.doc);
		expect(out.match(/#let texpile-crop\(/g)).toHaveLength(1);
		expect(out).toContain('#texpile-crop(left: 20%, image("a.png", width: 50%))');
		tr0 = write({ l: 0, t: 0, r: 0, b: 0 }, 0);
		expect(serializeToTypst(tr0.doc)).toContain('#image("a.png", width: 50%)');
	});
});
