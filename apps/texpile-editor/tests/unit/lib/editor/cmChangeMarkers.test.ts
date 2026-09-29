// @vitest-environment jsdom
import { it, expect, afterEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
	cmChangeMarkers,
	setChangeBaseline,
	changedLines,
	nextChange,
	previousChange,
	revertChangeAt,
	changePeek,
	setChangePeek
} from '$lib/editor/source/cmChangeMarkers';

const LINES = ['One.', 'Two.', 'Three.', 'Four.', 'Five.', 'Six.', 'Seven.', 'Eight.', 'Nine.', 'Ten.'];
const BASE = [...LINES, ''].join('\n');

const views: EditorView[] = [];
afterEach(() => {
	for (const v of views.splice(0)) v.destroy();
});

function mount(doc: string, base: string | null = BASE): EditorView {
	const view = new EditorView({ parent: document.body, state: EditorState.create({ doc, extensions: [cmChangeMarkers()] }) });
	views.push(view);
	view.dispatch({ effects: setChangeBaseline.of(base) });
	return view;
}

it('marks added, changed and removed lines against the last version', () => {
	// line 2 reworded, Five removed, a new line after Nine
	const now = ['One.', 'Two, reworded.', 'Three.', 'Four.', 'Six.', 'Seven.', 'Eight.', 'Nine.', 'Nine and a half.', 'Ten.', ''];
	const view = mount(now.join('\n'));
	expect(changedLines(view.state)).toEqual([
		{ kind: 'modified', from: 2, to: 2 },
		{ kind: 'removed', from: 5, to: 5 },
		{ kind: 'added', from: 9, to: 9 }
	]);
	expect(view.dom.querySelectorAll('.cm-change-modified')).toHaveLength(1);
	expect(view.dom.querySelectorAll('.cm-change-added')).toHaveLength(1);
	expect(view.dom.querySelectorAll('.cm-change-removed')).toHaveLength(1);
});

it('follows typing, and clears when the text matches the version again', () => {
	const view = mount(BASE);
	expect(changedLines(view.state)).toEqual([]);
	view.dispatch({ changes: { from: 0, insert: 'Zero.\n' } });
	expect(changedLines(view.state)).toEqual([{ kind: 'added', from: 1, to: 1 }]);
	view.dispatch({ changes: { from: 0, to: 'Zero.\n'.length } });
	expect(changedLines(view.state)).toEqual([]);
});

it('draws nothing without a saved version', () => {
	const view = mount('Anything.\n', null);
	expect(changedLines(view.state)).toEqual([]);
	expect(view.dom.querySelector('.cm-change-mark')).toBeNull();
});

it('goes to the next and previous change, wrapping round', () => {
	const view = mount(
		['One.', 'Two, reworded.', 'Three.', 'Four.', 'Five.', 'Six.', 'Seven, reworded.', 'Eight.', 'Nine.', 'Ten.', ''].join('\n')
	);
	const line = () => view.state.doc.lineAt(view.state.selection.main.head).number;
	expect(nextChange(view)).toBe(true);
	expect(line()).toBe(2);
	nextChange(view);
	expect(line()).toBe(7);
	nextChange(view);
	expect(line()).toBe(2);
	previousChange(view);
	expect(line()).toBe(7);
	expect(nextChange(mount(BASE))).toBe(false);
});

// VS Code's Revert Change: one change put back as it was, leaving every other edit alone
it('puts one change back as it was in the last version, as its own undo step', () => {
	const now = ['One.', 'Two, reworded.', 'Three.', 'Four.', 'Six.', 'Seven.', 'Eight.', 'Nine.', 'Nine and a half.', 'Ten.', ''];
	const view = mount(now.join('\n'));
	const line = (n: number) => view.state.doc.line(n).from;

	view.dispatch(revertChangeAt(view.state, line(2))!);
	expect(view.state.doc.line(2).text).toBe('Two.');
	expect(changedLines(view.state).map((c) => c.kind)).toEqual(['removed', 'added']);

	// removed lines come back above the line they were taken from in front of
	view.dispatch(revertChangeAt(view.state, line(5))!);
	expect(view.state.doc.line(5).text).toBe('Five.');

	view.dispatch(revertChangeAt(view.state, line(10))!);
	expect(view.state.doc.toString()).toBe(BASE);
	expect(revertChangeAt(view.state, 0)).toBeNull();
});

it('puts back a change at the very end of a file with no final line break', () => {
	const view = mount('One.\nTwo.\nExtra', 'One.\nTwo.');
	view.dispatch(revertChangeAt(view.state, view.state.doc.length)!);
	expect(view.state.doc.toString()).toBe('One.\nTwo.');
});

it('opens what a change was from its mark, with Undo this change', () => {
	const now = ['One.', 'Two, reworded.', ...LINES.slice(2), ''];
	const view = mount(now.join('\n'));
	// jsdom lays nothing out, so every height is line 1's: point the click at line 2 by hand
	view.lineBlockAtHeight = () => view.lineBlockAt(view.state.doc.line(2).from);
	const mark = view.dom.querySelector<HTMLElement>('.cm-change-modified')!;
	const click = () => mark.parentElement!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
	click();
	expect(view.state.field(changePeek)).toBe(view.state.doc.line(2).from);
	expect(view.dom.querySelector('.cm-change-peek-old')?.textContent).toBe('Two.');
	click();
	expect(view.state.field(changePeek)).toBeNull();
	click();

	view.dom.querySelector<HTMLButtonElement>('.cm-change-peek-undo')!.click();
	expect(view.state.doc.toString()).toBe(BASE);
	expect(view.state.field(changePeek)).toBeNull();
	expect(view.dom.querySelector('.cm-change-peek')).toBeNull();
});

it('marks lines typed after the closing blank line as added, and peeks them as new', () => {
	// BASE ends in a newline, so its last line is blank; that blank line is still there, above the new ones
	const view = mount([...LINES, '', 'Eleven.', 'Twelve.'].join('\n'));
	expect(changedLines(view.state)).toEqual([{ kind: 'added', from: 12, to: 13 }]);
	view.dispatch({ effects: setChangePeek.of(view.state.doc.line(12).from) });
	expect(view.dom.querySelector('.cm-change-peek-none')).not.toBeNull();
	expect(view.dom.querySelector('.cm-change-peek-old')).toBeNull();
});

it('says a new line was not there before, and closes when the file is back as it was', () => {
	const view = mount(`Zero.\n${BASE}`);
	view.dispatch({ effects: setChangePeek.of(0) });
	expect(view.dom.querySelector('.cm-change-peek-none')).not.toBeNull();
	view.dispatch({ changes: { from: 0, to: 6 } });
	expect(view.state.field(changePeek)).toBeNull();
});

// a read-only editor is set up without the change marks, and the palette's change commands still
// ask it for its changes
it('answers "no changes" for an editor without the change marks', () => {
	const state = EditorState.create({ doc: 'Read only.\n' });
	expect(changedLines(state)).toEqual([]);
	expect(revertChangeAt(state, 0)).toBeNull();
});
