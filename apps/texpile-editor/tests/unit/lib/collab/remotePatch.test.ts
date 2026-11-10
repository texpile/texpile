// @vitest-environment jsdom
import { it, expect, afterEach } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { parseLatexFile, serializeLatexFileDetailed } from '$lib/workspace/latexRoundtrip';
import { applyRemotePatch } from '$lib/collab/remotePatch';
import { parseCarryPlugin } from '$lib/editor/visual/parseCarry';

const SOURCE =
	'\\documentclass{article}\n\\begin{document}\nAn opening line.\n\nA line between.\n\nWe prove the estimator is sharp.\n\nAway from a shock the grid resolves the flow.\n\\end{document}\n';

let view: EditorView | null = null;
afterEach(() => {
	view?.destroy();
	view = null;
});

/** a space typed after "We prove", so the paragraph briefly holds two in a row, and the text it serializes to */
function typedSpace() {
	const parsed = parseLatexFile(SOURCE);
	let at = 1 + parsed.doc.child(2).textContent.indexOf(' the estimator');
	for (let i = 0; i < 2; i++) at += parsed.doc.child(i).nodeSize;
	const state = EditorState.create({ doc: parsed.doc, selection: TextSelection.create(parsed.doc, at), plugins: [parseCarryPlugin] });
	view = new EditorView(document.body.appendChild(document.createElement('div')), { state });
	view.dispatch(view.state.tr.insertText(' '));
	const local = serializeLatexFileDetailed(parsed, view.state.doc);
	expect(local.text).toContain('We prove  the');
	return { view, local };
}

/** the collaborator's text patched in, and what the editor writes out from then on: anything but that
 *  text is a change its next keystroke hands the shared doc */
function landRemote(v: EditorView, local: { text: string; map: ReturnType<typeof serializeLatexFileDetailed>['map'] }, next: string) {
	const parsed = parseLatexFile(next);
	applyRemotePatch(v, parsed.doc, local.map, parsed.map, parsed.origins, local.text, next);
	return serializeLatexFileDetailed(parsed, v.state.doc).text;
}

const typedSoFar = (v: EditorView) => v.state.selection.$head.parent.textBetween(0, v.state.selection.$head.parentOffset);

it('leaves the paragraph being typed in as typed when a collaborator changes another one', () => {
	const { view: v, local } = typedSpace();
	const next = local.text.replace('the grid', 'the coarse grid');
	expect(landRemote(v, local, next)).toBe(next);
	expect(v.state.doc.child(3).textContent).toContain('the coarse grid');
	expect(v.state.doc.child(2).textContent).toBe('We prove  the estimator is sharp.');
	expect(typedSoFar(v)).toBe('We prove ');
});

it("takes only a collaborator's words into the paragraph being typed in", () => {
	const { view: v, local } = typedSpace();
	const next = local.text.replace('sharp.', 'sharp indeed.');
	expect(landRemote(v, local, next)).toBe(next);
	expect(v.state.doc.child(2).textContent).toBe('We prove  the estimator is sharp indeed.');
	expect(typedSoFar(v)).toBe('We prove ');
});

// the parse reads the two spaces as one: a word typed between them took both and wrote a third
it.each([
	['in the paragraph being typed in', 'sharp.', 'sharp indeed.'],
	['in another paragraph', 'the grid', 'the coarse grid']
])('writes a word typed between two spaces once a collaborator changed %s', (_where, from, to) => {
	const { view: v, local } = typedSpace();
	const next = local.text.replace(from, to);
	landRemote(v, local, next);
	v.dispatch(v.state.tr.insertText('our'));
	expect(serializeLatexFileDetailed(parseLatexFile(next), v.state.doc).text).toBe(next.replace('We prove  the', 'We prove our the'));
});

it('takes them in the same way when the same change reached a paragraph further up', () => {
	const { view: v, local } = typedSpace();
	const next = local.text.replace('opening line.', 'opening line, reworded.').replace('sharp.', 'sharp indeed.');
	landRemote(v, local, next);
	expect(v.state.doc.child(0).textContent).toBe('An opening line, reworded.');
	expect(v.state.doc.child(2).textContent).toBe('We prove  the estimator is sharp indeed.');
	expect(typedSoFar(v)).toBe('We prove ');
});

// their space beside one already there reads as one space, which stands for both bytes
it('keeps a word a collaborator types between two spaces of theirs', () => {
	const { view: v, local } = typedSpace();
	const one = local.text.replace('is sharp', 'isa  sharp');
	landRemote(v, local, one);
	const mine = serializeLatexFileDetailed(parseLatexFile(one), v.state.doc);
	expect(mine.text).toBe(one);
	const two = one.replace('isa  sharp', 'isa b sharp');
	expect(landRemote(v, mine, two)).toBe(two);
	expect(v.state.doc.child(2).textContent).toContain('isa b sharp.');
});

// a host cut off from the relay re-parses only its own text, unguarded when its window is in the background
it('writes a word typed between two spaces once the same text was parsed again', () => {
	const { view: v, local } = typedSpace();
	landRemote(v, local, local.text);
	v.dispatch(v.state.tr.insertText('our'));
	expect(serializeLatexFileDetailed(parseLatexFile(local.text), v.state.doc).text).toBe(
		local.text.replace('We prove  the', 'We prove our the')
	);
});

it('writes a word typed between two spaces once a collaborator typed between two spaces of theirs', () => {
	const { view: v, local } = typedSpace();
	const one = local.text.replace('is sharp', 'is  sharp');
	landRemote(v, local, one);
	const mine = serializeLatexFileDetailed(parseLatexFile(one), v.state.doc);
	expect(mine.text).toBe(one);
	const two = one.replace('is  sharp', 'is b sharp');
	landRemote(v, mine, two);
	v.dispatch(v.state.tr.insertText('our'));
	expect(serializeLatexFileDetailed(parseLatexFile(two), v.state.doc).text).toBe(two.replace('We prove  the', 'We prove our the'));
});

it('writes a word typed between two spaces once a collaborator added a paragraph right above', () => {
	const { view: v, local } = typedSpace();
	const next = local.text.replace('We prove', 'Added above.\n\nWe prove');
	landRemote(v, local, next);
	expect(v.state.doc.child(2).textContent).toBe('Added above.');
	v.dispatch(v.state.tr.insertText('our'));
	expect(serializeLatexFileDetailed(parseLatexFile(next), v.state.doc).text).toBe(next.replace('We prove  the', 'We prove our the'));
});

it('keeps the caret before words a collaborator types at the same spot', () => {
	const { view: v, local } = typedSpace();
	const at = local.text.indexOf('We prove  ') + 'We prove '.length;
	landRemote(v, local, local.text.slice(0, at) + 'THEIRS' + local.text.slice(at));
	expect(v.state.doc.child(2).textContent).toBe('We prove THEIRS the estimator is sharp.');
	expect(typedSoFar(v)).toBe('We prove ');
});
