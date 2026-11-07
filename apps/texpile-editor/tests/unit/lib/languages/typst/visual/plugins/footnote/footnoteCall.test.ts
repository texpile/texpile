import { describe, expect, it } from 'vitest';
import { readFootnote, writeFootnote } from '$lib/languages/typst/visual/plugins/footnote/footnoteCall';

describe('footnotes', () => {
	it('reads and writes the note, and waits for a bracket to close', () => {
		expect(readFootnote('#footnote[A *note*]')).toEqual({ note: 'A *note*' });
		expect(readFootnote('#footnote(numbering: "*")[x]')).toEqual({ note: 'x' });
		expect(readFootnote('#footnote(<fn>)')).toBeNull();
		expect(writeFootnote('#footnote(numbering: "*")[x]', 'y [z]')).toBe('#footnote(numbering: "*")[y [z]]');
		expect(writeFootnote('#footnote[x]', 'an open [bracket')).toBeNull();
	});
});
