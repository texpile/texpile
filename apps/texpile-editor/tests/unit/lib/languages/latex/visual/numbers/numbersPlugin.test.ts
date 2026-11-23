import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';
import { numbersKey, numbersPlugin } from '$lib/languages/latex/visual/extensions/numbers/numbersPlugin';
import { numberingSchemeOf } from '$lib/languages/latex/visual/extensions/numbers/numberingScheme';
import { chipCounts } from '$lib/languages/latex/visual/core/plugin/chipCounts';

const TEX =
	'\\documentclass{article}\n\\begin{document}\n\\section{One}\nSome words here.\n\\begin{equation}\nx\n\\end{equation}\n\\section{Two}\n\\end{document}\n';

function setup() {
	let counts = 0;
	const scheme = numberingSchemeOf([], [], TEX);
	const plugin = numbersPlugin({
		context: () => (counts++, { anchors: { contents: [], labels: {} }, scheme, standalone: true }),
		counts: chipCounts,
		onInputs: () => () => {}
	});
	const made = EditorState.create({ doc: parseLatexFile(TEX).doc, plugins: [plugin] });
	const before = counts;
	// the view asks for the first count in the task after
	const state = made.apply(made.tr.setMeta(numbersKey, true));
	return { state, counted: () => counts, before };
}

function posOf(state: EditorState, text: string): number {
	let at = -1;
	state.doc.descendants((node, pos) => {
		if (at < 0 && node.isText && node.text!.includes(text)) at = pos + node.text!.indexOf(text);
	});
	return at;
}

describe('numbers while typing', () => {
	// counting a 1.9 MB paper with the editor's build held the main thread for 1.8 s at open
	it('counts nothing while the editor is built', () => {
		expect(setup().before).toBe(0);
	});

	it('counts again for a new heading, and only moves the numbers for words typed in a paragraph', () => {
		const { state, counted } = setup();
		const typed = state.apply(state.tr.insertText('more ', posOf(state, 'words')));
		expect(counted()).toBe(1);
		const heading = typed.schema.nodes.heading.create({ level: 1, command: 'section' }, typed.schema.text('Zero'));
		typed.apply(typed.tr.insert(0, heading));
		expect(counted()).toBe(2);
	});
});
