import { it, expect } from 'vitest';
import type { Node as PMNode } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { splitBlock } from 'prosemirror-commands';
import { buildAnchor } from '$lib/comments/anchor';
import type { SuggestionMark } from '$lib/comments/activeSuggestions.svelte';
import { placePmSuggestions, type PmSuggestionRange } from '$lib/editor/visual/extensions/pmSuggestionsPlace';
import { parseMarkdownFile, parseMarkdownRegion, serializeMarkdownFileDetailed } from '$lib/languages/markdown/visual/roundtrip';
import { parseTypstFile, parseTypstRegion, serializeTypstFileDetailed } from '$lib/languages/typst/visual/roundtrip';
import { bodyOffsetOf, parseLatexFile, parseLatexRegion, serializeLatexFileDetailed } from '$lib/workspace/latexRoundtrip';

const latex = { parse: parseLatexFile, region: (preamble: string) => (src: string) => parseLatexRegion(src, preamble) };
const markdown = { parse: parseMarkdownFile, region: () => parseMarkdownRegion };
const typst = { parse: parseTypstFile, region: () => parseTypstRegion };

/** the marks placed in `source` parsed as a file, the way the editor hands them over */
function placed(source: string, marks: SuggestionMark[], format = latex) {
	const parsed = format.parse(source);
	const from = bodyOffsetOf(parsed);
	const to = parsed.hadDocumentEnv ? source.length - parsed.postamble.length : source.length;
	return {
		doc: parsed.doc,
		...placePmSuggestions(parsed.doc, marks, {
			text: source,
			map: parsed.map,
			body: { from, to },
			parse: format.region(parsed.preamble)
		})
	};
}

function mark(source: string, id: string, words: string, restore: string, from = source.indexOf(words)): SuggestionMark {
	return { id, from, to: from + words.length, restore, mine: true, anchor: buildAnchor(source, from, from + words.length) };
}

const oldOf = (r: PmSuggestionRange | undefined) => r?.old.map((run) => [run.text, run.marks.map((m) => m.type.name)]);

it('draws plain words, tints a changed formula whole, and leaves a title change undrawn', () => {
	const source =
		'\\title{Adaptive Refinement for Hyperbolic Laws}\n\\begin{document}\n' +
		'Refinement is driven by an estimator.\n\n' +
		'On each patch we form the residual $r_j$ by inserting the reconstructed solution.\n\\end{document}\n';
	const { doc, ranges, partial, hidden } = placed(source, [
		mark(source, 'plain', 'driven', 'led'),
		mark(source, 'formula', 'r_j', 'R_j^n'),
		mark(source, 'title', '', 'Mesh ', source.indexOf('Refinement for'))
	]);
	const plain = ranges.find((r) => r.id === 'plain');
	expect(plain && doc.textBetween(plain.from, plain.to)).toBe('driven');
	expect(oldOf(plain)).toEqual([['led', []]]);
	const formula = ranges.find((r) => r.id === 'formula')!;
	expect(formula.node).toBe(true);
	expect(doc.nodeAt(formula.from)?.type.name).toBe('inline_math');
	expect(formula.was?.textContent).toBe('R_j^n');
	expect([...partial]).toEqual([]);
	expect([...hidden]).toEqual(['title']);
});

it('draws formatted old words at the start of the body and new words across a paragraph end', () => {
	const source =
		'\\documentclass{article}\n\\begin{document}Typed over text. More words.\n\nkept added words \\par\n\nand a new paragraph\n\\end{document}\n';
	const { doc, ranges, partial } = placed(source, [
		mark(source, 'replace', 'Typed over', '\nAn inline \\textit{quotation} sits in running'),
		mark(source, 'paragraphs', 'added words \\par\n\nand a new paragraph', ' \\par')
	]);
	expect([...partial]).toEqual([]);
	expect(oldOf(ranges.find((r) => r.id === 'replace'))).toEqual([
		['An inline ', []],
		['quotation', ['em']],
		[' sits in running', []]
	]);
	const paragraphs = ranges.find((r) => r.id === 'paragraphs')!;
	expect(doc.textBetween(paragraphs.from, paragraphs.to, '¶').trim()).toBe('added words¶and a new paragraph');
	expect(paragraphs.old).toEqual([]);
});

it('gives old words the marks of the run they sat in, at its edges and across them', () => {
	const source =
		'\\documentclass{article}\n\\begin{document}\nSee the words \\textbf{gamma beta} now and later \\href{https://x.y}{the guide} too.\n\nAn \\textbf{new}ng here.\n\\end{document}\n';
	const { ranges, partial, hidden } = placed(source, [
		mark(source, 'start', 'gamma', 'alpha'),
		mark(source, 'end', '', ' more', source.indexOf('beta}') + 4),
		mark(source, 'link', 'guide', 'docs'),
		mark(source, 'across', 'new}', 'old} thi')
	]);
	expect([...partial, ...hidden]).toEqual([]);
	const old = Object.fromEntries(ranges.map((r) => [r.id, oldOf(r)]));
	expect(old).toEqual({
		start: [['alpha', ['strong']]],
		end: [[' more', ['strong']]],
		link: [['docs', ['link']]],
		// only as far as the suggestion reaches: the letters after it are not its words
		across: [
			['old', ['strong']],
			[' thi', []]
		]
	});
});

it('draws typed words around a formula as words, and a formula among old words as itself', () => {
	const source = '\\begin{document}\nSome text here. Typed before $a$ and after it.\n\nA second paragraph stays.\n\\end{document}\n';
	const { doc, ranges, partial } = placed(source, [
		mark(source, 'typed', ' Typed before $a$ and after it.', ''),
		mark(source, 'gone', 'stays', 'held $b$')
	]);
	expect([...partial]).toEqual([]);
	const typed = ranges.find((r) => r.id === 'typed')!;
	expect(doc.textBetween(typed.from, typed.to)).toBe(' Typed before a and after it.');
	expect(doc.resolve(typed.to).parent.type.name).toBe('paragraph');
	const gone = ranges.find((r) => r.id === 'gone')!;
	expect(gone.old.map((run) => run.node?.type.name ?? run.text)).toEqual(['held ', 'inline_math']);
});

it('draws inserted blocks as words, chips included', () => {
	const source = '\\begin{document}\nOne stays.\n\n\\foo{a}\n\nmiddle words here\n\n\\foo{b}\n\nLast stays.\n\\end{document}\n';
	const from = source.indexOf('\\foo{a}');
	const to = source.indexOf('\\foo{b}') + '\\foo{b}'.length;
	const { doc, ranges, partial } = placed(source, [mark(source, 'wide', source.slice(from, to), '', from)]);
	expect([...partial]).toEqual([]);
	expect(doc.textBetween(ranges[0].from, ranges[0].to, '|')).toContain('middle words here');
});

it('marks the same words with other formatting as a format change', () => {
	const source = '\\begin{document}\nRefinement is \\textbf{driven} by an estimator.\n\\end{document}\n';
	const { doc, ranges } = placed(source, [mark(source, 'bold', '\\textbf{driven}', 'driven')]);
	const [range] = ranges;
	expect(range.format).toBe(true);
	expect(range.partial).toBe(false);
	expect(doc.textBetween(range.from, range.to)).toBe('driven');
	expect(oldOf(range)).toEqual([['driven', []]]);
});

it('draws a paragraph pulled into the heading before it', () => {
	const source = '\\begin{document}\n\\paragraph{Runin Prose follows the heading here.}\n\nNext paragraph stays.\n\\end{document}\n';
	const words = 'Prose follows the heading here.}';
	const { doc, ranges, hidden } = placed(source, [mark(source, 'merged', words, '} Prose follows the heading here.')]);
	expect([...hidden]).toEqual([]);
	expect(ranges.length).toBeGreaterThan(0);
	const inHeading = (pos: number) => doc.resolve(pos).depth > 0 && doc.resolve(pos).node(1).type.name === 'heading';
	expect(ranges.some((r) => inHeading(r.from) || doc.nodeAt(r.from)?.type.name === 'heading')).toBe(true);
});

it('tints the copy the suggestion is in when the text around it repeats', () => {
	const source = '\\begin{document}\nThe cat sat on the mat today.\n\nThe cat sat on the mat today.\n\\end{document}\n';
	const from = source.lastIndexOf('sat');
	const { doc, ranges } = placed(source, [mark(source, 'again', 'sat', 'lay', from)]);
	expect(ranges[0].from).toBeGreaterThan(doc.child(0).nodeSize);
});

// with a second mark in the paragraph the comparison lined the "e" of "new" up with the one of "estimator"
it('draws each of two changes in one paragraph where its mark is', () => {
	const typed = '\\begin{document}\nWe prove the new estimator is blunt for smooth solutions.\n\\end{document}\n';
	const one = placed(typed, [mark(typed, 'added', 'new ', ''), mark(typed, 'swapped', 'blunt', 'sharp')]);
	const added = one.ranges.find((r) => r.id === 'added')!;
	expect(one.doc.textBetween(added.from, added.to)).toBe('new ');
	expect(added.old).toEqual([]);
	const cut = '\\begin{document}\nWe the estimator is sharp for a very smooth solutions.\n\\end{document}\n';
	const two = placed(cut, [mark(cut, 'prove', '', 'prove ', cut.indexOf('the ')), mark(cut, 'only', '', 'only ', cut.indexOf('a very'))]);
	for (const [id, words, at] of [
		['prove', 'prove ', 'the '],
		['only', 'only ', 'a very']
	]) {
		const r = two.ranges.find((x) => x.id === id)!;
		expect([r.to - r.from, oldOf(r)]).toEqual([0, [[words, []]]]);
		expect(two.doc.textBetween(r.from, r.from + at.length)).toBe(at);
	}
});

it('draws words taken out just before a formula as words', () => {
	const source = '\\begin{document}\nEach glue is $g_i$ here.\n\\end{document}\n';
	const { doc, ranges } = placed(source, [mark(source, 'cut', '', 'set to ', source.indexOf('$g_i$'))]);
	const [cut] = ranges;
	expect([cut.node, cut.to - cut.from, oldOf(cut)]).toEqual([undefined, 0, [['set to ', []]]]);
	expect(doc.nodeAt(cut.from)?.type.name).toBe('inline_math');
});

// Enter after the words left before a display takes it out of their paragraph, a blank line the
// visual editor does not draw
it('draws the words taken out before a display without the display', () => {
	const source = '\\begin{document}\nIn\n\n\\begin{equation}\n\t\\alpha = 1\n\\end{equation}\n\nA closing line.\n\\end{document}\n';
	const { ranges } = placed(source, [mark(source, 'cut', 'In\n', 'Inline math $E$ and a display:')]);
	expect(ranges.filter((r) => r.node)).toEqual([]);
	expect(ranges.flatMap((r) => r.old.map((run) => run.node?.type.name ?? run.text))).toEqual([
		'line math ',
		'inline_math',
		' and a display:'
	]);
});

// a deletion from inside a caption into the heading after it, which then reads as the rest of the caption
it('sets an image a change began inside beside the one it was, when the change ran on past it', () => {
	const source = "Some words.\n\n![A plot](plot.png 'Now the caphat differs')\n";
	const { doc, ranges } = placed(source, [mark(source, 'join', "caphat differs')", "caption words.')\n\n## What differs")], markdown);
	const image = ranges.find((r) => r.node)!;
	expect([doc.nodeAt(image.from)?.textContent, image.was?.textContent]).toEqual(['Now the caphat differs', 'Now the caption words.']);
});

// the comparison reads edits fewer than two letters apart as one
it('keeps a one letter word a paragraph was split after, with words typed before it', () => {
	const source = '\\begin{document}\nSo A\n\ncat sat on the mat.\n\\end{document}\n';
	const { doc, ranges } = placed(source, [mark(source, 'split', 'So A\n\n', 'A ')]);
	expect(ranges.map((r) => [doc.textBetween(r.from, r.to), oldOf(r), r.brk])).toEqual([
		['So ', [], undefined],
		['', [[' ', []]], 'added']
	]);
});

it('draws a paragraph split just after a chip after the chip, not inside it', () => {
	const source = 'An inline #quote[quotation]\n\n sits in running text.\n';
	const { doc, ranges } = placed(source, [mark(source, 'split', '\n\n', '')], typst);
	const [split] = ranges;
	expect([split.brk, split.from]).toEqual(['added', doc.child(0).nodeSize - 1]);
});

it('tints only the chip a change sits in, and draws a removed accent as its letter', () => {
	const source =
		'\\begin{document}\nWe leave some room \\vspace{3cm} for the figure below.\n\n\\newpage\n\nThe Poincar map is the tool we use here.\n\n\\newpage\n\nThe end.\n\\end{document}\n';
	const { doc, ranges, partial } = placed(source, [
		mark(source, 'space', '3cm', '1.5cm'),
		mark(source, 'break', 'newpage', 'clearpage'),
		mark(source, 'accent', '', "\\'e", source.indexOf(' map'))
	]);
	expect([...partial]).toEqual([]);
	const chip = (id: string) => {
		const r = ranges.find((x) => x.id === id)!;
		return r.node && doc.nodeAt(r.from)?.nodeSize === r.to - r.from ? doc.nodeAt(r.from)!.textContent.trim() : null;
	};
	expect(chip('space')).toBe('\\vspace{3cm}');
	expect(chip('break')).toBe('\\newpage');
	expect(ranges.find((r) => r.id === 'break')!.from).toBe(doc.child(0).nodeSize);
	expect(oldOf(ranges.find((r) => r.id === 'accent'))).toEqual([['é', []]]);
});

// the parser reads an old font group as a chip, so what the reader sees change is a chip becoming words
it('draws an old font group made ordinary bold as the chip it was and the words it is', () => {
	const source = '\\begin{document}\nThe method is \\textbf{fast and small} on every input we tried.\n\\end{document}\n';
	const from = source.indexOf('\\textbf');
	const to = source.indexOf('} on') + 1;
	const { doc, ranges } = placed(source, [mark(source, 'bold', source.slice(from, to), '{\\bf fast and small}', from)]);
	const [range] = ranges;
	expect(range.format).toBeUndefined();
	expect(range.partial).toBe(false);
	expect(doc.textBetween(range.from, range.to)).toBe('fast and small');
	expect(range.old.map((run) => run.node?.textContent)).toEqual(['{\\bf fast and small}']);
});

it('stands a paragraph taken out where it stood, as a block of its own', () => {
	const source = '\\begin{document}\nOpening words.\n\nThe last.\n\\end{document}\n';
	const from = source.indexOf('The last');
	const { doc, ranges, partial } = placed(source, [mark(source, 'cut', '', 'A middle one.\n\n', from)]);
	expect([...partial]).toEqual([]);
	const [gone] = ranges;
	expect(gone.gone?.blocks.map((b: PMNode) => b.textContent)).toEqual(['A middle one.']);
	expect(doc.resolve(gone.from).depth).toBe(0);
	expect(gone.from).toBe(doc.child(0).nodeSize);
});

// Louis's screenshot: a table taken out stood as its caption and one line a cell
it('keeps a table and a list taken out whole, to be drawn as they were', () => {
	const source = '\\begin{document}\nOpening words one.\n\\end{document}\n';
	const restore =
		'stay.\n\n\\begin{table}[h]\n\\centering\n\\begin{tabular}{ll}\na & b \\\\\nc & d \\\\\n\\end{tabular}\n\\caption{Two rows.}\n\\end{table}\n\n' +
		'\\begin{itemize}\n\\item first\n\\item second\n\\end{itemize}\n\nThe last ';
	const { ranges, partial } = placed(source, [mark(source, 'cut', '', restore, source.indexOf('one.'))]);
	expect([...partial]).toEqual([]);
	const gone = ranges.find((r) => r.gone)!.gone!;
	expect(gone.head.map((run) => run.text).join('')).toBe('stay.');
	expect(gone.blocks.map((b: PMNode) => b.type.name)).toEqual(['table_wrapper', 'list', 'list']);
	expect(gone.blocks[0].textContent).toBe('Two rows.abcd');
	expect(gone.tail.map((run) => run.text).join('')).toBe('The last ');
});

// as the comparison records a bullet deleted from its start to the next one's: the letter the two items
// start with made "wo¶t" read as what went
it('takes a list item out whole, not the item less its first letter plus the first of the next', () => {
	const source = '\\begin{document}\n\\begin{enumerate}\n\\item one\n\\item three\n\\end{enumerate}\n\\end{document}\n';
	const { doc, ranges, partial } = placed(source, [mark(source, 'item', 'three', 'two\n\\item three')]);
	expect([...partial]).toEqual([]);
	const [gone] = ranges;
	expect(gone.gone?.head).toEqual([]);
	expect(gone.gone?.blocks.map((b: PMNode) => `${b.type.name} ${b.textContent}`)).toEqual(['list two']);
	expect(gone.gone?.tail).toEqual([]);
	expect(doc.resolve(gone.from).depth).toBe(0);
});

// the map a write gives each item a block where a parse gives the whole list one, and the stretch
// read as different from the one on screen: the item went to a region
it('takes a list item out whole on the document as edited, before any parse', () => {
	const parsed = parseLatexFile(
		'\\begin{document}\n\\begin{enumerate}\n\\item one\n\\item two\n\\item three\n\\end{enumerate}\n\\end{document}\n'
	);
	let state = EditorState.create({ doc: parsed.doc });
	const at = (word: string) => {
		let pos = -1;
		state.doc.descendants((node, p) => void (node.text === word && (pos = p)));
		return pos;
	};
	state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, at('two'), at('three'))).deleteSelection());
	const { text, map } = serializeLatexFileDetailed(parsed, state.doc);
	const from = text.indexOf('three');
	const s = { id: 'item', from, to: from + 5, restore: 'two\n\\item three', mine: true, anchor: buildAnchor(text, from, from + 5) };
	const body = { from: bodyOffsetOf(parsed), to: text.length - parsed.postamble.length };
	const { ranges, partial } = placePmSuggestions(state.doc, [s], { text, map, body, parse: latex.region(parsed.preamble) });
	expect([...partial]).toEqual([]);
	expect(ranges.map((r) => r.gone?.blocks.map((b: PMNode) => b.textContent))).toEqual([['two']]);
	expect(state.doc.resolve(ranges[0].from).depth).toBe(0);
});

it('marks a paragraph break that came or went with a bar rather than words', () => {
	const split = '\\begin{document}\nFirst half of the line\n\nand the second half.\n\\end{document}\n';
	const at = split.indexOf('\n\nand');
	const added = placed(split, [mark(split, 'split', '\n\n', ' ', at)]);
	expect(added.ranges.map((r) => r.brk)).toEqual(['added']);
	const joined = '\\begin{document}\nFirst half of the line and the second half.\n\\end{document}\n';
	const removed = placed(joined, [mark(joined, 'join', ' ', '\n\n', at)]);
	expect(removed.ranges.map((r) => r.brk)).toEqual(['removed']);
});

it('tints an item Tab or Shift+Tab moved a level, with no break drawn', () => {
	for (const format of [markdown, typst]) {
		const nested = '- one\n  - two\n- three\n';
		const indented = placed(nested, [mark(nested, 'in', '  ', '', nested.indexOf('  - two'))], format);
		expect(indented.ranges.map((r) => [r.brk, r.format, indented.doc.nodeAt(r.from)?.textContent])).toEqual([[undefined, true, 'two']]);
		const flat = '- one\n- two\n- three\n';
		const dedented = placed(flat, [mark(flat, 'out', '', '  ', flat.indexOf('- two'))], format);
		expect(dedented.ranges.map((r) => [r.brk, r.format, dedented.doc.nodeAt(r.from)?.textContent])).toEqual([[undefined, true, 'two']]);
	}
});

// a letter taken from the very start of a heading belongs INSIDE that heading: drawn at the join it
// reads as the tail of the paragraph above, which is not where the word came from
it('draws a letter cut from the start of a heading inside that heading', () => {
	const source = '\\begin{document}\nA closing line of prose.\n\n\\section{n Typst}\n\nThe picker works the same way.\n\\end{document}\n';
	const at = source.indexOf('n Typst');
	const { doc, ranges } = placed(source, [mark(source, 'cut', '', 'I', at)]);
	const r = ranges.find((x) => x.id === 'cut');
	expect(r).toBeTruthy();
	const $at = doc.resolve(r!.from);
	expect($at.parent.type.name).toBe('heading');
	expect($at.parentOffset).toBe(0);
});

it('keeps the last placement of a mark whose text the editor has moved past', () => {
	const source = '\\begin{document}\nSome words here.\n\\end{document}\n';
	const moved = { ...mark(source, 'old', 'words', 'x'), anchor: buildAnchor('Other words here.', 6, 11) };
	moved.from -= 1;
	moved.to -= 1;
	const { ranges, stale } = placed(source, [moved]);
	expect(ranges).toEqual([]);
	expect([...stale]).toEqual(['old']);
});

it('draws words changed beside a formula as words, and the formula beside the one it was', () => {
	const source =
		'\\documentclass{beamer}\n\\begin{document}\n\\begin{frame}{Math}\nInline ma1.\\textbackslash{}th $E = mc^2 x$ sits in prose.\n\\end{frame}\n\\end{document}\n';
	const { doc, ranges, partial } = placed(source, [
		mark(source, 'words', 'ma1.\\textbackslash{}th', 'math'),
		mark(source, 'formula', ' x', '')
	]);
	expect([...partial]).toEqual([]);
	const words = ranges.find((r) => r.id === 'words')!;
	expect(words.node).toBeUndefined();
	expect(words.gone).toBeUndefined();
	// the letters the two spellings share stay; what came in is drawn as words, not as the formula struck
	expect(doc.textBetween(words.from, words.to)).toBe('1.\\');
	expect(oldOf(words)).toEqual([]);
	const formula = ranges.find((r) => r.id === 'formula')!;
	expect(formula.node).toBe(true);
	expect(doc.nodeAt(formula.from)?.type.name).toBe('inline_math');
	expect(formula.was?.textContent).toBe('E = mc^2');
});

it('strikes the paragraph a figure took in as its caption after the figure it was', () => {
	const source =
		'\\documentclass{article}\n\\begin{document}\nSome words.\n\n\\begin{figure}[h]\n\\centering\n\\includegraphics[width=40pt]{plot.png}\n\\caption{Now the caption words.}\n\\end{figure}\n\nTail words.\n\\end{document}\n';
	const { doc, ranges, partial } = placed(source, [
		mark(source, 'open', '\\begin{figure}[h]\n\\centering\n', ''),
		mark(source, 'caption', '\n\\caption{Now', ' Now'),
		mark(source, 'close', '}\n\\end{figure}', '')
	]);
	expect([...partial]).toEqual([]);
	const figure = ranges.find((r) => r.node && r.was);
	expect(figure?.was?.type.name).toBe('image');
	expect(figure?.was?.textContent).toBe('');
	const gone = ranges.find((r) => r.gone);
	expect(gone?.gone?.blocks.map((b: PMNode) => b.textContent)).toEqual(['Now the caption words.']);
	expect(gone?.from).toBe(figure?.to);
	expect(doc.resolve(gone!.from).depth).toBe(0);
});

// Louis's Refine: the last character of a Chinese paragraph and the includes after it replaced by other words
it('strikes only the Chinese word a change took, and the includes taken with it', () => {
	const source = '\\documentclass{article}\n\\begin{document}\na兵器里啊hello codex\n\nThe end.\n\\end{document}\n';
	const { doc, ranges, partial } = placed(source, [mark(source, 'refine', 'hello codex', '啊\n\n\\input{intro}\n\n\\input{related}')]);
	expect([...partial]).toEqual([]);
	const gone = ranges.find((r) => r.gone)!;
	expect(gone.gone!.head.map((run) => run.text).join('')).toBe('啊');
	expect(gone.gone!.blocks.map((b: PMNode) => `${b.type.name} ${b.attrs.path}`)).toEqual(['includedoc intro', 'includedoc related']);
	const typed = ranges.find((r) => !r.gone)!;
	expect(doc.textBetween(typed.from, typed.to)).toBe('hello codex');
});

// a cut from inside a figure into a heading two blocks on: the figure's closing moved past both
it('strikes the blocks a cut took from after a figure after the figure, where they stood', () => {
	const source =
		'\\documentclass{article}\n\\begin{document}\nBefore the figure.\n\n\\begin{figure}[h]\n    \\centering\n    \\includegraphics{a.png}\n' +
		'\\caption{atting}\n\\end{figure}\n\nCompiling turns this source into a PDF.\n\\end{document}\n';
	const end = source.indexOf('\\end{figure}');
	const { doc, ranges } = placed(source, [
		mark(source, 'caption', 'caption', 'end'),
		mark(source, 'words', 'atting', 'figure'),
		mark(source, 'paragraph', '', '\nThe visual editor parses your code.\n\n', end),
		mark(source, 'section', 'end', 'section', end + 1),
		mark(source, 'heading', 'figure', 'Compiling and formatting', end + 5)
	]);
	let figureEnd = -1;
	doc.forEach((node, pos) => {
		if (node.type.name === 'image') figureEnd = pos + node.nodeSize;
	});
	expect(ranges.filter((r) => r.gone).map((r) => [r.gone!.blocks.map((b: PMNode) => b.textContent).join(''), r.from])).toEqual([
		['The visual editor parses your code.', figureEnd],
		['Compiling and formatting', figureEnd]
	]);
});

// one gesture: the first letter made italic, the heading split after the fourth, and a join far enough on for the comparison to merge the first two
it('draws a heading split in a word whose formatting also changed as a break, not as a format change', () => {
	const words = 'The first paragraph runs across several lines of the column, so that the page holds ordinary prose above the lines.';
	const source = `\\documentclass{article}\n\\begin{document}\n\\section{\\textit{P}rob}\n\\section{e}\n${words}A one line paragraph.\n\\end{document}\n`;
	const from = source.indexOf('\\textit');
	const quote = source.slice(from, source.indexOf('A one line'));
	const { doc, ranges } = placed(source, [mark(source, 'gesture', quote, `Probe}\n${words}\n\n`, from)]);
	const join = doc.child(0).nodeSize + doc.child(1).nodeSize + 1 + words.length;
	expect(ranges.map((r) => (r.brk ? `${r.brk} ${r.from}` : `${r.format ? 'format' : 'words'} ${doc.textBetween(r.from, r.to)}`))).toEqual([
		'format P',
		`added ${doc.child(0).nodeSize - 1}`,
		`removed ${join}`
	]);
});

// a letter taken out one letter before the split: the comparison read the two as one change, and the break was lost in it
it('draws a heading split beside a letter taken out as a break', () => {
	const source = '\\documentclass{article}\n\\begin{document}\n\\section{Po}\n\\section{be}\nThe first paragraph.\n\\end{document}\n';
	const { doc, ranges } = placed(source, [mark(source, 'gesture', 'Po}\n\\section{be}', 'Probe}')]);
	expect(ranges.map((r) => (r.brk ? `${r.brk} ${r.from}` : `${doc.textBetween(r.from, r.to)} was ${oldOf(r)}`))).toEqual([
		'Po was Pro,',
		`added ${doc.child(0).nodeSize - 1}`
	]);
});

// part of a heading's last word made italic and the paragraph after joined on: the word widened past the join and struck both blocks' words
it('draws a paragraph joined onto a heading whose last word was restyled as a break beside the restyled word', () => {
	const source =
		'\\documentclass{article}\n\\begin{document}\n\\section{What is\\textit{ Texpil}eTexpile is both a visual editor.}\n\\end{document}\n';
	const { doc, ranges } = placed(source, [
		mark(source, 'gesture', '\\textit{ Texpil}eTexpile is both a visual editor.}', ' Texpile}\n\nTexpile is both a visual editor.')
	]);
	expect(ranges.map((r) => (r.brk ? `${r.brk} ${r.from}` : `${r.format ? 'format' : 'words'} ${doc.textBetween(r.from, r.to)}`))).toEqual([
		'format  Texpile',
		`removed ${1 + 'What is Texpile'.length}`
	]);
});

// a chip opening a paragraph holds the space after it, and lets it go once the paragraph is joined onto the one before
it('draws a paragraph that opens with a chip joined onto the one before as one break', () => {
	const source = '\\documentclass{article}\n\\begin{document}\nWords in the band.\\vspace{10pt} Prose after a space.\n\\end{document}\n';
	const { doc, ranges } = placed(source, [mark(source, 'join', '', '\n\n', source.indexOf('\\vspace'))]);
	expect(
		ranges.map(
			(r) => r.brk ?? (r.gone ? 'gone' : r.node ? `chip ${r.was?.textContent}` : `words ${JSON.stringify(doc.textBetween(r.from, r.to))}`)
		)
	).toEqual(['removed', 'chip \\vspace{10pt} ', 'words " "']);
});

// most emoji share their first UTF-16 half, so the comparison saw only the second change
it('draws an emoji replaced by another whole, not half of each', () => {
	const source = '\\documentclass{article}\n\\begin{document}\nResults look good 😁 overall.\n\\end{document}\n';
	const { doc, ranges } = placed(source, [mark(source, 'emoji', '😁', '😀')]);
	const r = ranges.find((x) => x.id === 'emoji')!;
	expect([doc.textBetween(r.from, r.to), r.old.map((run) => run.text).join('')]).toEqual(['😁', '😀']);
});

// "end of a line leaves a wide" less "unlucky ... leaves" also reads as two cuts with the first "a" kept, and
// did once a change in the next paragraph put both paragraphs in one comparison
it('strikes one run of words taken out as one run, when its last word also stands after it', () => {
	const cut =
		'\\begin{document}\n\nThe way a paragraph is broken into lines  a good part of how a page looks. A first fit method fills ' +
		'each line with as many words as the measure allows and then moves on, which means that an  a wide hole behind it. ' +
		'Nobody planned the hole. It is only what was left over after the line had been filled, and the lines that follow ' +
		'inherit whatever that choice pushed down to them.\n\nKnuth and Plass described a different approach in 1981. Their ' +
		'method looks at the paragraph as a whole, gives every possible line a badness that grows with the cube of how far its ' +
		'spaces must stretch or shrink, and then looks for the sequence of breaks with the smallest total.\n\\end{document}\n';
	const words = 'unlucky long word near the end of a line leaves';
	const { ranges } = placed(cut, [
		mark(cut, 'first', '', 'decides', cut.indexOf('lines ') + 6),
		mark(cut, 'cut', '', words, cut.indexOf('an ') + 3),
		mark(cut, 'next', 'looks', 'searches', cut.indexOf('looks for'))
	]);
	const struck = Object.fromEntries(ranges.map((r) => [r.id, r.old.map((run) => run.text).join('')]));
	expect(ranges.length).toBe(3);
	expect(struck.cut.trim()).toBe(words);
	expect([struck.first.trim(), struck.next]).toEqual(['decides', 'searches']);
});

it('draws words typed after an empty paragraph, which the file does not have', () => {
	const cases = [
		[latex, serializeLatexFileDetailed, '\\documentclass{article}\n\\begin{document}\nKestrel here.\n\nLast one.\n\\end{document}\n'],
		[markdown, serializeMarkdownFileDetailed, 'Kestrel here.\n\nLast one.\n'],
		[typst, serializeTypstFileDetailed, 'Kestrel here.\n\nLast one.\n']
	] as const;
	for (const [format, serialize, source] of cases) {
		const parsed = format.parse(source);
		let state = EditorState.create({ doc: parsed.doc });
		state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, state.doc.child(0).nodeSize - 1)));
		splitBlock(state, (tr) => (state = state.apply(tr)));
		splitBlock(state, (tr) => (state = state.apply(tr)));
		state = state.apply(state.tr.insertText('a'));
		const { text, map } = serialize(parsed, state.doc);
		const from = text.indexOf('Kestrel here.') + 'Kestrel here.'.length;
		const typed = mark(text, 'typed', text.slice(from, text.indexOf('a', from) + 1), '', from);
		const body = { from: bodyOffsetOf(parsed), to: parsed.hadDocumentEnv ? text.length - parsed.postamble.length : text.length };
		const out = placePmSuggestions(state.doc, [typed], { text, map, body, parse: format.region(parsed.preamble) });
		expect([out.partial.size, out.hidden.size]).toEqual([0, 0]);
		expect(out.ranges.map((r) => state.doc.textBetween(r.from, r.to))).toEqual(['a']);
	}
});

it('draws a split after a space, and escapes typed mid-word, where the editor holds them', () => {
	const cases = [
		[latex, serializeLatexFileDetailed, '\\documentclass{article}\n\\begin{document}\nKestrel here. Last one.\n\\end{document}\n', '&_'],
		[markdown, serializeMarkdownFileDetailed, 'Kestrel here. Last one.\n', '*['],
		[typst, serializeTypstFileDetailed, 'Kestrel here. Last one.\n', '#*']
	] as const;
	for (const [format, serialize, source, typed] of cases) {
		const parsed = format.parse(source);
		const start = EditorState.create({ doc: parsed.doc });
		function place(state: EditorState, marks: (text: string) => SuggestionMark[]) {
			const { text, map } = serialize(parsed, state.doc);
			const body = { from: bodyOffsetOf(parsed), to: parsed.hadDocumentEnv ? text.length - parsed.postamble.length : text.length };
			return placePmSuggestions(state.doc, marks(text), { text, map, body, parse: format.region(parsed.preamble) });
		}
		// the space stays at the end of the first paragraph, and the file does not write it
		const split = start.apply(start.tr.split(1 + 'Kestrel here. '.length));
		const broke = place(split, (text) => [mark(text, 'split', '\n\n', ' ', text.indexOf('here.') + 5)]);
		expect(broke.ranges.map((r) => [r.brk, r.from])).toEqual([['added', split.doc.child(0).nodeSize - 1]]);
		// an escape stands for its one character, and the letters between two of them stay letters
		const escaped = start.apply(start.tr.insertText(typed[1], 1 + 'Kestr'.length).insertText(typed[0], 1 + 'Kes'.length));
		const drawn = place(escaped, (text) => {
			const a = text.indexOf('Kes') + 3;
			const b = text.indexOf('tr', a);
			const c = text.indexOf('el', b);
			return [mark(text, 'first', text.slice(a, b), '', a), mark(text, 'second', text.slice(b + 2, c), '', b + 2)];
		});
		expect(drawn.ranges.map((r) => escaped.doc.textBetween(r.from, r.to))).toEqual([typed[0], typed[1]]);
	}
});

// the file writes the chip's last byte right before the space, so the break landed inside the chip's end and stayed before the space
it('draws a split after the space after a chip at the end of the line', () => {
	const cases = [
		[
			latex,
			serializeLatexFileDetailed,
			'\\documentclass{article}\n\\begin{document}\nAn inline \\foo{quotation} sits here.\n\\end{document}\n'
		],
		[typst, serializeTypstFileDetailed, 'An inline #quote[quotation] sits here.\n']
	] as const;
	for (const [format, serialize, source] of cases) {
		const parsed = format.parse(source);
		const start = EditorState.create({ doc: parsed.doc });
		const split = start.apply(start.tr.split(parsed.doc.child(0).nodeSize - 1 - 'sits here.'.length));
		const { text, map } = serialize(parsed, split.doc);
		const from = text.indexOf(' \n\n');
		const body = { from: bodyOffsetOf(parsed), to: parsed.hadDocumentEnv ? text.length - parsed.postamble.length : text.length };
		const out = placePmSuggestions(split.doc, [mark(text, 'split', text.slice(from, text.indexOf('sits')), '', from)], {
			text,
			map,
			body,
			parse: format.region(parsed.preamble)
		});
		expect(out.ranges.map((r) => [r.brk, r.from])).toEqual([['added', split.doc.child(0).nodeSize - 1]]);
	}
});

// the first took out the words and the footnote's first half, the second the rest: drawn as loose text in blocks of their own
it('strikes two cuts that meet inside a footnote as words, the footnote whole with the first', () => {
	const source = '\\documentclass{article}\n\\begin{document}\nPlain text. He is a link here.\n\\end{document}\n';
	const at = source.indexOf('He is') + 2;
	const { ranges } = placed(source, [
		mark(source, 'first', '', 're is a footnote.\\footnote{The foot', at),
		mark(source, 'second', '', 'note text.} Here', at)
	]);
	expect(ranges.map((r) => [r.id, !!r.gone, r.old.map((run) => run.node?.type.name ?? run.text)])).toEqual([
		['first', false, ['re is a footnote.', 'inline_latex']],
		['second', false, [' Here']]
	]);
});

it('draws a heading taken out at the start of the body beside words typed further on', () => {
	const source = '\\documentclass{article}\n\\begin{document}\nThe first paragraph.\n\nA second one|x here.\n\\end{document}\n';
	const { ranges, partial, hidden } = placed(source, [
		mark(source, 'heading', '', '\\section{Probe}\n', source.indexOf('The first')),
		mark(source, 'typed', '|x', '')
	]);
	expect([...partial, ...hidden]).toEqual([]);
	expect(ranges.map((r) => [r.id, r.gone?.blocks.map((b) => b.textContent) ?? r.old.map((run) => run.text)])).toEqual([
		['heading', ['Probe']],
		['typed', []]
	]);
});

it('draws a replacement to its own edges, not the letters typed against it', () => {
	for (const source of ['\\begin{document}\nThe quickx fox.\n\\end{document}\n', '\\begin{document}\nThe xquick fox.\n\\end{document}\n']) {
		const { doc, ranges } = placed(source, [mark(source, 's', 'quick', 'lazy')]);
		expect(ranges.map((r) => [doc.textBetween(r.from, r.to), oldOf(r)])).toEqual([['quick', [['lazy', []]]]]);
	}
});
