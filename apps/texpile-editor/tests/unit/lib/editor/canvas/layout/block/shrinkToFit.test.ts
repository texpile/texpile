import { expect, it } from 'vitest';
import { faceElement } from '$lib/editor/canvas';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { layoutTestBlock } from '../layoutFixture';

it('keeps an atomic inline shrunk to its text on one line where long words may split', () => {
	const label = schema.nodes.label.create({ name: 'sec:int' });
	const layout = layoutTestBlock(schema.nodes.paragraph.create(null, [schema.text('See '), label]), {
		rules: [{ selector: '.label-node', look: { display: 'inline-block', overflowWrap: 'break-word' } }]
	});
	const atom = layout.box.lines![0].fragments.find((fragment) => fragment.kind === 'atomic');
	expect(atom?.kind === 'atomic' && atom.box.lines?.length).toBe(1);
});

it('keeps a formula on the one line of the inline block shrunk to it, whatever its width rounds to', () => {
	const root = faceElement('p', undefined, 'A ');
	const holder = faceElement('span', 'inline-math');
	const formula = faceElement('span', 'math-formula');
	// a^2 in the Markdown body font: the slack added and taken off again lost the last bit
	formula.replaced = { intrinsic: () => ({ width: 15.852888479999999, height: 20, baseline: 14 }), paint() {} };
	holder.appendChild(formula);
	root.appendChild(holder);
	const layout = layoutTestBlock(schema.nodes.paragraph.create(), {
		root,
		justify: false,
		rules: [{ selector: '.inline-math', look: { display: 'inline-block' } }]
	});
	const atom = layout.box.lines![0].fragments.find((fragment) => fragment.kind === 'atomic');
	expect(atom?.kind === 'atomic' && atom.box.lines?.length).toBe(1);
	expect(layout.box.lines).toHaveLength(1);
});
