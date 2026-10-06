import { it, expect, afterEach } from 'vitest';
import * as Y from 'yjs';
import { createFileUndo, markDecision } from '$lib/buffers/fileUndo';
import { onDecisionStep, type DecisionStep } from '$lib/comments/decisionHistory';
import { EDIT_ORIGIN } from '$lib/collab/sharedFiles';

let steps: DecisionStep[] = [];
let off = onDecisionStep((s) => steps.push(s));
afterEach(() => {
	off();
	steps = [];
	off = onDecisionStep((s) => steps.push(s));
});

// an Accept sits in the file's history like any edit: typing after it comes off first, and the text is never touched
it('replays a decision through undo and redo as a step of its own', () => {
	const doc = new Y.Doc();
	const text = doc.getText('f:main.tex');
	text.insert(0, 'hi');
	const um = createFileUndo(text, 'main.tex');
	markDecision(um, 7);
	doc.transact(() => text.insert(2, '!'), EDIT_ORIGIN);

	um.undo();
	expect([text.toString(), steps]).toEqual(['hi', []]);
	um.undo();
	expect([text.toString(), steps]).toEqual(['hi', [{ seq: 7, undone: true }]]);
	um.redo();
	expect(steps.at(-1)).toEqual({ seq: 7, undone: false });
	um.undo();
	expect(steps.at(-1)).toEqual({ seq: 7, undone: true });
});
