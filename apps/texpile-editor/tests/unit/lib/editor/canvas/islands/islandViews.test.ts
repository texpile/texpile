// a raw block drawn by its island view: its text runs take the source editor's highlight classes and their looks
import { expect, it } from 'vitest';
import type { Node as PMNode } from 'prosemirror-model';
import { DecorationSet } from 'prosemirror-view';
import type { CanvasNodeView, FaceElement, PositionMap, VisualView } from '$lib/editor/canvas';
import { faceElement, FaceText, islandNodeViews } from '$lib/editor/canvas';
import { inBuild } from '$lib/editor/canvas/views/buildScope';
import { layoutBlock } from '$lib/editor/canvas/layout/layoutElement';
import { ViewLineBreaking } from '$lib/editor/canvas/layout/linebreak/viewBreaking';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { fixedStyles } from '../testing/fixedStyles';
import { monoMeasure } from '../testing/monoMeasure';
import { testMetrics } from '../layout/layoutFixture';

const SYNTAX = { tokens: { '--syntax-command': 'rgb(9, 105, 218)', '--syntax-comment': 'rgb(128, 128, 128)' }, epoch: 0, paintEpoch: 0 };

function islandView(node: PMNode): CanvasNodeView {
	const build = { el: faceElement, read: (_key: unknown, value: () => unknown) => value() };
	const view = { dom: { ownerDocument: { defaultView: {} } }, canvas: { build } } as unknown as VisualView;
	const spec = inBuild(build as never, () => islandNodeViews()[node.type.name](node, view, () => 0, [], DecorationSet.empty));
	spec.contentDOM!.hole = true;
	return spec;
}

/** the view's elements with contentDOM holding the text, as nodeViewDesc.ts places them */
function rawBlockLayout(node: PMNode) {
	const { dom: root, contentDOM } = islandView(node);
	const hole = contentDOM!;
	hole.appendChild(new FaceText('​'));
	const positions: PositionMap = {
		posOf: (el: FaceElement) => (el === root ? 0 : null),
		elementAt: (offset: number) => (offset === 0 ? root : null),
		contentStart: (el: FaceElement) => (el === hole ? 1 : null)
	};
	return highlightedLayout(node, root, positions);
}

/** a paragraph holding one inline chip after its first text node */
function inlineChipLayout(paragraph: PMNode) {
	const at = 1 + paragraph.firstChild!.nodeSize;
	const root = faceElement('p');
	root.hole = true;
	root.appendChild(new FaceText('​'));
	const chip = root.appendChild(islandView(paragraph.child(1)).dom);
	const positions: PositionMap = {
		posOf: (el: FaceElement) => (el === root ? 0 : el === chip ? at : null),
		elementAt: (offset: number) => (offset === 0 ? root : offset === at ? chip : null),
		contentStart: (el: FaceElement) => (el === root ? 1 : el === chip ? at + 1 : null)
	};
	return highlightedLayout(paragraph, root, positions);
}

function highlightedLayout(node: PMNode, root: FaceElement, positions: PositionMap) {
	return layoutBlock(
		{
			node,
			pos: 0,
			root,
			positions,
			widgets: new Map(),
			width: 600,
			styles: fixedStyles([], SYNTAX),
			decorations: { inline: [], nodes: new Map(), widgets: [] },
			breaking: new ViewLineBreaking(() => 'none'),
			settings: { justify: false, hyphenate: false, showCaptions: true, imageDirectory: '', cropFormat: '', isMainFile: true },
			pixelRatio: 1
		},
		{ measure: monoMeasure, metrics: testMetrics }
	);
}

function coloredRuns(node: PMNode, layout = rawBlockLayout(node)): [string, string][] {
	const lines: { fragments: { kind: string; text?: string; run?: { paint: { color: { r: number } } } }[] }[] = [];
	const visit = (box: { lines: unknown; children: unknown[] }): void => {
		if (box.lines) lines.push(...(box.lines as typeof lines));
		for (const child of box.children) visit(child as typeof box);
	};
	visit(layout.box as unknown as { lines: unknown; children: unknown[] });
	const runs: [string, string][] = [];
	for (const fragment of lines.flatMap((line) => line.fragments)) {
		if (fragment.kind !== 'text') continue;
		const color = { 0: 'text', 9: 'command', 128: 'comment' }[Math.round(fragment.run!.paint.color.r * 255)]!;
		const last = runs.at(-1);
		if (last?.[1] === color) last[0] += fragment.text!;
		else runs.push([fragment.text!, color]);
	}
	return runs;
}

it('colors a LaTeX raw block by its highlight classes', () => {
	const node = schema.nodes.raw_latex.create(null, schema.text('\\maketitle % title'));
	expect(coloredRuns(node)).toEqual([
		['\\maketitle', 'command'],
		[' ', 'text'],
		['% title', 'comment']
	]);
});

it('keeps the empty line a raw block ending with a newline shows, where the caret goes after Enter', () => {
	const layout = rawBlockLayout(schema.nodes.raw_latex.create(null, schema.text('\\foo % x\n')));
	const lines = layout.box.children[0].children[0].lines!;
	expect(lines.map((line) => [line.from, line.to])).toEqual([
		[1, 10],
		[10, 10]
	]);
});

it('colors a raw chip that stays source in its line, and leaves the words around it alone', () => {
	const chip = schema.nodes.inline_latex.create(null, schema.text('\\foo{x}'));
	const paragraph = schema.nodes.paragraph.create(null, [schema.text('a '), chip, schema.text(' b')]);
	expect(coloredRuns(paragraph, inlineChipLayout(paragraph))).toEqual([
		['a ', 'text'],
		['\\foo', 'command'],
		['{x} b', 'text']
	]);
});

it('draws a code block as the card its CodeMirror stood in, with the text in its content', () => {
	const node = schema.nodes.code_block.create({ lang: 'JavaScript' }, schema.text('let x = 1;'));
	const { dom: card, contentDOM } = islandView(node);
	expect(card.classList.contains('cm-wrapper')).toBe(true);
	expect(card.style.getPropertyValue('border-radius')).toBe('6px');
	expect(contentDOM).toBe(card.querySelector('.cm-content'));
});
