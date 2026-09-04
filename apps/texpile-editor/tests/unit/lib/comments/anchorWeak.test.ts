import { describe, it, expect } from 'vitest';
import { buildAnchor, resolveAnchor } from '$lib/comments/anchor';

const SENTENCE = 'The model fails on long inputs.';

describe('weak placement', () => {
	// two copies of one sentence, each with its own neighbours; the commented copy gets rewritten
	it('a thread whose own copy was rewritten lands on the other copy, flagged', () => {
		const doc = `Alpha opens.\n\n${SENTENCE}\n\nBeta filler sits between.\n\n${SENTENCE}\n\nGamma closes.\n`;
		const first = doc.indexOf(SENTENCE);
		const a = buildAnchor(doc, first, first + SENTENCE.length);
		const edited = doc.replace(SENTENCE, 'The model breaks on long inputs.');
		const hit = resolveAnchor(edited, a);
		expect(hit?.from).toBe(edited.indexOf(SENTENCE));
		expect(hit?.weak).toBe(true);
	});

	it('a paragraph moved whole keeps its surroundings and is not flagged', () => {
		const para = `Some words before it. ${SENTENCE} And some after it.`;
		const doc = `A short intro.\n\n${para}\n\nA much longer closing paragraph.\n`;
		const at = doc.indexOf(SENTENCE);
		const a = buildAnchor(doc, at, at + SENTENCE.length);
		// different lengths either side, so the offsets really do move
		const moved = `A much longer closing paragraph.\n\n${para}\n\nA short intro.\n`;
		const hit = resolveAnchor(moved, a);
		expect(hit?.from).toBe(moved.indexOf(SENTENCE));
		expect(hit?.exact).toBe(false);
		expect(hit?.weak).toBe(false);
	});
});
