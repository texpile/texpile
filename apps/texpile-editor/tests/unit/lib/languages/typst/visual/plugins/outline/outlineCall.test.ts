import { describe, expect, it } from 'vitest';
import { readOutline, writeOutline } from '$lib/languages/typst/visual/plugins/outline/outlineCall';

describe('outlines', () => {
	it('reads what it lists, its title and its depth', () => {
		expect(readOutline('#outline()')).toEqual({ shows: 'headings', title: { kind: 'auto' }, depth: null });
		expect(readOutline('#outline(title: [Contents], depth: 2)')).toEqual({
			shows: 'headings',
			title: { kind: 'written', text: 'Contents', quoted: false },
			depth: 2
		});
		expect(readOutline('#outline(title: none, target: figure.where(kind: image))')).toMatchObject({
			shows: 'figures',
			title: { kind: 'none' }
		});
		expect(readOutline('#outline(target: figure.where(kind: table))')?.shows).toBe('tables');
		expect(readOutline('#outline(target: figure.where(kind: raw))')?.shows).toBe('other');
		expect(readOutline('#outline(title: t)')).toBeNull();
	});

	it('writes each setting and keeps the arguments it has none for', () => {
		const source = '#outline(indent: auto, depth: 2)';
		expect(writeOutline(source, { depth: 3 })).toBe('#outline(indent: auto, depth: 3)');
		expect(writeOutline(source, { depth: null })).toBe('#outline(indent: auto)');
		expect(writeOutline(source, { shows: 'figures' })).toBe('#outline(indent: auto, depth: 2, target: figure.where(kind: image))');
		expect(writeOutline('#outline(target: figure.where(kind: image))', { shows: 'headings' })).toBe('#outline()');
		expect(writeOutline('#outline()', { title: { kind: 'written', text: 'Inhalt', quoted: false } })).toBe('#outline(title: [Inhalt])');
		expect(writeOutline('#outline(title: "Inhalt")', { title: { kind: 'written', text: 'Inhalt 2', quoted: true } })).toBe(
			'#outline(title: "Inhalt 2")'
		);
		expect(writeOutline('#outline(title: [Inhalt])', { title: { kind: 'auto' } })).toBe('#outline()');
		expect(writeOutline('#outline()', { title: { kind: 'written', text: 'a [b', quoted: false } })).toBeNull();
	});
});
