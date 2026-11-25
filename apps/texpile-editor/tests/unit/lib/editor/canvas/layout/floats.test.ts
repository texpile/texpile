// a float no taller than a line runs in beside the first line of what follows it: a theorem's head before its body
import { expect, it } from 'vitest';
import { faceElement, type LayoutBox } from '$lib/editor/canvas';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { generatedPart } from '$lib/editor/canvas/nodes/generatedPart';
import type { FixedStyleRule } from '../testing/fixedStyles';
import { layoutTestBlock } from './layoutFixture';

const RULES: FixedStyleRule[] = [{ selector: '.head', look: { float: 'left', margin: '0px 8px 0px 0px' } }];

function theorem(body: string): ReturnType<typeof faceElement> {
	const root = faceElement('div');
	const text = faceElement('div', 'body');
	text.appendChild(faceElement('p', undefined, body));
	root.append(faceElement('div', 'head', 'Head.'), text);
	return root;
}

const lineStarts = (box: LayoutBox) => box.lines!.map((line) => line.fragments[0].x);

it('starts the body on the head line, its first line after the head and the rest at the left edge', () => {
	const layout = layoutTestBlock(schema.nodes.paragraph.create(), {
		root: theorem('one two three four five six seven eight nine ten'),
		rules: RULES,
		width: 200,
		justify: false
	});
	const [head, body] = layout.box.children;
	expect([head.x, head.y, body.y]).toEqual([0, 0, 0]);
	const [first, second] = lineStarts(body.children[0]);
	expect(first).toBe(head.width + 8);
	expect(second).toBe(0);
});

it('keeps a float taller than a line in the flow', () => {
	const tall: FixedStyleRule[] = [...RULES, { selector: '.head', look: { height: '80px' } }];
	const layout = layoutTestBlock(schema.nodes.paragraph.create(), { root: theorem('one two'), rules: tall, width: 200, justify: false });
	const [head, body] = layout.box.children;
	expect(body.y).toBe(head.y + 80);
	expect(lineStarts(body.children[0])[0]).toBe(0);
});

it('floats a mark generated after the text to the right edge of the last line, or under it when the line is full', () => {
	const mark = (text: string) => {
		const root = faceElement('p', undefined, text);
		root.generatedAfter = generatedPart('∎', { float: 'right', marginLeft: '1em' });
		return layoutTestBlock(schema.nodes.paragraph.create(), { root, width: 200, justify: false }).box;
	};
	const short = mark('one two');
	const [flag] = short.children;
	expect([flag.pseudo, flag.x + flag.width, flag.y]).toEqual(['after', 200, 0]);
	const full = mark('one two abcdefghijklmnopqrs');
	const last = full.lines!.at(-1)!;
	expect(full.children[0].y).toBe(last.y + last.height);
	expect(full.height).toBe(last.y + last.height);
});
