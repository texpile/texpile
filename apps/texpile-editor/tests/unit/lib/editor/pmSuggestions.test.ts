// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { buildAnchor } from '$lib/comments/anchor';
import { editMode, takeTypedSides, type SuggestionMark } from '$lib/comments/activeSuggestions.svelte';
import { placePmSuggestions } from '$lib/editor/visual/extensions/pmSuggestionsPlace';
import { pmSuggestions, pmSuggestionsKey, setPmSuggestions } from '$lib/editor/visual/extensions/pmSuggestions';
import { goneBlocksElement } from '$lib/editor/visual/extensions/pmSuggestionWidgets';
import { createCursorPlugin } from '$lib/editor/visual/extensions/cursor-plugin';
import { parseLatexFile, parseLatexRegion } from '$lib/workspace/latexRoundtrip';

const SOURCE =
	'Refinement is driven by an estimator.\n\nOn each patch we form the residual $r_j$ by inserting the reconstructed solution.\n';
const parsed = parseLatexFile(SOURCE);

function mark(id: string, words: string, restore: string, at = SOURCE.indexOf(words)): SuggestionMark {
	return { id, from: at, to: at + words.length, restore, mine: false, anchor: buildAnchor(SOURCE, at, at + words.length) };
}

function place(marks: SuggestionMark[]) {
	return placePmSuggestions(parsed.doc, marks, {
		text: SOURCE,
		map: parsed.map,
		body: { from: 0, to: SOURCE.length },
		parse: (src) => parseLatexRegion(src)
	});
}

function mount() {
	const place = document.createElement('div');
	document.body.appendChild(place);
	return new EditorView(place, { state: EditorState.create({ doc: parsed.doc, plugins: [pmSuggestions()] }) });
}

it('draws old and new words in their paragraph, and a changed formula whole', () => {
	const view = mount();
	const end = SOURCE.indexOf('estimator.') + 'estimator.'.length;
	const placed = place([mark('replace', 'driven', 'led'), mark('cut', '', ' It is cheap.', end), mark('formula', 'r_j', 'R_j^n')]);
	setPmSuggestions(view, placed.ranges);

	const [first, second] = [...view.dom.querySelectorAll('p')];
	const drawn = (p: Element, cls: string) => [...p.querySelectorAll(cls)].map((e) => e.textContent);
	expect(drawn(first, '.pm-suggest-new')).toEqual(['driven']);
	expect(drawn(first, '.pm-suggest-old')).toEqual(['led', ' It is cheap.']);
	expect(first.textContent).toBe('Refinement is leddriven by an estimator. It is cheap.');
	expect(second.querySelector('.inline-math')?.classList.contains('pm-suggest-new')).toBe(true);
	expect(second.querySelector('.pm-suggest-was')).not.toBeNull();
	view.destroy();
});

it('tints a formula among typed words, whose source the formula keeps as content', () => {
	const view = mount();
	const second = view.state.doc.child(0).nodeSize + 1;
	const to = second + view.state.doc.child(1).content.size;
	setPmSuggestions(view, [{ id: 'typed', from: second, to, restore: '', old: [], mine: true, partial: false }]);
	expect(view.dom.querySelector('.inline-math')?.classList.contains('pm-suggest-new')).toBe(true);
	view.destroy();
});

it('tints a format change without striking out the words it keeps', () => {
	const view = mount();
	const at = 1 + view.state.doc.child(0).textContent.indexOf('driven');
	const old = [{ text: 'driven', marks: [] }];
	setPmSuggestions(view, [
		{ id: 'f', from: at, to: at + 'driven'.length, restore: 'driven', old, mine: true, partial: false, format: true }
	]);
	expect([...view.dom.querySelectorAll('.pm-suggest-new')].map((e) => e.textContent)).toEqual(['driven']);
	expect(view.dom.querySelector('.pm-suggest-old')).toBeNull();
	view.destroy();
});

it('puts what is typed in front of old words when the arrow key put the caret there', () => {
	editMode.current = 'suggesting';
	const view = mount();
	const text = view.state.doc.child(0).textContent;
	const at = 1 + text.indexOf('driven');
	setPmSuggestions(view, [
		{ id: 'r', from: at, to: at + 'driven'.length, restore: 'led', old: [{ text: 'led', marks: [] }], mine: true, partial: false }
	]);
	view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
	takeTypedSides();

	const pressed = view.someProp('handleKeyDown', (f) => f(view, new KeyboardEvent('keydown', { key: 'ArrowLeft' })));
	expect(pressed).toBe(true);
	expect(view.state.selection.head).toBe(at);
	view.dispatch(view.state.tr.insertText('mostly ', at));
	const [r] = pmSuggestionsKey.getState(view.state)!.ranges;
	expect(view.state.doc.textBetween(r.from, r.to)).toBe('driven');
	expect(view.dom.querySelector('p')?.textContent).toBe('Refinement is mostly leddriven by an estimator.');
	expect(takeTypedSides()).toEqual({ r: 'before' });
	view.destroy();
});

it('stands the caret before the words a delete has just struck out', () => {
	editMode.current = 'suggesting';
	const view = mount();
	const end = 1 + 'Refinement is driven by an estimator.'.length;
	view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, end)));
	view.dispatch(view.state.tr.delete(end - 1, end));
	expect(pmSuggestionsKey.getState(view.state)?.caret).toEqual({ at: end - 1, side: 'before' });
	// typing is not a delete, and leaves the side to whatever the caret already said
	view.dispatch(view.state.tr.insertText('x', end - 1));
	expect(pmSuggestionsKey.getState(view.state)?.caret).toEqual({ at: end, side: 'before' });
	view.destroy();
});

// two Deletes that land on one rendered spot (either side of a mark's edge, say) have to be drawn in
// the order the file holds them, or the reader reads a before/after that is not the change
it('draws two Deletes at one spot in the order the file holds them', () => {
	const view = mount();
	const at = SOURCE.indexOf('driven');
	const placed = place([mark('first', '', 'one ', at), mark('second', '', 'two ', at)]);
	setPmSuggestions(view, placed.ranges);
	const p = view.dom.querySelector('p')!;
	expect([...p.querySelectorAll('.pm-suggest-old')].map((e) => e.textContent)).toEqual(['one ', 'two ']);
	expect(p.textContent).toBe('Refinement is one two driven by an estimator.');
	view.destroy();
});

it('draws old words with the marks they had, one span a character for the line breaker', () => {
	const view = mount();
	const at = SOURCE.indexOf('driven');
	const src = 'Refinement is \\textbf{led} by an estimator.\n';
	const bold = parseLatexRegion(src).doc;
	const strong = bold.child(0).child(1).marks;
	setPmSuggestions(view, [
		{ id: 'b', from: 1 + at, to: 1 + at, restore: '\\textbf{led}', old: [{ text: 'led', marks: strong }], mine: false, partial: false }
	]);
	const old = view.dom.querySelector('.pm-suggest-old')!;
	expect(old.querySelector('strong')).not.toBeNull();
	expect([...old.querySelectorAll('[data-i]')].map((e) => e.getAttribute('data-i'))).toEqual(['0', '1', '2']);
	view.destroy();
});

// a selection over struck words lays its colour over theirs; it used to write its own into the variable
// the words carry theirs in, and taking it away again left them with none
it('keeps struck words in their own tint while a selection crosses them and after', () => {
	const host = document.body.appendChild(document.createElement('div'));
	const view = new EditorView(host, { state: EditorState.create({ doc: parsed.doc, plugins: [pmSuggestions(), createCursorPlugin()] }) });
	setPmSuggestions(view, place([mark('replace', 'driven', 'led')]).ranges);
	const old = view.dom.querySelector<HTMLElement>('.pm-suggest-old')!;
	const own = old.style.getPropertyValue('--range-tint');
	expect(own).toContain('--diff-delete-tint');

	view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2, 30)));
	expect(old.classList.contains('pm-range-selected')).toBe(true);
	expect(old.style.getPropertyValue('--range-tint')).toBe(own);

	view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)));
	expect(old.classList.contains('pm-range-selected')).toBe(false);
	expect(old.style.getPropertyValue('--range-tint')).toBe(own);
	view.destroy();
});

// a Delete of `restore` at the end of `words`, drawn in a view of `source`
function drawnCut(source: string, words: string, restore: string) {
	const at = source.indexOf(words) + words.length;
	const file = parseLatexFile(source);
	const s = { id: 'cut', from: at, to: at, restore, mine: true, anchor: buildAnchor(source, at, at) };
	const { ranges } = placePmSuggestions(file.doc, [s], {
		text: source,
		map: file.map,
		body: { from: 0, to: source.length },
		parse: (src) => parseLatexRegion(src)
	});
	const view = new EditorView(document.body.appendChild(document.createElement('div')), {
		state: EditorState.create({ doc: file.doc, plugins: [pmSuggestions()] })
	});
	setPmSuggestions(view, ranges);
	return view;
}

// Louis's screenshot: the end of the first item drawn as a line of the block, the last item's words as
// another, and under the block an empty line the caret could be put on
it('strikes the words cut from an item in its line and stands the items taken whole after it', () => {
	const view = drawnCut(
		'\\begin{itemize}\n\\item Paragraphs wra\n\\end{itemize}\n\n\\begin{enumerate}\n\\item First, open the folder.\n\\end{enumerate}\n',
		'Paragraphs wra',
		'pped by hand.\n\\item Inline math such as $E = mc^2$.\n\\item A table, a link and a quotation.'
	);
	const first = view.dom.querySelector('p')!;
	expect(first.querySelector('.pm-suggest-old')?.textContent).toBe('pped by hand.');
	const gone = view.dom.querySelector('.pm-suggest-gone')!;
	expect(gone.parentElement).toBe(view.dom);
	const items = [...gone.querySelectorAll('.prosemirror-flat-list')];
	expect(items.map((item) => item.querySelector('[role=math]')?.getAttribute('aria-label') ?? item.textContent)).toEqual([
		'E = mc^2',
		'A table, a link and a quotation.'
	]);
	expect(gone.previousElementSibling?.textContent).toBe('Paragraphs wrapped by hand.');
	view.destroy();
});

// Docs style: until it is decided, the cut leaves each end on the line it was on, with the items it took
// whole between them where they stood
it('keeps each end of a cut on its own line with the items taken whole between them', () => {
	const view = drawnCut(
		'\\begin{itemize}\n\\item Paragraphs wraa link and a quotation.\n\\end{itemize}\n\n\\begin{enumerate}\n\\item First.\n\\end{enumerate}\n',
		'Paragraphs wra',
		'pped by hand.\n\\item Inline math.\n\\item A table, '
	);
	const first = view.dom.querySelector('p')!;
	const drawn = [...first.querySelectorAll('.pm-suggest-old, .pm-suggest-break-removed')].filter(
		(e) => !e.parentElement?.closest('.pm-suggest-gone')
	);
	expect(
		drawn.map((e) =>
			e.classList.contains('pm-suggest-gone') ? `[${e.textContent}]` : e.classList.contains('pm-suggest-break') ? '|' : e.textContent
		)
	).toEqual(['pped by hand.', '|', '[Inline math.]', 'A table, ']);
	expect(first.querySelector('.pm-suggest-gone')?.hasAttribute('data-line-end')).toBe(true);
	view.destroy();
});

it('ends the line a removed paragraph break ended, after the bar', () => {
	const view = drawnCut('First paragraph.Second paragraph.\n', 'First paragraph.', '\n\n');
	const p = view.dom.querySelector('p')!;
	const bar = p.querySelector('.pm-suggest-break-removed')!;
	expect(bar).not.toBeNull();
	expect(bar.nextElementSibling?.matches('br[data-line-end]')).toBe(true);
	view.destroy();
});

it('draws a table taken out as a table and a formula as the formula', () => {
	const { doc } = parseLatexFile('\\begin{tabular}{ll}\na & b \\\\\n\\end{tabular}\n\n\\[ x^2 \\]\n');
	const drawn = goneBlocksElement(doc.type.schema, [doc.child(0), doc.child(1)], 'x', false);
	expect([...drawn.querySelectorAll('table td')].map((td) => td.textContent)).toEqual(['a', 'b']);
	expect(drawn.querySelector('[role=math]')?.getAttribute('aria-label')).toBe('x^2');
});

it('draws a struck include as the text its chip shows', () => {
	const { doc } = parseLatexFile('\\input{intro}\n\n\\include{related}\n');
	const blocks = [doc.child(0), doc.child(1)];
	expect(goneBlocksElement(doc.type.schema, blocks, 'x', false).textContent).toBe('\\input{intro}\\include{related}');
});

// a paragraph taken out just before a formula that also changed stood before the formula, as it was
it('stands a block taken out before the formula after it as it was', () => {
	const source = 'Before.\n\n\\[\nx+1 = 0\n\\]\n';
	const formula = source.indexOf('\\[');
	const file = parseLatexFile(source);
	const quote = source.slice(formula, source.indexOf('\\]') + 2);
	const s = {
		id: 'cut',
		from: formula,
		to: formula + quote.length,
		restore: 'Gone words.\n\n\\[\nx+1\n\\]',
		mine: true,
		anchor: buildAnchor(source, formula, formula + quote.length)
	};
	const { ranges } = placePmSuggestions(file.doc, [s], {
		text: source,
		map: file.map,
		body: { from: 0, to: source.length },
		parse: (src) => parseLatexRegion(src)
	});
	const view = new EditorView(document.body.appendChild(document.createElement('div')), {
		state: EditorState.create({ doc: file.doc, plugins: [pmSuggestions()] })
	});
	setPmSuggestions(view, ranges);
	const old = [...view.dom.querySelectorAll('.pm-suggest-gone, .pm-suggest-was')];
	expect(
		old.map((e) => (e.classList.contains('pm-suggest-gone') ? e.textContent : e.querySelector('[role=math]')?.getAttribute('aria-label')))
	).toEqual(['Gone words.', 'x+1']);
	view.destroy();
});
