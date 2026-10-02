// @vitest-environment jsdom
import { it, expect, afterEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, undo } from '@codemirror/commands';
import {
	cmConflicts,
	conflictBlocks,
	chooseConflict,
	chooseAllConflicts,
	nextConflict,
	previousConflict,
	endMerge
} from '$lib/editor/source/cmConflicts';

const DOC = ['Intro.', '<<<<<<< HEAD', 'My line.', '=======', 'Their line.', '>>>>>>> origin/main', 'Outro.', ''].join('\n');

const views: EditorView[] = [];
afterEach(() => {
	for (const v of views.splice(0)) v.destroy();
});

function mount(doc = DOC): EditorView {
	const view = new EditorView({ parent: document.body, state: EditorState.create({ doc, extensions: [history(), cmConflicts()] }) });
	views.push(view);
	return view;
}

it('offers the three choices above each place, and names both sides', () => {
	const view = mount();
	const bars = view.dom.querySelectorAll('.cm-conflict-bar');
	expect(bars).toHaveLength(1);
	expect([...bars[0].querySelectorAll('button')].map((b) => b.textContent)).toEqual([
		'Accept Current Change',
		'Accept Incoming Change',
		'Accept Both Changes'
	]);
	expect(view.dom.querySelector('.cm-conflict-label-mine')?.textContent).toBe('(Current Change)');
	expect(view.dom.querySelector('.cm-conflict-label-theirs')?.textContent).toBe('origin/main (Incoming Change)');
	expect(view.dom.querySelectorAll('.cm-conflict-mine')).toHaveLength(1);
	expect(view.dom.querySelectorAll('.cm-conflict-theirs')).toHaveLength(1);
});

it('replaces the whole place with the chosen side when a button is clicked', () => {
	const view = mount();
	const theirs = view.dom.querySelector<HTMLButtonElement>('.cm-conflict-choice-theirs')!;
	theirs.click();
	expect(view.state.doc.toString()).toBe('Intro.\nTheir line.\nOutro.\n');
	expect(view.state.field(conflictBlocks)).toEqual([]);
	expect(view.dom.querySelector('.cm-conflict-bar')).toBeNull();
});

it('makes each choice its own undo step, which brings the markers back', () => {
	const view = mount();
	view.dispatch({ changes: { from: 0, insert: 'Typed. ' }, userEvent: 'input.type' });
	const [block] = view.state.field(conflictBlocks);
	view.dispatch(chooseConflict(view.state, block, 'both'));
	expect(view.state.doc.toString()).toBe('Typed. Intro.\nMy line.\nTheir line.\nOutro.\n');

	undo(view);
	expect(view.state.doc.toString()).toBe(`Typed. ${DOC}`);
	expect(view.state.field(conflictBlocks)).toHaveLength(1);
});

it('follows a place that moved since its bar was drawn', () => {
	const view = mount();
	view.dispatch({ changes: { from: 0, insert: 'A new first paragraph.\n\n' } });
	view.dom.querySelector<HTMLButtonElement>('.cm-conflict-choice-mine')!.click();
	expect(view.state.doc.toString()).toBe('A new first paragraph.\n\nIntro.\nMy line.\nOutro.\n');
});

it('draws nothing in a file with no marked places', () => {
	const view = mount('Just text.\n=======\n');
	expect(view.state.field(conflictBlocks)).toEqual([]);
	expect(view.dom.querySelector('.cm-conflict-bar')).toBeNull();
});

const TWO = `${DOC}Middle.\n<<<<<<< HEAD\nA\n=======\nB\n>>>>>>> origin/main\nEnd.\n`;

it('settles every place the same way at once, as one undo step', () => {
	const view = mount(TWO);
	view.dispatch(chooseAllConflicts(view.state, 'theirs')!);
	expect(view.state.doc.toString()).toBe('Intro.\nTheir line.\nOutro.\nMiddle.\nB\nEnd.\n');
	undo(view);
	expect(view.state.doc.toString()).toBe(TWO);
	expect(chooseAllConflicts(mount('No places.\n').state, 'mine')).toBeNull();
});

it('goes from one place to the next and back, wrapping round', () => {
	const view = mount(TWO);
	const [first, second] = view.state.field(conflictBlocks);
	nextConflict(view);
	expect(view.state.selection.main.head).toBe(first.from);
	nextConflict(view);
	expect(view.state.selection.main.head).toBe(second.from);
	nextConflict(view);
	expect(view.state.selection.main.head).toBe(first.from);
	previousConflict(view);
	expect(view.state.selection.main.head).toBe(second.from);
});

it('marks the words that differ between the two sides, and not the ones they share', () => {
	const view = mount('<<<<<<< HEAD\nThe engine weaves flowers and leaves.\n=======\nThe engine weaves flowers and lattices.\n>>>>>>> b\n');
	const mine = [...view.dom.querySelectorAll('.cm-conflict-differs-mine')].map((e) => e.textContent).join('');
	const theirs = [...view.dom.querySelectorAll('.cm-conflict-differs-theirs')].map((e) => e.textContent).join('');
	expect(mine).toContain('leaves');
	expect(theirs).toContain('lattices');
	expect(mine).not.toContain('engine');
	expect(theirs).not.toContain('flowers');
});

// a place settled by hand with one marker line missed: Complete Merge refuses the file, so the
// line left behind is marked where it is
it('marks a marker line left behind when a place is settled by hand', () => {
	// a line of seven = in a file that never held a conflict is the author's text
	const plain = mount(['Title', '=======', 'Text.', ''].join('\n'));
	expect(plain.dom.querySelectorAll('.cm-conflict-stray')).toHaveLength(0);

	const view = mount();
	expect(view.dom.querySelectorAll('.cm-conflict-stray')).toHaveLength(0); // a whole place's lines are its own
	// the author deletes the <<<<<<< line by hand and misses the other two
	const open = view.state.doc.line(2);
	view.dispatch({ changes: { from: open.from, to: open.to + 1 } });
	expect(view.state.field(conflictBlocks)).toHaveLength(0);
	const stray = [...view.dom.querySelectorAll('.cm-conflict-stray')].map((l) => l.textContent);
	expect(stray).toEqual(['=======', '>>>>>>> origin/main']);
});

// Finish combining saved the merge with the file open in the source editor: a Markdown heading's
// seven = underline is the author's text again
it('stops marking lines once the merge is saved', () => {
	const view = mount('Methods\n=======\n\n<<<<<<< HEAD\nMine.\n=======\nTheirs.\n>>>>>>> origin/main\n');
	view.dispatch(chooseConflict(view.state, view.state.field(conflictBlocks)[0], 'both'));
	expect([...view.dom.querySelectorAll('.cm-conflict-stray')].map((l) => l.textContent)).toEqual(['=======']);
	view.dispatch({ effects: endMerge.of(null) });
	expect(view.dom.querySelectorAll('.cm-conflict-stray')).toHaveLength(0);
});

it('marks the base marker of a diff3 place left behind', () => {
	const view = mount('Intro.\n<<<<<<< HEAD\nMine.\n||||||| base\nBase.\n=======\nTheirs.\n>>>>>>> origin/main\n');
	// mine kept by hand: the <<<<<<< line, and ======= through >>>>>>>, deleted
	const divider = view.state.doc.line(6);
	view.dispatch({
		changes: [
			{ from: view.state.doc.line(2).from, to: view.state.doc.line(3).from },
			{ from: divider.from, to: view.state.doc.length }
		]
	});
	expect(view.state.doc.toString()).toBe('Intro.\nMine.\n||||||| base\nBase.\n');
	const stray = [...view.dom.querySelectorAll('.cm-conflict-stray')].map((l) => l.textContent);
	expect(stray).toEqual(['||||||| base']);
});
