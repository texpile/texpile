import { describe, expect, it } from 'vitest';
import { hasTinymist, tinymistEngine, useTinymist } from '../../../engines/tinymistEngine';
import { cetzLanguage as lang } from '$lib/draw/cetz/cetzLanguage';

describe.skipIf(!hasTinymist)('a CeTZ box resized from the inspector', () => {
	useTinymist();
	const engine = tinymistEngine;

	it.each(['rectangle', 'diamond'] as const)('keeps a %s loop on its border, above it', async (shape) => {
		let text = lang.addShape(lang.newPicture, 0, { tool: 'box', from: [4, 4], to: [6, 5.5], shape })!;
		const node = lang.readPicture(text, 0)!.statements.at(-1)!;
		const end = { ref: node.i, at: [5, 4.75] as [number, number] };
		text = lang.addShape(text, 0, { tool: 'arrow', from: end, to: end, route: 'loop above' })!;
		text = lang.writeNodeBox(
			text,
			lang.readPicture(text, 0)!.statements.find((s) => s.i === node.i)!,
			{ w: 3, h: 3 }
		)!;
		expect(text).not.toMatch(/bezier\("n1", "n1"/);
		const picture = lang.readPicture(text, 0)!;
		const drawn = await lang.render(engine, text, picture);
		const top = (i: number) =>
			Math.max(
				...drawn.drawing.parts
					.filter((p) => p.stmt === i && p.kind === 'path')
					.flatMap((p) => (p.kind === 'path' ? (p.d.match(/-?\d*\.?\d+/g) ?? []).map(Number).filter((_, k) => k % 2) : []))
			);
		expect(top(picture.statements.at(-1)!.i)).toBeGreaterThan(top(node.i) + 5);
	});
});
