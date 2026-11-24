// a face's own text keeps the relative offset of the element holding it: preflight raises sup by position, not vertical-align
import { expect, it } from 'vitest';
import { faceElement } from '$lib/editor/canvas';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import type { FixedStyleRule } from '../../testing/fixedStyles';
import { layoutTestBlock } from '../layoutFixture';

const RULES: FixedStyleRule[] = [{ selector: 'sup', look: { position: 'relative', top: '-6px' } }];

it('raises a footnote mark drawn in a face by its relative top', () => {
	const root = faceElement('p', undefined, 'note');
	root.appendChild(faceElement('sup', undefined, '1'));
	const layout = layoutTestBlock(schema.nodes.paragraph.create(), { root, rules: RULES, justify: false });
	const runs = layout.box.lines![0].fragments.flatMap((fragment) =>
		fragment.kind === 'text' ? [[fragment.text, fragment.run.shift ?? 0]] : []
	);
	expect(runs).toEqual([
		['note', 0],
		['1', -6]
	]);
});

// a text run carries no border: an \fbox drawn as a bordered span lost its frame
it('lays out a face span that draws a border as a box of its own', () => {
	const root = faceElement('p', undefined, 'see ');
	root.appendChild(faceElement('span', 'framed', 'word'));
	const rules: FixedStyleRule[] = [{ selector: '.framed', look: { border: '1px solid black' } }];
	const layout = layoutTestBlock(schema.nodes.paragraph.create(), { root, rules, justify: false });
	const { fragments } = layout.box.lines![0];
	expect(fragments.filter((fragment) => fragment.kind === 'atomic')).toHaveLength(1);
	expect(fragments.flatMap((fragment) => (fragment.kind === 'text' ? [fragment.text] : [])).join('')).toBe('see ');
});

// a beamer block title painted its own background a second time behind its words
it('paints no background on text that stands straight in a tinted block', () => {
	const paragraph = schema.nodes.paragraph.create(null, schema.text('Title'));
	const rules: FixedStyleRule[] = [{ selector: 'p', look: { backgroundColor: 'rgb(200, 220, 255)' } }];
	const layout = layoutTestBlock(paragraph, { rules, justify: false });
	const text = layout.box.lines![0].fragments.find((fragment) => fragment.kind === 'text');
	expect(text?.kind === 'text' && text.run.paint.backgroundColor.a).toBe(0);
});

// a title block's "Keywords" label ran into the words after it: its margin was dropped
it('keeps the inline margin of a span in a face', () => {
	const root = faceElement('p');
	root.appendChild(faceElement('span', 'label', 'Keywords'));
	root.appendChild(faceElement('span', undefined, 'delta'));
	const rules: FixedStyleRule[] = [{ selector: '.label', look: { marginRight: '20px' } }];
	const layout = layoutTestBlock(schema.nodes.paragraph.create(), { root, rules, justify: false });
	const [label, words] = layout.box.lines![0].fragments.filter((fragment) => fragment.kind === 'text');
	expect(words.x - (label.x + label.width)).toBe(20);
});
