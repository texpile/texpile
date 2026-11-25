// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, NodeSelection, TextSelection, type Selection } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import { caretArrowsPlugin, faceElement, islandNodeViews } from '$lib/editor/canvas';
import { KeyRouter } from '$lib/editor/canvas/interaction/keys/keyRouter';
import { registerChipDrawing } from '$lib/editor/visual/extensions/drawnChips/chipShows';
import { drawnChipAtomsPlugin } from '$lib/editor/visual/extensions/drawnChips/drawnChipAtoms';
import { rawChipViews } from '$lib/editor/visual/extensions/raw-latex/rawChipViews';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';
import { createTestCanvasView, settleTestView } from '../../../canvas/testing/testCanvasView';

const { doc } = parseLatexFile(
	'\\documentclass{article}\n\\begin{document}\nSee \\ref{a} and \\cite{k} here\\label{b} too.\n\\end{document}\n'
);
const plugin = drawnChipAtomsPlugin();
const plugins = [caretArrowsPlugin(), plugin];
const nodeViews = rawChipViews(islandNodeViews());

// every raw chip draws; a vertical space and a page break on lines of their own
registerChipDrawing(doc.type.schema, {
	language: 'latex',
	shows: () => 'face',
	face: (source) => ({ dom: faceElement('span'), line: /\\(vspace|newpage)/.test(source) })
});

/** a key, as the view routes it, on a canvas view of `document` with `selection`: the selection it leaves */
async function pressIn(document: PMNode, selection: Selection, init: KeyboardEventInit): Promise<Selection> {
	const view = createTestCanvasView(EditorState.create({ doc: document, selection, plugins }), { plugins, props: { nodeViews } });
	await settleTestView(view);
	new KeyRouter(view, { active: () => null, stopsEvent: () => false }, () => null, 'linux').keydown(new KeyboardEvent('keydown', init));
	const { selection: after } = view.state;
	view.destroy();
	return after;
}

async function press(at: number, key: string, ctrlKey = false) {
	return pressIn(doc, TextSelection.create(doc, at), { key, ctrlKey });
}
function chipAt(name: string): { from: number; to: number } {
	let found = { from: -1, to: -1 };
	doc.descendants((node, pos) => {
		if (node.type.name === name) found = { from: pos, to: pos + node.nodeSize };
	});
	return found;
}

// LyX passes an inset in one press; the chips did it in two, a selected chip first
describe('an arrow beside a chip steps over it in one press', () => {
	for (const name of ['ref', 'citation', 'label']) {
		it(`${name}: ArrowRight and ArrowLeft`, async () => {
			const chip = chipAt(name);
			expect(await press(chip.from, 'ArrowRight')).toMatchObject({ empty: true, head: chip.to });
			expect(await press(chip.to, 'ArrowLeft')).toMatchObject({ empty: true, head: chip.from });
		});
	}

	it('Ctrl+ArrowRight takes the chip as one word', async () => {
		const chip = chipAt('citation');
		expect(await press(chip.from, 'ArrowRight', true)).toMatchObject({ empty: true, head: chip.to });
	});
});

describe('a chip ending its container', () => {
	const { doc: boxed } = parseLatexFile(
		'\\documentclass{article}\n\\begin{document}\nBefore.\n\n\\begin{center}\n\\newpage\n\\end{center}\n\nAfter.\n\\end{document}\n'
	);
	let chipPos = -1;
	boxed.descendants((node, pos) => {
		if (node.type.name === 'raw_latex') {
			chipPos = pos;
		}
	});

	it('ArrowDown from it goes on to the text after the container', async () => {
		const after = await pressIn(boxed, NodeSelection.create(boxed, chipPos), { key: 'ArrowDown' });
		expect(after.$head.parent.textContent).toBe('After.');
	});
});

// the chip was selected alone, which dropped a drag the moment the pointer reached it
describe('a range that ends in a chip', () => {
	const { doc: text } = parseLatexFile(
		'\\documentclass{article}\n\\begin{document}\nThe factor in \\Cref{eq:x} makes the sum a moving average.\n\\end{document}\n'
	);
	let chip = { from: -1, to: -1 };
	text.descendants((node, pos) => {
		if (node.isInline && !node.isText && node.textContent.includes('Cref')) {
			chip = { from: pos, to: pos + node.nodeSize };
		}
	});
	const end = text.content.size - 1;
	const select = async (anchor: number, head: number) => {
		const view = createTestCanvasView(EditorState.create({ doc: text, plugins: [plugin] }));
		await settleTestView(view);
		view.dispatch(view.state.tr.setSelection(TextSelection.create(text, anchor, head)));
		const { selection } = view.state;
		view.destroy();
		return selection;
	};

	it('takes the chip into the range, from either side', async () => {
		expect(chip.from).toBeGreaterThan(0);
		expect(await select(end, chip.from + 1)).toMatchObject({ anchor: end, head: chip.from });
		expect(await select(1, chip.from + 1)).toMatchObject({ anchor: 1, head: chip.to });
		expect(await select(end, chip.from + 1)).toBeInstanceOf(TextSelection);
	});

	it('still takes the chip whole for a caret in its text', async () => {
		const caret = await select(chip.from + 1, chip.from + 1);
		expect(caret).toBeInstanceOf(NodeSelection);
		expect(caret.from).toBe(chip.from);
	});
});

// two \vspace chips drawn on lines of their own left the caret between them, where Chrome has no place for it and took
// it to the document's start
describe('two chips on lines of their own', () => {
	const { doc: spaced } = parseLatexFile(
		'\\documentclass{article}\n\\begin{document}\nAbove \\vspace{1em}\\vspace{2em} below.\n\\end{document}\n'
	);
	const lines: number[] = [];
	spaced.descendants((node, pos) => {
		if (node.type.name !== 'inline_latex') return;
		lines.push(pos);
	});
	const pressFrom = (selection: TextSelection | NodeSelection, key: string) => pressIn(spaced, selection, { key });

	// the browser put the caret inside the chip on Up, where it showed nowhere, and took three keys to leave a selected one
	it('Up and Down select a chip on a line of its own and go on past it in one key', async () => {
		const after = lines[1] + spaced.nodeAt(lines[1])!.nodeSize;
		expect(await pressFrom(TextSelection.create(spaced, after), 'ArrowUp')).toMatchObject({ from: lines[1], to: after });
		expect(await pressFrom(NodeSelection.create(spaced, lines[1]), 'ArrowUp')).toMatchObject({ from: lines[0], to: lines[1] });
		expect(await pressFrom(NodeSelection.create(spaced, lines[0]), 'ArrowUp')).toMatchObject({ empty: true, head: lines[0] });
		expect(await pressFrom(NodeSelection.create(spaced, lines[1]), 'ArrowDown')).toMatchObject({ empty: true, head: after });
	});

	it('Right past the first selects the second, and Left from the second selects the first', async () => {
		expect(lines).toHaveLength(2);
		const second = await pressFrom(TextSelection.create(spaced, lines[0]), 'ArrowRight');
		expect(second).toBeInstanceOf(NodeSelection);
		expect(second.from).toBe(lines[1]);
		const first = await pressFrom(NodeSelection.create(spaced, lines[1]), 'ArrowLeft');
		expect(first).toBeInstanceOf(NodeSelection);
		expect(first.from).toBe(lines[0]);
	});
});

// the same chip ending its paragraph left the caret after it, where Chrome has no place either
it('Right from a chip on a line of its own that ends its paragraph goes on into the next one', async () => {
	const { doc: ending } = parseLatexFile(
		'\\documentclass{article}\n\\begin{document}\nAbove \\vspace{1em}\n\nNext words.\n\\end{document}\n'
	);
	let chip = -1;
	ending.descendants((node, pos) => {
		if (node.type.name !== 'inline_latex') return;
		chip = pos;
	});
	const after = await pressIn(ending, NodeSelection.create(ending, chip), { key: 'ArrowRight' });
	expect(after.$head.parent.textContent).toBe('Next words.');
});

// in a table caption a \vspace drawn on its own line stood right before a chip drawn in the line
it('Right past a chip on a line of its own selects any chip right after it', async () => {
	const { doc: caption } = parseLatexFile(
		'\\documentclass{article}\n\\begin{document}\nAbove \\vspace{1em}\\hspace{2em} below.\n\\end{document}\n'
	);
	const chips: number[] = [];
	caption.descendants((node, pos) => {
		if (node.type.name !== 'inline_latex') return;
		chips.push(pos);
	});
	const after = await pressIn(caption, TextSelection.create(caption, chips[0]), { key: 'ArrowRight' });
	expect(after).toBeInstanceOf(NodeSelection);
	expect(after.from).toBe(chips[1]);
});
