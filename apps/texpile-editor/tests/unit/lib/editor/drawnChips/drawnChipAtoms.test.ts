// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, NodeSelection, TextSelection, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { drawChipNode } from '$lib/editor/visual/extensions/drawnChips/DrawnChipView';
import { drawnChipAtomsPlugin } from '$lib/editor/visual/extensions/drawnChips/drawnChipAtoms';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';

const { doc } = parseLatexFile(
	'\\documentclass{article}\n\\begin{document}\nSee \\ref{a} and \\cite{k} here\\label{b} too.\n\\end{document}\n'
);
const plugin = drawnChipAtomsPlugin();

function press(at: number, key: string, ctrlKey = false) {
	let state = EditorState.create({ doc, selection: TextSelection.create(doc, at) });
	const view = {
		get state() {
			return state;
		},
		dispatch: (tr: Transaction) => (state = state.apply(tr))
	} as unknown as EditorView;
	plugin.props.handleKeyDown!.call(plugin, view, new KeyboardEvent('keydown', { key, ctrlKey }));
	return state.selection;
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
		it(`${name}: ArrowRight and ArrowLeft`, () => {
			const chip = chipAt(name);
			expect(press(chip.from, 'ArrowRight')).toMatchObject({ empty: true, head: chip.to });
			expect(press(chip.to, 'ArrowLeft')).toMatchObject({ empty: true, head: chip.from });
		});
	}

	it('Ctrl+ArrowRight takes the chip as one word', () => {
		const chip = chipAt('citation');
		expect(press(chip.from, 'ArrowRight', true)).toMatchObject({ empty: true, head: chip.to });
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
			drawChipNode(node, { ownLine: true, character: false, openPanel: () => {} });
		}
	});

	it('ArrowDown from it goes on to the text after the container', () => {
		let state = EditorState.create({ doc: boxed, selection: NodeSelection.create(boxed, chipPos) });
		const view = {
			get state() {
				return state;
			},
			dispatch: (tr: Transaction) => (state = state.apply(tr)),
			endOfTextblock: () => true
		} as unknown as EditorView;
		const handled = plugin.props.handleKeyDown!.call(plugin, view, new KeyboardEvent('keydown', { key: 'ArrowDown' }));
		expect(handled).toBe(false);
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
			drawChipNode(node, { ownLine: false, character: false, openPanel: () => {} });
		}
	});
	const end = text.content.size - 1;
	const select = (anchor: number, head: number) => {
		const state = EditorState.create({ doc: text, plugins: [plugin] });
		return state.apply(state.tr.setSelection(TextSelection.create(text, anchor, head))).selection;
	};

	it('takes the chip into the range, from either side', () => {
		expect(chip.from).toBeGreaterThan(0);
		expect(select(end, chip.from + 1)).toMatchObject({ anchor: end, head: chip.from });
		expect(select(1, chip.from + 1)).toMatchObject({ anchor: 1, head: chip.to });
		expect(select(end, chip.from + 1)).toBeInstanceOf(TextSelection);
	});

	it('still takes the chip whole for a caret in its text', () => {
		const caret = select(chip.from + 1, chip.from + 1);
		expect(caret).toBeInstanceOf(NodeSelection);
		expect(caret.from).toBe(chip.from);
	});
});
