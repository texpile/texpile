import { describe, it, expect } from 'vitest';
import { locateQuote } from '$lib/comments/anchorLocate';

const doc =
	'The first paragraph mentions gravity.\nThe second paragraph mentions gravity too.\nA long sentence that\nwraps across two lines.\n';

describe('locateQuote', () => {
	it('places a unique quote and builds its anchor from the file', () => {
		const r = locateQuote(doc, { quote: 'second paragraph' });
		expect(r.ok && r.anchor.quote).toBe('second paragraph');
		expect(r.ok && r.anchor.prefix.endsWith('gravity.\nThe ')).toBe(true);
	});

	it('reports copies instead of guessing, and lets context or a line pick one', () => {
		const plain = locateQuote(doc, { quote: 'mentions gravity' });
		expect(plain.ok).toBe(false);
		expect(!plain.ok && plain.candidates).toEqual([1, 2]);
		const bySuffix = locateQuote(doc, { quote: 'mentions gravity', suffix: ' too' });
		expect(bySuffix.ok && bySuffix.from).toBe(doc.indexOf('mentions gravity too'));
		const byLine = locateQuote(doc, { quote: 'mentions gravity', line: 1 });
		expect(byLine.ok && byLine.from).toBe(doc.indexOf('mentions gravity'));
	});

	it('finds a quote copied without the line wrap', () => {
		const r = locateQuote(doc, { quote: 'sentence that wraps' });
		expect(r.ok && doc.slice(r.from, r.to)).toBe('sentence that\nwraps');
	});
});
